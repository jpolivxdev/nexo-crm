# nexo CRM

Atendimento e agendamento pelo WhatsApp com um CRM simples por trás, para pequenos negócios. Projeto da nexo, em construção (Fase 1, MVP piloto).

O contexto completo está em [CLAUDE.md](CLAUDE.md). Segurança em [SEGURANCA.md](SEGURANCA.md). O que falta decidir em [PENDENCIAS.md](PENDENCIAS.md). Como colocar no ar em [DEPLOY.md](DEPLOY.md); custos e opções de hospedagem em [CUSTOS.md](CUSTOS.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/api` | API e worker (NestJS, TypeScript, ESM) |
| `apps/web` | Painel do dono (React + Vite, celular primeiro) |
| `packages/core` | Regras puras: robô, disponibilidade, classificação, privacidade. Sem NestJS, sem banco, sem Meta |

## Como rodar

Pré-requisitos: Node.js 22.22.2 ou mais novo e Docker Desktop.

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
npm run db:up               # sobe o Postgres local (só em 127.0.0.1)
npm run build -w @nexo/core
npm run db:deploy -w @nexo/api       # cria as tabelas, o RLS e o papel nexo_app
npm run db:setup-local -w @nexo/api  # libera o login local do nexo_app
npm run queue:setup -w @nexo/api     # cria a fila de mensagens (pg-boss)
npm run build -w @nexo/api && npm run db:seed -w @nexo/api   # negócios de demonstração + login da dona
```

O seed mostra o e-mail e a senha do painel (senha nova a cada seed; para fixar, defina
`SEED_OWNER_PASSWORD` no `.env`) e o `SIMULATOR_TENANT_ID`. Copie essa linha para o `.env`.

Depois, em três terminais:

```bash
npm run dev:api                      # API + worker em http://localhost:3000
npm run dev:web                      # painel em http://localhost:5173
npm run simulator -w @nexo/api       # você é a cliente no "WhatsApp" do terminal
```

No simulador, escreva "oi" e responda com o número das opções. Depois de marcar, `/lembrete`
adianta o relógio até o próximo lembrete do horário (24 h ou 1 h antes). O painel aberto no navegador
atualiza sozinho. Para ver como celular, use o modo de dispositivo do navegador (360 px).

### Admin nexo (opcional)

Defina `FIELD_ENCRYPTION_KEY` no `.env` (o comando para gerar está no `.env.example`) e rode:

```bash
npm run build -w @nexo/api
npm run admin:create -w @nexo/api -- admin@exemplo.test "Seu nome"
```

Ele mostra uma senha provisória e o segredo do 2FA (uma vez só). Cadastre o segredo num app
autenticador e entre no painel: a área do admin lista os negócios, cria negócio novo (com senha
provisória para a dona) e permite entrar num negócio para suporte, com motivo e código.

## Verificações (as mesmas da CI)

```bash
npm run format:check
npm run lint
npm run typecheck
npm test                    # precisa do Postgres no ar
npm audit --audit-level=high
```

A CI também roda o gitleaks para procurar segredos. Para rodar antes de cada commit, instale o [gitleaks](https://github.com/gitleaks/gitleaks#installing) e use `gitleaks protect --staged`.

## Banco e isolamento entre negócios

- Toda tabela de negócio tem `tenant_id` e Row Level Security ligado e forçado.
- A aplicação acessa dados de negócio sempre por `withTenant(tenantId, tx => ...)` (`apps/api/src/database/prisma.ts`). Sem isso, o banco não devolve nenhuma linha.
- O `tenantId` vem sempre da sessão autenticada, nunca do navegador.
- O banco recusa dois horários ativos sobrepostos para a mesma profissional.
- O teste `apps/api/test/tenant-isolation.test.ts` falha se alguma tabela com `tenant_id` ficar sem RLS.

## Backup e restauração

Precisa do `pg_dump` e do `pg_restore` (vêm com o Postgres).

1. Uma vez, como superusuário do Postgres, crie o papel só de leitura do backup (o RLS forçado esconde os dados até do dono das tabelas): `psql -U postgres -d nexo -v senha="'uma-senha-forte'" -f apps/api/scripts/setup-backup-role.sql`
2. No `.env`: `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` e `BACKUP_DIR` (veja `.env.example`). Guarde a chave fora do servidor do banco.
3. Backup: `npm run db:backup -w @nexo/api` (gera um `.dump.enc` criptografado).
4. Teste de restauração: crie um banco vazio, aponte `BACKUP_RESTORE_URL` para ele e rode `npm run db:restore-check -w @nexo/api -- caminho/do/arquivo.dump.enc`. O script recusa banco com tabelas.

## Documentos

- [ROADMAP.md](ROADMAP.md): todas as fases e entregas.
- [DECISOES.md](DECISOES.md): decisões e motivos.
- [SEGURANCA.md](SEGURANCA.md): modelo de ameaças, dados tratados, incidente e checklist.
