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
- **Logo:** o painel ainda não usa os SVGs oficiais (não estão no repositório). Mostra só "feito pela nexo" em texto. Nada de redesenhar o logo.

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
