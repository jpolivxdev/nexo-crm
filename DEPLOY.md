# Como colocar no ar

Guia da E11. A hospedagem ainda não foi escolhida: as opções, com preço e fonte, estão em [CUSTOS.md](CUSTOS.md). Nada aqui vai para clientes reais enquanto houver item crítico pendente no [SEGURANCA.md](SEGURANCA.md).

## O que sobe

Uma imagem só (`Dockerfile`), com um processo que roda:

- a API (NestJS) em `/api`, inclusive o webhook da Meta em `/api/webhooks/whatsapp` e a saúde em `/api/health`;
- o worker da fila e dos lembretes (`RUN_WORKER=true`);
- o painel (build do `apps/web`) na raiz, na mesma origem. Sem CORS, e o cookie de sessão fica `Secure` e `SameSite=Strict`.

O processo roda como usuário `node` (não root). Nenhum segredo entra na imagem: tudo vem das variáveis de ambiente do provedor.

Mais um serviço: **PostgreSQL 16** gerenciado (ou próprio, na opção de servidor). Sem Redis.

## Variáveis de ambiente (produção)

| Variável | Valor | Segredo? |
|---|---|---|
| `NODE_ENV` | `production` (a imagem já define) | não |
| `DATABASE_URL` | conexão com o papel `nexo_app` | **sim** |
| `DATABASE_MIGRATION_URL` | conexão com o papel dono das tabelas; só no passo de migração | **sim** |
| `WEB_ORIGIN` | endereço público, ex.: `https://painel.exemplo.com.br` | não |
| `FIELD_ENCRYPTION_KEY` | 32 bytes em base64 (2FA do admin) | **sim** |
| `TRUST_PROXY` | proxies na frente (a imagem usa `1`; confirmar no provedor) | não |
| `RUN_WORKER` | `true` | não |
| `REALTIME_CROSS_PROCESS` | `true` | não |
| `WHATSAPP_*` | vazias até a E0 (Meta) | **sim** |

Segredos ficam só no cofre de variáveis do provedor. Nunca no git, nunca em print de tela.

## Primeira vez

1. **Banco:** criar o Postgres 16 e anotar a conexão do usuário dono (o que o provedor cria).
2. **Migrações** (cria tabelas, RLS e o papel `nexo_app` sem login), com a mesma imagem:
   ```
   docker run --rm -e DATABASE_MIGRATION_URL="..." nexo-crm npm run db:deploy -w @nexo/api
   docker run --rm -e DATABASE_MIGRATION_URL="..." nexo-crm npm run queue:setup -w @nexo/api
   ```
3. **Liberar o login do papel da aplicação**, com uma senha forte gerada na hora (no console SQL do provedor, com o usuário dono):
   ```sql
   ALTER ROLE nexo_app LOGIN PASSWORD 'senha-gerada-aqui';
   ```
   Monte a `DATABASE_URL` com `nexo_app` e essa senha. Conferir que o papel continua sem `BYPASSRLS` (o teste de isolamento confere isso na CI).
4. **Subir a imagem** com as variáveis da tabela. Health check em `/api/health`.
5. **Primeiro admin nexo** (mostra senha provisória e o segredo do 2FA uma vez só):
   ```
   docker run --rm -it -e DATABASE_URL="..." -e FIELD_ENCRYPTION_KEY="..." nexo-crm npm run admin:create -w @nexo/api -- email@exemplo.com "Nome"
   ```
6. **Criar o negócio da piloto** pela área do admin. O cronômetro do onboarding começa aí.

Nunca rodar `db:seed` em produção: o seed cria dados de demonstração.

## A cada versão

1. CI verde no PR (inclui construir a imagem).
2. Migrações primeiro (`db:deploy`), depois a imagem nova. As migrações deste projeto não apagam dados; se alguma precisar, ela vem com aviso no PR e pergunta antes.
3. Conferir `/api/health` e entrar no painel.

## Backup

Backup diário do Postgres pelo provedor, com retenção definida no [SEGURANCA.md](SEGURANCA.md). Testar uma restauração antes do piloto começar. Prazo de guarda: `[CONFIRMAR COM ADVOGADO/CONTADOR]` (PENDENCIAS.md).
