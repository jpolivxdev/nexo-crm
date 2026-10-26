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
