# Decisões

Cada decisão com data, quem decidiu e o motivo.

## 26/10/2026

- **Fase 1 com escopo completo, sem cortes.** JP. Motivo: o produto precisa estar completo para a piloto e para as próximas clientes da rede dela.
- **Integração real com a Meta adiada.** JP. Motivo: a conta da nexo na Meta está travada (pagamento, perfil, verificação) e a nexo não tem CNPJ. O robô fala com uma interface de canal; o adaptador da Cloud API entra depois.
- **Piloto: estúdio de cílios, só a dona com login, usando o número atual dela.** JP. Motivo: todas as clientes dela já estão nesse número.
- **Prisma com Postgres próprio (sem Supabase).** JP. Motivo: stack conhecida e sem depender de um fornecedor.
- **Monólito modular em NestJS + pacote `core` puro.** Proposto e aprovado. Motivo: microsserviços não se pagam com 1 cliente; regras puras são testáveis sem banco nem Meta.
- **Fila no Postgres (pg-boss), sem Redis na Fase 1.** Motivo: um serviço a menos para pagar e cuidar.
- **SSE na Fase 1 para tempo real; WebSocket na Fase 4.** Motivo: a agenda só recebe atualização.
- **Sessão guardada no servidor em vez de JWT.** Motivo: trocar a senha derruba todas as sessões (SEGURANCA.md).
- **Arquitetura de segurança aprovada.** JP. Ver SEGURANCA.md, seção 3.

## E1 (esqueleto)

- **NestJS 12 e TypeScript 6.0.** O NestJS 12 é só ESM, então a API usa `"type": "module"`. O TypeScript 7 (compilador novo) ainda não é aceito pelo typescript-eslint; ficamos no 6.0.
- **Vitest em todo o monorepo**, com SWC na API para os decorators do NestJS.
- **Prisma entra na E2**, junto com o modelo de dados. Na E1, o `/health` usa o driver `pg` direto.
- **Prisma 7.10 (estável), não o 8 (release candidate).** Será instalado na E2.
- **Fontes servidas pelo próprio painel (@fontsource)**, sem chamar o Google Fonts. Motivo: menos dado de visitante saindo para terceiros e CSP mais simples.
- **`multer` forçado para 2.5.0** (via `overrides`). Motivo: a versão que vem com o NestJS 12.2 tem uma vulnerabilidade alta (GHSA-q7qp-rjg7-q26m).
- **Logo:** os 4 SVGs oficiais ficam em `apps/web/src/assets/brand`, sem alteração. No painel, o logo vai inline (`components/Brand.tsx`, mesmo desenho) para o "nexo" usar a Sora carregada pela página. O ícone do app é o símbolo oficial.

## E2 (banco multi-negócio)

- **RLS por transação:** `withTenant` abre uma transação e define `app.tenant_id` com `set_config(..., true)`, que vale só dentro dela. Escolhido em vez de extensão automática do Prisma Client para deixar explícito, no código, onde o negócio entra.
- **Dois papéis no Postgres:** o dono das tabelas (só migrações) e `nexo_app` (aplicação), criado pela migração sem login, sem superusuário e sem `BYPASSRLS`. A senha do `nexo_app` nunca fica em migração: localmente vem do `.env` via `db:setup-local`; em produção, do cofre do provedor.
- **RLS forçado (`FORCE ROW LEVEL SECURITY`)** em todas as tabelas de negócio, para valer até para o dono das tabelas.
- **`users` sem RLS por negócio:** o login acontece antes de saber o negócio. Só o módulo de autenticação lê essa tabela.
- **Horário duplo barrado pelo banco** com restrição de exclusão (`btree_gist`) sobre profissional + faixa de horário, só para status ativos (marcado e confirmado). Cancelado, realizado e faltou não bloqueiam.
- **Auditoria só de inclusão:** `nexo_app` não tem `UPDATE`, `DELETE` nem `TRUNCATE` em `audit_logs`.
- **Modelos de etapas por nicho em `@nexo/core`.** Cílios, salão, barbearia e estúdio usam: Novo contato, Pediu informação, Agendou, Atendido, Voltou, Não seguiu. Os outros nichos usam o funil padrão.
- **Seed** com "Estúdio Exemplo (demo)" e "Barbearia Teste (demo)", telefones com DDD 00 (inexistente) para nunca coincidir com número real.

## E3 (disponibilidade e agendamento)

- **Regras de horário livre em `@nexo/core`, sem banco:** um horário só aparece se couber inteiro numa janela de trabalho, não cruzar horário marcado, folga ou bloqueio, e respeitar a antecedência mínima.
- **Padrões a confirmar com a piloto:** horários oferecidos de 30 em 30 minutos e antecedência mínima de 60 minutos. Os dois são parâmetros e vão para a configuração do negócio no onboarding (E9).
- **Fuso sem biblioteca externa:** conversão com a base de fusos do próprio Node (`Intl`), testada com São Paulo, Manaus, Noronha e um fuso com horário de verão.
- **Marcar e remarcar recalculam os horários livres dentro da mesma transação.** Se dois pedidos chegam juntos, o banco barra o segundo (restrição da E2) e o serviço responde "esse horário não está mais livre".
- **Remarcar volta o status para "marcado"**, porque a confirmação era do horário antigo. Prefere a mesma profissional; se ela não estiver livre, passa para outra que faça o serviço.
- **Mudanças de status permitidas:** marcado → confirmado, realizado, faltou ou cancelado; confirmado → realizado, faltou ou cancelado; realizado ↔ faltou (correção do dono); cancelado não muda mais.
- **Cada ação grava um evento** (`appointment.created`, `rescheduled`, `confirmed`, `done`, `no_show`, `cancelled`) com quem fez.
- **Chave estrangeira não passa pelo RLS.** Por isso o agendamento confere, pelo RLS, que a cliente é do mesmo negócio antes de gravar. A correção definitiva veio logo depois (ver abaixo).
- **Sem rotas HTTP ainda.** As rotas da agenda entram com o login (E8), para não existir rota sem autenticação.

## Ligações presas ao negócio (entre E3 e E4)

- **Chaves estrangeiras compostas `(tenant_id, id)`** em todas as relações entre tabelas de negócio, com `ON DELETE RESTRICT`. Motivo: a checagem de chave estrangeira do Postgres ignora o RLS. Com a chave composta, o banco recusa qualquer registro que aponte para outro negócio.
- **Teste de catálogo** em `tenant-isolation.test.ts`: falha se alguma chave estrangeira entre tabelas com `tenant_id` não incluir o `tenant_id` dos dois lados.
- **Criação aninhada no Prisma** (ex.: etapas dentro do funil) herda o `tenant_id` do pai e não aceita o campo repetido.
- A checagem da cliente no agendamento (E3) continua, para devolver uma mensagem clara em vez de erro do banco.

## E4 (robô)

- **Máquina de estados pura em `@nexo/core/bot`.** Recebe estado salvo, mensagem, contexto e "portas" (funções de agenda) e devolve novo estado, respostas e ações. Testada sem banco e sem Meta.
- **Passos:** menu, serviço, profissional (só se houver mais de uma), dia, horário, confirmação, meus horários, remarcar, cancelar, dúvidas, falar com a equipe, "parar".
- **Comandos que valem em qualquer ponto:** "parar"/"sair" (desliga mensagens), "oi"/"menu" (volta ao menu), "cancelar" (abre meus horários), "atendente" (passa para a equipe). Sem acento e sem maiúscula.
- **Quem pediu para parar não recebe nada** até escrever "oi" de novo. O "parar" vem antes de tudo, até do aviso de privacidade.
- **Aviso de privacidade na primeira mensagem**, com texto provisório. O texto final depende do advogado (PENDENCIAS.md).
- **Limites da Cloud API aplicados no código:** até 3 opções com título de até 20 caracteres viram botões; o resto vira lista de até 10 linhas (título de até 24, descrição de até 72), com "Ver mais" para paginar.
- **Texto livre sem IA:** "Não entendi" e a pergunta de novo. Toque em opção de outra tela também conta como não entendido.
- **Mensagens padrão editáveis** (`Tenant.botMessages`), no tom da marca, sempre com próximo passo.
- **IDs vindos do WhatsApp não são confiáveis:** a cliente só remarca e cancela os próprios horários (`bot-ports.ts`).
- **Simulador vai para a E5**, junto com o canal simulado, para exercitar o fluxo completo (contato, conversa, mensagens).

## E5 (canal)

- **Só a API oficial (WhatsApp Cloud API, Graph v25.0).** `MessagingChannel` esconde o canal: o mesmo fluxo roda com a Meta, com o simulador do terminal e nos testes.
- **Webhook responde rápido e enfileira.** Confere a assinatura `X-Hub-Signature-256` no corpo bruto (comparação em tempo constante), valida o formato com limites de tamanho, acha o negócio pelo número (`channel_routes`) e coloca na fila. O robô roda no worker.
- **Formato estranho com assinatura válida recebe 200** e é ignorado, para a Meta não reenviar sem fim. Assinatura inválida recebe 401. Sem `WHATSAPP_APP_SECRET` configurado, o webhook recusa tudo (503).
- **`channel_routes` fora do RLS**, porque o negócio só é conhecido depois de achar a rota. Em troca, a aplicação só lê essa tabela; quem cria rota é a migração ou o script de implantação.
- **Fila no próprio Postgres (pg-boss), sem Redis.** A estrutura é criada por `npm run queue:setup` com o papel dono; a aplicação sobe sem permissão de criar ou migrar nada. Mensagens da mesma pessoa saem da fila uma de cada vez, na ordem.
- **Situação de entrega nunca volta atrás** (enviada → entregue → lida; falhou). Avisos da Meta chegam fora de ordem.
- **Sem token da Meta, as respostas ficam só no histórico** (situação `not_sent`). Assim dá para testar tudo antes de a conta da Meta ser liberada.

## E6 (CRM básico)

- **Uma mensagem, um ciclo** (`ConversationService.handleInbound`): cliente e conversa no CRM, histórico, robô, etapas automáticas, respostas gravadas, envio e aviso ao painel.
- **Cada mensagem é respondida uma vez só.** A mensagem recebida é única por wamid; ela só vira `processed` quando as respostas foram gravadas. Se o processo cair no meio, a fila tenta de novo e continua dali.
- **Gravar antes de enviar.** As respostas são gravadas como `pending` e só depois saem pelo canal. Falha de envio fica marcada (`failed`) sem perder o resto.
- **Etapas automáticas por regras** (`@nexo/core/crm/classification.ts`): primeiro contato → "Novo contato"; dúvida frequente → "Pediu informação"; marcou → "Agendou"; realizado → "Atendido"; segundo realizado → "Voltou". O cartão só anda para frente e "Não seguiu" fica com a dona. Cada etapa tem uma chave fixa (`Stage.key`), então a dona pode renomear sem quebrar as regras.
- **Tempo real só depois do commit**, com avisos sem dado pessoal (tipo + id).
- **Simulador no terminal** (`npm run simulator -w @nexo/api`): conversa com o robô usando o banco local e telefone fictício.
- **Intervalo entre horários e antecedência mínima por negócio** (`Tenant.slotStepMinutes`, `Tenant.minNoticeMinutes`), padrão 30 e 60 minutos até a piloto responder (PENDENCIAS.md).

## E7 (passar para a equipe, "parar", consentimento)

- **"Falar com a equipe" pausa o robô naquela conversa** (`Conversation.botPausedAt`), cria um "A fazer" ("Responder ... no WhatsApp"), grava o evento e avisa o painel. Enquanto pausada, as mensagens da cliente entram no histórico e o robô fica quieto. A dona devolve para o robô pelo painel.
- **Fora do horário**, o robô avisa que a dona responde quando voltar (horário calculado pelas janelas de atendimento ativas).
- **Aviso para a dona pelo WhatsApp fica para depois da E0** (precisa de mensagem de modelo aprovada). Por ora, o aviso é no painel (`OwnerNotifier`).
- **"Parar" grava a recusa** (`Contact.optedOutAt` + `Consent` OPT_OUT); "oi" depois disso grava OPT_IN. O aviso de privacidade mostrado também fica em `Consent`, e só aparece uma vez por cliente.

## E8 (painel do dono)

- **Sessão no servidor, não JWT.** Cookie `nexo_sessao` HttpOnly, SameSite=Strict (Secure em produção) com token aleatório; no banco fica só o hash. Cai com 12 horas sem uso, 7 dias no máximo, no logout ou quando a senha muda.
- **Senha com Argon2id** (19 MiB, 2 passadas). Erro de login sempre genérico; 5 erros seguidos bloqueiam a conta por 15 minutos; 10 tentativas por IP a cada 15 minutos.
- **CSRF:** toda rota que muda dados exige o cabeçalho `x-csrf-token` igual ao da sessão.
- **2FA obrigatório para admin nexo** (código de app autenticador, segredo criptografado com AES-256-GCM). Admin nexo não abre o painel de um negócio; a entrada com motivo fica para a E9.
- **Painel e API na mesma origem** (`/api`): no localhost via proxy do Vite, em produção via proxy do provedor. É o que faz o cookie Strict funcionar.
- **O negócio vem só da sessão.** Nenhuma rota do painel aceita `tenantId`; os testes tentam mandar e confirmam que é ignorado.
- **Tempo real por Server-Sent Events** (`/panel/events`) com avisos sem dado pessoal; entre processos, pelo LISTEN/NOTIFY do Postgres. Por isso o painel atualiza quando a mensagem chega pelo simulador ou pelo worker.
- **Telas:** Hoje (clientes esperando resposta, horários com Realizado/Faltou, A fazer), Agenda (dia, semana, lista; marcar horário), Clientes (busca, nova cliente), Ficha (etapa por toque, horários, conversa, responder, devolver ao robô, anotações), Etapas (mover por toque, sem arrastar).
- **A dona responder pela ficha assume a conversa** (pausa o robô). No WhatsApp, mensagem livre só até 24 horas depois da última mensagem da cliente; depois disso a tela explica que precisa de mensagem de modelo.
- **PWA:** instalável, abre rápido; o service worker guarda só os arquivos do app, nunca respostas da API.
- **Medido no navegador a 360 px:** marcar horário pelo painel levou menos de 1 segundo; sem rolagem lateral.

## E9 (assistente de configuração, admin nexo, troca de senha)

- **Assistente em 5 passos** (Negócio → Serviços → Horários → Dúvidas → Pronto), cada passo salva ao avançar. O painel mostra "Falta configurar o negócio" no topo até concluir. Pode voltar depois pela tela Conta.
- **Horários com uma pausa por dia** (ex.: almoço): no banco viram duas janelas. "Usar o horário de segunda nos outros dias" para preencher rápido.
- **Serviço que sai da lista é desativado, não apagado**, porque horários antigos apontam para ele.
- **Cronômetro do onboarding:** começa quando o negócio é criado (`onboardingStartedAt`) e para quando a dona conclui o assistente (`onboardingCompletedAt`). O admin vê os minutos na lista.
- **Admin nexo cria o negócio** (nome, tipo, dona e e-mail). O tipo escolhe o modelo de etapas. A senha provisória aparece uma vez só na tela; no primeiro acesso o painel obriga a trocar (`User.mustChangePassword`).
- **Lista de negócios do admin sem abrir o RLS:** tabela `tenant_directory` só com nome, tipo e datas, preenchida por gatilho a partir de `tenants`. A aplicação só tem `SELECT` nela (teste confere colunas e permissões).
- **Entrada controlada do admin num negócio:** motivo (mín. 10 caracteres) + código do app autenticador, vale 1 hora, guardada na sessão (`Session.actingTenantId`). Fica registrada na auditoria (início e fim). Durante a entrada, uma faixa escura avisa e tem "Sair do negócio". O admin não troca a senha da dona.
- **Troca de senha** pela tela Conta: pede a atual, encerra as outras sessões e emite um cookie novo.
- **Primeiro admin** pelo terminal: `npm run admin:create -w @nexo/api -- email "Nome"`. Mostra senha provisória e o segredo do 2FA uma vez.
- **Medido no navegador a 360 px:** admin cria negócio, entra com motivo e sai; a dona troca a senha provisória e conclui o assistente; o serviço cadastrado aparece no "Marcar horário". Sem rolagem lateral. O tempo real da piloto vai ser medido com ela (o cronômetro já registra).

## Visual do painel (27/10/2026)

- **Cabeçalho escuro (Tinta) com o nome do negócio** e botões de Conta e Sair; navegação de baixo branca com ícones (lucide-react) e a seção atual destacada em Lilás e Roxo.
- **Hoje começa com um resumo** (horários, esperando você, a fazer); "esperando você" fica em Roxo quando há alguém.
- **Cartões com sombra leve e cantos de 16 px**, horário em bloco Lilás, ações lado a lado. Estados vazios com ícone e próximo passo.
- **Login com o logo oficial** sobre fundo Tinta e o formulário num cartão. "feito pela nexo" com o símbolo no rodapé.
- **Sombras e cantos viram tokens** (`--sombra-1`, `--sombra-2`, `--raio`), feitos só com a Tinta. Nenhuma cor nova.
- Acessibilidade mantida: toque de 44 px ou mais, foco visível, contraste 4,5:1, nada só por cor, respeita "reduzir movimento".

## E10 (lembretes 24 h e 1 h antes)

- **Os lembretes nascem junto com o horário**, na mesma transação: marcar cria os dois (24 h e 1 h antes), remarcar reagenda, cancelar/realizado/faltou cancela os pendentes. Marcado em cima da hora: só os que ainda cabem.
- **24 h:** botões Confirmar, Remarcar e Cancelar. **1 h:** Confirmar e Cancelar. Os botões funcionam em qualquer ponto da conversa e só mexem em horário ativo da própria cliente. Cancelar pede confirmação.
- **Confirmar muda o horário para "Confirmado"** (o painel mostra). Confirmado ainda recebe o de 1 h.
- **Envio no worker, a cada minuto**, negócio por negócio (lista de negócios pela `tenant_directory`, o resto com RLS). Cada lembrete é reservado antes de sair, então dois processos não mandam o mesmo. Na dúvida, não manda: lembrete repetido incomoda mais.
- **Não manda atrasado** (mais de 30 minutos depois da hora) nem para quem pediu "parar".
- **WhatsApp real:** fora da janela de 24 h só vale mensagem de modelo aprovada pela Meta. Até a E0, o lembrete nesse caso não sai: fica marcado como falha com o motivo `template_required` no histórico de eventos. Quando os modelos forem aprovados, o envio usa o modelo no lugar do texto livre.
- **Se a dona assumiu a conversa** (robô pausado), o lembrete sai mesmo assim; a resposta da cliente cai para a dona.
- **Simulador:** `/lembrete` adianta o relógio até o próximo lembrete da cliente do terminal.
- Textos do lembrete são editáveis pela dona como as outras mensagens (`reminder24h`, `reminder1h`, `reminderConfirmed`, `reminderGone`).

## E11, parte 1: Resultados (M9 mínimo) e modo escuro

- **Tela Resultados** (quinta aba): horários marcados pelo robô e pelo painel, realizados, faltas, cancelados, taxa de faltas, novos contatos, pedidos para falar com a dona, pedidos de "parar", confirmações pelo lembrete, clientes em cada etapa e (com mais de uma profissional) atendimentos por profissional. Períodos de 7, 30 ou 90 dias, contando hoje, no fuso do negócio. São as medidas do portão da piloto.
- **Calculado na hora, sem tabela de relatório**: contagens agrupadas nas tabelas do próprio negócio (RLS). Para o volume de um estúdio, é rápido; se crescer, vira visão materializada.
- **Taxa de faltas = faltaram ÷ (realizados + faltaram)**, só com atendimentos que já passaram. Sem base, a tela explica que aparece depois dos primeiros atendimentos.
- **"Marcados" conta pela data em que a cliente marcou**; realizados, faltas e cancelados contam pela data do horário.
- **Modo escuro** (pedido do JP em 27/10/2026): em Conta, "Claro", "Escuro" ou "Igual ao celular". Padrão: claro. A escolha fica só no aparelho (`localStorage`), porque é preferência visual.
- **Cores do tema escuro saem da marca**: fundo Tinta; superfícies são Tinta misturada com um pouco de Lavanda (`color-mix`), como as sombras são derivadas da Tinta. Roxo em texto vira Lavanda; a seleção (abas de período, etapa atual) fica em Lavanda com texto Tinta. Contraste conferido: menor caso 5,2:1 (Lavanda sobre superfície).
- **As telas usam papéis de cor** (`--cor-fundo`, `--cor-superficie`, `--cor-texto`…), que no tema claro apontam para as cores da marca de sempre. O visual claro não mudou.
- **Logo no escuro:** o "feito pela nexo" usa a versão oficial para fundo escuro. Cabeçalho e login já usavam essa versão.
- **Fundo animado no login** (pedido do JP em 27/10/2026): componente "Data Rain" do 21st.dev, só na tela de login. Entrou **sem Tailwind e sem shadcn**: o componente só usa as próprias classes (`dr-*`), que ficaram em `App.css`; trazer Tailwind para um componente mudaria o build inteiro e conviveria mal com os tokens da marca. Ficou em `components/DataRain.tsx`, como os outros componentes do projeto (o `components/ui.tsx` já existe, então uma pasta `ui/` daria conflito de nome no import). Cores trocadas pelas da marca (Lavanda, Azul Elo, Lilás sobre Tinta). Com "reduzir movimento", desenha um quadro parado; com a aba escondida, para de animar. Nos testes (jsdom), o canvas não liga.

## E11, parte 2: imagem de produção e custos

- **Um processo só em produção** (API + worker + painel), numa imagem Docker. O painel é servido pela própria API na raiz e a API fica em `/api` (`WEB_DIST_DIR`). Mesma origem: sem CORS e com o cookie `SameSite=Strict` funcionando. No desenvolvimento nada muda (o Vite continua mandando `/api` para a API).
- **Duas políticas de CSP:** a API continua com `default-src 'none'`; o painel só aceita arquivos da própria origem, sem script inline (só atributo `style` liberado, para a largura das barras). Teste automatizado confere as duas.
- **Arquivos com hash ficam em cache por 1 ano; `index.html` e `sw.js` sempre revalidam**, para versão nova chegar na hora.
- **A imagem roda como `node`, não root**, e traz o CLI do Prisma para migrar com o mesmo build. A CI constrói a imagem a cada PR (não publica).
- **Hospedagem ainda não escolhida.** Três opções com preço oficial em `CUSTOS.md`; recomendação: Railway no piloto. Decisão do Coca (teto de gasto).
- **Tela de planos só visual** (pedido do JP em 27/10/2026): inspirada no bloco "Pricing" do 21st.dev, refeita no CSS do projeto, sem as dependências do original (Tailwind, shadcn, Next, framer-motion, confetti, number-flow); a animação de entrada é CSS e some com "reduzir movimento". Preço aparece como "R$ —" e "a definir", os recursos que ainda não existem têm "em breve" e os botões ficam desligados: nada ali é oferta (princípio 7). O que falta para funcionar está na PENDENCIAS.md.
- **Login em vidro** (pedido do JP em 27/10/2026): o formulário do modelo "login-form" do 21st.dev (cartão translúcido, etiqueta que sobe, ícones, seta no botão) sobre o mesmo fundo Data Rain; o fundo "Smokey" do modelo ficou de fora. Ficaram de fora também "Esqueci a senha", "Entrar com Google" e "Criar conta", porque não existem no sistema (princípio 7); a dona entra com a conta criada pela nexo. Lógica de login, 2FA e mensagens de erro iguais.

## E12: criar conta, esqueci a senha e página de entrada (27/10/2026)

- **Pedido do JP:** "Esqueci a senha" e "Criar conta" com o sistema de verdade por trás, mais uma validação. A validação entendida foi a **confirmação de e-mail** no cadastro: a conta nasce sem confirmação e só entra depois do link.
- **Criar conta cria o negócio e o login da dona** (mesmo caminho do admin: etapas do nicho e uma profissional com o nome dela) e cai no assistente de configuração, que já mede o tempo de onboarding. Fuso padrão `America/Sao_Paulo`.
- **Cadastro desligado por padrão** (`SIGNUP_ENABLED`). Na piloto, quem cria a conta é a nexo; abrir o cadastro para qualquer pessoa é decisão dos sócios e depende dos itens abertos no `SEGURANCA.md` (termos, provedor de e-mail, anti-robô). Com ele desligado, a rota não existe e o link "Criar conta" some.
- **Logins criados pela nexo já nascem confirmados** (coluna com valor padrão); os que existiam foram marcados como confirmados na migração, sem apagar nada.
- **E-mail atrás de uma interface (`Mailer`).** No desenvolvimento o link aparece no log da API (e numa caixa de saída em memória, usada nos testes). Em produção fica desligado até escolher o provedor: as telas avisam e "Esqueci a senha" some. Provedor: [A DEFINIR] (ver PENDENCIAS.md).
- **Nova senha não entra direto no painel**: derruba as sessões de todos os aparelhos e pede para entrar com a senha nova. Também destrava a conta bloqueada e conta como e-mail confirmado (a pessoa provou que recebe nele).
- **Termos:** a caixa "Aceito os termos de uso e a política de privacidade" grava a data do aceite, mas avisa que os textos ainda estão sendo preparados. Texto final com advogado antes de abrir o cadastro.
- **Página de entrada** (escolha do JP no cartão): o modelo "SaaS template" do 21st.dev refeito no CSS do projeto, sem Tailwind, shadcn nem a fonte Poppins (fica Sora/Inter da marca) e sem imagens externas (a CSP só aceita a própria origem). Mantém a estrutura do modelo: barra fixa translúcida com menu no celular, selo no topo, título em degradê, botão claro em degradê e prévia do painel com brilho atrás. O brilho virou degradê CSS e a prévia é uma captura do painel com dados fictícios, legendada "Painel com dados de exemplo". O selo diz "Em fase de testes" e o texto só fala do que já existe (princípio 7). Os links do menu rolam a página sem mexer no endereço, porque o `#` é a rota do painel.
- **Rotas sem login:** `#/` página de entrada, `#/entrar`, `#/criar-conta`, `#/esqueci-senha`, `#/nova-senha?token=`, `#/confirmar-email?token=`. Os dois links de e-mail abrem mesmo com alguém logado no aparelho. Uma rota do painel sem sessão (ex.: sessão vencida em `#/agenda`) mostra o login, como antes.


## Painel no computador e planos Grátis / CRM / Completo (27/10/2026)

- **Pedido do Jandoza:** trazer o visual de dois modelos do 21st.dev ("app-1" e "dashboard with collapsible sidebar") mantendo a identidade da nexo. Entraram **refeitos no CSS do projeto**, como os anteriores: os originais pedem Tailwind, shadcn e recharts, usam fotos do Unsplash e números inventados ("+12% from last month"). Fotos externas e a tag `<style>` que o gráfico do shadcn injeta seriam barradas pela CSP; afrouxar a CSP por causa de visual não vale. Números inventados ferem o princípio 7.
- **Menu lateral recolhível a partir de 1024 px** (`components/Sidebar.tsx`). No celular continua a barra de baixo; as duas nunca aparecem juntas. Recolhido, mostra só os ícones, e o nome de cada item continua lido pelo leitor de tela. A escolha fica só no aparelho (`localStorage`), como o tema.
- **Hoje virou painel do dia:** quatro cartões (horários, esperando você, a fazer, realizados), gráfico dos últimos 30 dias e, no computador, duas colunas: o que pede ação à esquerda, "A fazer" e "O que aconteceu" à direita.
- **Gráfico em SVG próprio** (`components/TrendChart.tsx`), sem biblioteca. Marcados (área cheia) e realizados (linha tracejada) se separam pela forma, não só pela cor. Os números ficam escritos na legenda do dia e numa tabela para leitor de tela. Também aparece em Resultados ("Dia a dia").
- **Série por dia sai do relatório** (`daily` em `/panel/report`): um ponto por dia do período, com zero nos dias vazios, no fuso do negócio. "Marcados" conta pela data em que a cliente marcou; "realizados", pela data do horário, igual aos totais.
- **"O que aconteceu"** (`activity` em `/panel/today`): os 8 últimos eventos de uma lista fechada (cliente nova, horário marcado, remarcado, confirmado, cancelado, realizado, faltou, pediu você, pediu para parar). Só sai tipo, quem fez, data e a cliente; o payload do evento não vai para a tela. A cliente é lida do payload só se for um ID válido e buscada com RLS: cliente de outro negócio vira "Uma cliente". Teste automatizado confere as três coisas.
- **Planos (tela ainda só visual):** Grátis (CRM básico, limite de clientes a definir), CRM (sem limite, resultados, retornos) e Completo (CRM + agenda + robô no WhatsApp). Preços e limites: [A DEFINIR com o Coca]. Hoje todo negócio tem tudo liberado: a trava por plano no servidor é o próximo passo (ver PENDENCIAS.md).

## E13: baixar e excluir os dados de uma cliente (29/10/2026)

- **Onde fica:** no fim da ficha da cliente, seção "Dados da cliente", com "Baixar dados" e "Excluir dados". É a dona quem atende o pedido da cliente; a nexo não mexe nisso sem ela.
- **Baixar dados gera um arquivo `.json`** com tudo o que o negócio guarda sobre a cliente (cadastro, conversas completas, horários com serviço e profissional, etapa, "a fazer", registros de aviso e de "parar" e a lista de acontecimentos). Formato aberto, que dá para ler num editor de texto; um PDF bonito pode vir depois, se a piloto pedir.
- **Excluir anonimiza em vez de apagar a linha.** A cliente perde nome, telefone, etiquetas e anotações, e as conversas, mensagens e "a fazer" dela são apagados de verdade. A linha fica, marcada com `erased_at`, porque os horários passados e as etapas apontam para ela: assim os relatórios (faltas, realizados, novos contatos) continuam certos, como pede o item 9 da seção 3 do `SEGURANCA.md`. Os eventos já guardam só IDs e tipos, então não precisam de limpeza.
- **Horários futuros são cancelados** e voltam a ficar livres, com os lembretes cancelados juntos. Os passados ficam, sem a anotação.
- **Se a cliente mandar mensagem de novo depois**, ela entra como cliente nova: o telefone antigo não existe mais no sistema. Isso inclui o pedido de "parar", que se perde junto. Ver PENDENCIAS.md: [CONFIRMAR COM ADVOGADO/CONTADOR] se dá para guardar só o telefone em lista de bloqueio.
- **Duas confirmações:** na tela, um segundo passo explica o que some e diz que não dá para desfazer; na API, o corpo precisa de `confirm: true`. As duas ações (baixar e excluir) entram na auditoria só com o ID da cliente e as contagens.
- **Backups:** quando a hospedagem existir, a exclusão chega aos backups só quando eles vencerem. Prazo [CONFIRMAR COM ADVOGADO/CONTADOR] (já está na lista para o advogado, item 6).

