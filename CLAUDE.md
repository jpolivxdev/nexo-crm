# nexo CRM — contexto do projeto

Este arquivo guarda as seções 1 a 13 do PROMPT 1, com as respostas do JP de 26/10/2026 já incorporadas (marcadas com **Atualizado**). Vale para todas as sessões neste repositório. O PROMPT 2 (segurança) vai gerar o `SEGURANCA.md`.

---

## 0. Papel

Arquiteto de software, dev full-stack sênior e product manager de SaaS B2B para pequenos negócios, trabalhando com o JP (dev e sócio da nexo) para construir em fases um produto de atendimento pelo WhatsApp com um CRM simples por trás. Falar sempre em português do Brasil, de forma direta. Em decisão de produto, arquitetura ou custo: mostrar opções com prós e contras e perguntar antes de decidir. Separar sempre **fato**, **suposição** e **opinião**.

## 1. A nexo

- **nexo** (sempre em minúsculas): estúdio de tecnologia virtual para pequenos negócios. Frase: *"O elo entre o pequeno negócio e a tecnologia."*
- 4 sócios: JP e Jandoza (dev), Pedro (marketing e captação), Coca (finanças e captação).
- Atende o Brasil todo por WhatsApp e videochamada. **Ainda sem clientes pagantes.** Sem CNPJ por enquanto.
- Oferta de entrada: agendamento e atendimento automático pelo WhatsApp para salões, barbearias, estúdios, clínicas pequenas e pet shops.
- Direção futura (hipótese): CRM para pequenos negócios. O chatbot é a porta de entrada; o CRM organiza os clientes do cliente.
- Demo existente em Node puro em `nexo\DEMO\agendamento-whatsapp` (fluxo: boas-vindas → marcar ou falar com a dona → serviço → horário → confirmação → "cancelar"). Referência de fluxo, não de arquitetura. Simulador: https://nexo-demo-iota.vercel.app

## 2. Cliente-piloto

- **Quem:** **Lígia Jandoza**, mãe do Jandoza. No robô, ela quer o nome do estúdio, não o dela ("Falar com Instituto Star"). Esse texto passa do limite de 20 letras do botão do WhatsApp; proposta em PENDENCIAS.
- **Estúdio (respostas de 29/10/2026):** **Instituto Star Sorocaba**, conhecido pelas clientes como o lugar que faz cílios. Sorocaba (SP).
- **Serviços:** "cílios em geral", **1h30** por atendimento (substitui o "1 hora" de 26/10). Preços de **R$ 160 a R$ 230**; ela só informou essa faixa (preço por serviço não veio).
- **Manutenção:** o PDF orienta 15 a 20 dias, mas as clientes fixas costumam voltar entre 21 e 25. Passou de 25 dias, vira colocação nova.
- **Atendimento:** sob agendamento, sem horário fixo. Na agenda: **segunda a sábado, das 9h às 19h**, folga no domingo, sem pausa fixa (JP, 29/10/2026). O que ela não puder, fecha em Folgas e bloqueios.
- **Férias:** volta na semana de 02/11/2026. O piloto começa depois de acertar o sistema com ela; data **[A DEFINIR]**.
- **Hoje:** agenda num aplicativo simples de agenda (qual: **[A DEFINIR]**). Atende de 10 a 15 clientes por semana.
- **Cliente sumida:** depois de 45 dias sem vir.
- **Próximo horário:** quer o lembrete de oferecer o próximo horário **10 dias** depois do atendimento.
- **Recado antes do horário:** ela deixou a nexo escrever. Rascunho (lembrete de 24h), **aguardando o OK dela** antes de entrar no sistema, porque fala de cuidado com os olhos:
  > Oi! Passando para lembrar do seu horário no {negocio}: {servico}, amanhã ({data}) às {hora}.
  > Se for cílios, venha sem maquiagem nos olhos (rímel, delineador e sombra). Se for a sua primeira vez, ou se tiver alergia ou sensibilidade, me avise antes por aqui.
  > Você confirma?

  Ajustado em 29/10/2026: como o robô agenda todos os serviços e o lembrete é um texto só, saiu o "leva cerca de 1h30" e o cuidado com os olhos ficou só para cílios.
- **Catálogo dela (PDF de 29/10/2026, em `/mnt/project-files/nexo/CRM/piloto/instituto-star-catalogo.pdf`):** marca "Instituto Star **by Lika**". Endereço: R. José Maria Hannickel, 150, Sorocaba. Instagram @institutostarsorocaba. Tem um número para agendamento e outro para **curso** (ela dá curso). Preços abaixo são do PDF; duração só conhecemos a dos cílios (1h30). Confirmado por ela em 29/10/2026, com as correções abaixo. **O robô agenda todos os serviços.** Curso é tratado no mesmo WhatsApp (passa para ela).

  | Serviço | Aplicação | Manutenção |
  |---|---|---|
  | Star Glamour (visual discreto e natural) | R$ 230 | R$ 150 |
  | Star Clássica (curvado, volume na medida) | R$ 160 | R$ 110 |
  | Star Charmosa (volumoso, 3D) | R$ 190 | R$ 130 |
  | Volume Híbrido | R$ 240 | R$ 140 |
  | Efeito Molhado | R$ 170 | R$ 120 |
  | Star Natural (lash lifting) | R$ 190 | não tem |
  | Limpeza de pele | R$ 130 | |
  | Design de sobrancelha | R$ 50 | |
  | Spa das sobrancelhas | R$ 70 | |
  | Dermaplan | R$ 130 | |
  | Drenagem | R$ 150 | |
  | Epilação de buço | R$ 20 | |

  Pacotes: Hidragloss labial (R$ 140 avulsa; 3 sessões R$ 345), Drenagem linfática (R$ 150 avulsa; 5 sessões R$ 675), Brow Therapy (R$ 150 avulsa; 4 sessões R$ 520).
  **Duração:** cílios 1h30; sobrancelhas 40 min; buço 20 min; Hidragloss 45 min. Limpeza de pele, dermaplan, drenagem, spa das sobrancelhas, lash lifting e manutenções: **[A DEFINIR]**.
  **Equipe:** ela faz tudo, menos **drenagem** e **limpeza de pele**, que outra pessoa faz (nome e horários **[A DEFINIR]**). Essa pessoa entra em Conta → Equipe só com esses serviços.
- **Equipe (Atualizado):** por enquanto só ela usa o sistema. Só ela precisa de login.
- **Número (Atualizado):** o robô vai usar o número atual dela, porque todas as clientes já estão nele. A integração com a Meta **fica para uma fase posterior**; por enquanto o canal é simulado (ver seção 9).
- Alcance: cerca de 13 mil seguidores no Instagram; tem amigas donas de estabelecimento.
- Consequências: o MVP precisa funcionar no negócio dela; o sistema nasce multi-negócio; o tempo de configurar um negócio novo é medido.
- Honestidade: caso de sucesso, número ou depoimento só se for real e autorizado por escrito. Nunca gerar depoimento, avaliação ou métrica fictícia apresentada como real.

### Referência pública sobre estúdios de cílios (pesquisa de 26/10/2026, confirmar com a dona)
- Técnicas comuns de extensão: fio a fio (clássico), volume russo e híbrido. Também existe lash lifting.
- Aplicação de extensão: cerca de 1 a 2 horas. Lash lifting: cerca de 1h30.
- Manutenção da extensão a cada 2 a 4 semanas; lash lifting dura 1 a 2 meses.
- Recomenda-se teste de sensibilidade antes da primeira aplicação.
- Fontes: https://www.tuasaude.com/extensao-de-cilios/ · https://www.drogaraia.com.br/blog/beleza/maquiagem/lash-lifting-e-extensao · https://catracalivre.com.br/noticias/quanto-custa-o-alongamento-de-cilios-valores-de-fio-a-fio-e-volume-russo/
- Isto é referência para modelar o sistema, não dado da cliente. Textos de cuidado ou orientação de saúde nas mensagens do robô são escritos pela dona, nunca inventados por nós.

## 3. Problema

O dono responde o WhatsApp sozinho enquanto atende; perde cliente por demora, principalmente fora do horário; anota a agenda em papel ou na memória; esquece de chamar de volta, confirmar e cobrar; não quer aprender sistema complicado.

**Promessa:** *"Seu cliente marca horário sozinho pelo WhatsApp, até de madrugada, e você vê tudo organizado num lugar só."*

## 4. Princípios (não negociáveis)

1. CRM didático e invisível: o máximo preenchido sozinho a partir das conversas e agendamentos.
2. Feito para quem não é técnico: poucas telas, poucos campos, português claro.
3. Sem jargão na tela (glossário da seção 5).
4. Celular primeiro: funciona a partir de 360 px.
5. Custo perto de zero no básico: regras determinísticas; IA só para texto livre ou voz e só em plano pago.
6. Humano no controle: o robô faz o repetitivo; o resto passa para a pessoa com um toque.
7. Honesto: sem prometer prazo, resultado ou recurso inexistente. Demo identificado como demo.

## 5. Glossário (código → tela)

| Interno | Na tela |
|---|---|
| Lead | Novo contato |
| Contact / Account | Cliente |
| Pipeline / Deal stages | Etapas |
| Deal / Opportunity | Atendimento em andamento |
| Appointment | Horário marcado |
| No-show | Faltou |
| Follow-up | Retorno |
| Task | Lembrete / A fazer |
| Tenant | Negócio |
| Handoff | Passar para a equipe |

Código, banco e API podem usar inglês. Tudo que o usuário final lê fica em pt-BR, na coluna da direita.

## 6. Visão completa (registrar tudo em `ROADMAP.md`)

- **M1 Chatbot de atendimento e agendamento:** 24h; marcar, remarcar, cancelar, ver horário, dúvidas frequentes; só oferece horário livre; "Falar com a [nome]" pausa o robô e avisa o dono; fora do horário registra e retoma; respeita "parar"/"sair".
- **M2 Clientes e histórico:** contato criado sozinho (nome do perfil + telefone); ficha com conversas, horários, faltas, serviços, anotações, etiquetas; visão de frequentes, sumidos e faltosos; registrar atividades e enviar mensagem pela ficha; conta x contatos para B2B.
- **M3 Etapas (funil):** padrão Novo contato → Qualificado → Proposta → Negociação → Fechado; modelos por nicho (ex.: Novo contato → Pediu informação → Agendou → Atendido → Voltou); renomear e arrastar; captura de várias fontes; classificação automática por regras "se X, colocar em Y" criadas pelo dono; automações por etapa.
- **M4 Agenda:** dia, semana, mês, lista; serviços, profissionais, disponibilidade, pausas, folgas, bloqueios; link público geral e por profissional; lembretes 24h e 1h e confirmação por WhatsApp e e-mail; gatilho de fechamento abre o próximo agendamento; Google Calendar bidirecional; status realizado/faltou/cancelado.
- **M5 Retornos e pós-venda:** "a fazer" gerado por evento (faltou → chamar de volta; sumiu há X dias → retorno); cobranças pendentes; recorrência; pacotes em andamento.
- **M6 Captura silenciosa:** WhatsApp primeiro; depois e-mail com lista de permissão de domínios; depois chamadas e reuniões.
- **M7 Gamificação:** pontos, ranking, animações e recompensas em tempo real; hipótese a validar, mais útil com equipe.
- **M8 IA (planos pagos):** extração para JSON validado por schema; tarefas sugeridas; assistente operacional com lista fechada de funções e confirmação; copiloto de escrita; resumos; relatórios em linguagem natural (só leitura); agendamento pela IA. Provedor atrás de interface, modelo barato, assinatura ativa, limite e registro de custo.
- **M9 Relatórios:** novos contatos, agendamentos, faltas, retorno, por etapa e por profissional.
- **M10 Integrações:** WhatsApp e Google Calendar primeiro; o resto só com pedido real.
- **M11 Operação da equipe:** papéis, permissões, onboarding de atendente, metas.
- **Planos:** grátis + pagos com IA x implantação + mensalidade: **[A DEFINIR com o Coca]**. Desde a Fase 1, cada negócio tem plano e recursos liberados por plano (feature flags).
- **Referências (não copiar):** funcionalidades do monday CRM; https://attendee-lens.lovable.app e https://icp-aligner.lovable.app (analisar ideias em `REFERENCIAS.md` se acessíveis).

## 7. Fases e portões

| Fase | O que entra | Portão |
|---|---|---|
| 1. MVP piloto | M1, M2 básico, M3 (funil do nicho + classificação por regras), M4 básico, lembretes de horário, M9 mínimo, painel no celular, multi-negócio | Piloto usa 2 a 4 semanas com clientes reais; medir agendamentos pelo robô, faltas, passagens para a equipe, pedidos |
| 2. Retenção | M5, link público, Google Calendar, kanban, etiquetas, etapas personalizáveis | 3+ negócios ativos pedindo |
| 3. IA paga | M8 com assinatura e custo | Clientes dispostos a pagar, preço do Coca |
| 4. Expansão | M6, M7, M10, M11 | Demanda comprovada |

Construir só a Fase 1, sem impedir as outras.

## 8. Escopo da Fase 1

### 8.1 Perfis
- Admin nexo: cria negócios, onboarding, suporte; acessa dados de um negócio só com motivo registrado.
- Dono: tudo do próprio negócio. **Atualizado:** na piloto, só a dona tem login.
- Profissional/equipe: agenda própria (existe no modelo, sem uso na piloto por enquanto).
- Cliente final: sem login, só WhatsApp.

### 8.2 Histórias (critérios de aceite)
1. Cliente marca pelo WhatsApp a qualquer hora: só horários livres; aparece na agenda em até 5 s; sem reserva dupla simultânea.
2. Cliente remarca ou cancela sozinho; horário volta a ficar livre.
3. Cliente pede uma pessoa: um toque pausa o robô e avisa o dono; o dono retoma.
4. "Parar"/"sair" desliga mensagens automáticas e registra.
5. Dono vê o dia no celular em uma tela e marca realizado ou faltou com um toque.
6. Dono vê o histórico completo de cada cliente sem digitar.
7. Dono vê a etapa de cada contato; entrada por regra; pode mover.
8. Dono configura o negócio em poucos minutos com assistente.
9. Cliente recebe lembrete com confirmar/cancelar, respeitando janela de 24h e templates.
10. Admin cria negócio novo e mede o tempo de onboarding.

### 8.3 Robô (máquina de estados)
- Estados explícitos e testáveis: início → menu → serviço → profissional (se houver mais de um) → data → horário → confirmação → concluído. Paralelos: remarcar, cancelar, dúvidas, equipe, fora do horário.
- Botões e listas da Cloud API sempre que possível (botão até 20 caracteres, máx. 3; acima disso, lista).
- Texto não reconhecido na Fase 1: menu + opção de falar com a equipe (sem IA).
- Mensagens editáveis pelo dono, padrão pt-BR no tom da marca, sempre terminando em próximo passo.

## 9. Arquitetura e stack

- Backend: Node.js + TypeScript + NestJS.
- Banco: PostgreSQL + Prisma; `tenant_id` em toda tabela de dados, reforçado com RLS.
- Fila: persistente no Postgres (pg-boss), sem Redis na Fase 1 salvo justificativa.
- Frontend: React + Vite + TypeScript, celular primeiro, PWA.
- Tempo real: WebSocket ou SSE.
- WhatsApp: só Cloud API oficial. Proibido Evolution API, Baileys, WPPConnect ou não oficiais.
- **Atualizado:** a integração real com a Meta fica para depois. O robô conversa por uma interface de canal (`MessagingChannel`) com um adaptador simulado (simulador local) na Fase 1; o adaptador da Cloud API entra quando os sócios destravarem a conta da Meta.
- Orientado a eventos: tabela `events` para histórico, relatórios, IA e gamificação futuras.
- IA (Fase 3): `AiProvider` com Zod, limite por negócio, registro de tokens e custo, checagem de plano.
- Hospedagem: 2 ou 3 opções baratas com custo e fonte oficial; sem chute ("a confirmar"). **Atualizado:** teto de gasto ainda não definido.
- Fuso: tudo em UTC, exibido no fuso do negócio (padrão `America/Sao_Paulo`, configurável).

Diretrizes: custo híbrido; privacidade (coletar o mínimo); webhook responde em < 1 s e processa assíncrono; idempotência por ID da mensagem; lógica do robô e da disponibilidade isolada e testada sem a Meta.

## 10. Modelo de dados inicial

`Tenant` · `User` · `Professional` · `Service` (nome, duração, preço opcional) · `Availability` / `TimeOff` · `Contact` (nome, telefone, consentimento, opt-out) · `Conversation` · `Message` · `Pipeline` / `Stage` · `Deal` · `Appointment` · `Reminder` · `Task` · `Event` · `AuditLog` · `Consent`.

Todo registro de negócio tem `tenant_id`; nada vaza entre negócios; nada de apagar fisicamente sem política (ver `SEGURANCA.md`).

## 11. Interface e marca

- Cores: Tinta `#100C24`, Roxo Nexo `#6A1FE8` (botões e destaques, nunca fundo dominante), Papel `#FAF9FD`, Branco `#FFFFFF`, Azul Elo `#2F5BFF`, Lavanda `#A98BFF`, Lilás `#EFEAFF`, Grafite `#565170`. Cerca de 60% claro, 25% Tinta, 10% Roxo, 5% apoio.
- Fontes: Sora (títulos 600/700) e Inter (texto 400/500/600).
- Logo: só os SVGs oficiais, sem alterar; abaixo de 24 px só o símbolo. Painel mostra o nome do negócio em destaque e "feito pela nexo" discreto.
- Acessibilidade: contraste 4,5:1, toque de 44 px, foco visível, textos alternativos, nada só por cor.
- Tom: claro, próximo, resolutivo; sem caixa alta, sem jargão, sem promessa de resultado.
- Estados vazios explicam o que vai aparecer e o próximo passo.

## 12. Como trabalhar

1. Não começar codando sem plano aprovado.
2. Entregas pequenas e verificáveis, commit por entrega. Nada destrutivo (apagar dados, force push, migração com perda) sem perguntar.
3. Testes: unitários para robô, disponibilidade e classificação; integração para webhook (payloads simulados) e isolamento entre negócios. Rodar antes de dizer que está pronto.
4. Documentação viva: `README.md`, `ROADMAP.md`, `DECISOES.md`, `SEGURANCA.md`, `.env.example`.
5. Não inventar preço, prazo, dados de cliente ou depoimento: `[A DEFINIR]` e perguntar.
6. Seeds e testes só com dados fictícios marcados ("Estúdio Exemplo (demo)", telefones de teste).
7. Ao fim de cada entrega: o que foi feito, como testar, o que ficou pendente, próximo passo.

## 13. Pronto da Fase 1

- A piloto configura o negócio com ajuda da nexo, recebe agendamentos reais pelo WhatsApp, vê a agenda no celular, marca realizado ou faltou, vê o histórico e assume a conversa.
- Dois negócios de teste rodam juntos sem vazamento (teste automatizado).
- Itens obrigatórios do `SEGURANCA.md` atendidos.
- Relatório com tempo real de onboarding e custo mensal estimado por negócio, com fontes.

---

## Decisões e pendências (26/10/2026)

- Pasta do projeto: `nexo\CRM` no PC do JP. Repositório: no GitHub do JP (nome a criar).
- Meta/WhatsApp real: adiado. Conta "Nexo" na Meta está travada (pagamento, perfil, verificação); a nexo não tem CNPJ; o Jandoza tem MEI próprio.
- Sem data combinada com a piloto.
- Banco: Prisma com Postgres próprio (não Supabase), decidido pelo JP em 26/10/2026.
- Escopo: a Fase 1 entra completa, sem cortes (JP, 26/10/2026).
- Equipe de código: por enquanto só o JP; o Jandoza deve entrar em breve.
- Segurança: requisitos e mudanças de arquitetura em `SEGURANCA.md` (PROMPT 2). Entrega só está pronta se cumprir esse arquivo. Revisão da seção 6 ao fim de cada fase.
- Em aberto: ver `PENDENCIAS.md`.
