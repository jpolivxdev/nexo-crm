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
- **Chave estrangeira não passa pelo RLS.** Por isso o agendamento confere, pelo RLS, que a cliente é do mesmo negócio antes de gravar. A correção definitiva (chaves compostas com `tenant_id`) está nas tarefas de segurança do SEGURANCA.md.
- **Sem rotas HTTP ainda.** As rotas da agenda entram com o login (E8), para não existir rota sem autenticação.
