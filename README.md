# nexo CRM

Atendimento e agendamento pelo WhatsApp com um CRM simples por trás, para pequenos negócios. Projeto da nexo, em construção (Fase 1, MVP piloto).

O contexto completo está em [CLAUDE.md](CLAUDE.md). Segurança em [SEGURANCA.md](SEGURANCA.md). O que falta decidir em [PENDENCIAS.md](PENDENCIAS.md).

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
npm run dev:api             # http://localhost:3000/health
npm run dev:web             # http://localhost:5173
```

## Verificações (as mesmas da CI)

```bash
npm run format:check
npm run lint
npm run typecheck
npm test                    # precisa do Postgres no ar
npm audit --audit-level=high
```

A CI também roda o gitleaks para procurar segredos. Para rodar antes de cada commit, instale o [gitleaks](https://github.com/gitleaks/gitleaks#installing) e use `gitleaks protect --staged`.

## Documentos

- [ROADMAP.md](ROADMAP.md): todas as fases e entregas.
- [DECISOES.md](DECISOES.md): decisões e motivos.
- [SEGURANCA.md](SEGURANCA.md): modelo de ameaças, dados tratados, incidente e checklist.
