-- channel_routes fica fora do RLS porque o webhook precisa achar o negócio antes de saber qual é.
-- Em troca, a aplicação só pode ler: quem cria ou muda rota é a migração ou o script de implantação.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "channel_routes" FROM nexo_app;
