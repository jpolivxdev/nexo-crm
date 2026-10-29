# Imagem de produção: um processo com a API, o worker e o painel (build do apps/web).
# Construir:  docker build -t nexo-crm .
# Migrar:     docker run --rm -e DATABASE_MIGRATION_URL=... nexo-crm npm run db:deploy -w @nexo/api
# Rodar:      docker run -p 3000:3000 --env-file .env.producao nexo-crm
# Variáveis: veja .env.example e DEPLOY.md. Nenhum segredo entra na imagem.

FROM node:22.22.2-bookworm-slim AS build
WORKDIR /app
# Dependências primeiro, para o cache do Docker reaproveitar quando só o código muda.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build -w @nexo/core && npm run build -w @nexo/api && npm run build -w @nexo/web

FROM node:22.22.2-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    TRUST_PROXY=1
WORKDIR /app
# O CLI do Prisma fica na imagem para rodar as migrações com o mesmo build.
COPY --from=build /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
