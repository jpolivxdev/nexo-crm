-- Premium P5 (10/11/2026): chat interno da equipe. Canais (toda a equipe) e conversas diretas
-- (duas pessoas). Mensagem apagada vira "mensagem apagada" (sem texto); nada sai do banco.
CREATE TABLE "chat_channels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "direct_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_channels_tenant_id_id_key" ON "chat_channels"("tenant_id", "id");
CREATE UNIQUE INDEX "chat_channels_tenant_id_direct_key_key" ON "chat_channels"("tenant_id", "direct_key");
CREATE INDEX "chat_channels_tenant_id_idx" ON "chat_channels"("tenant_id");
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_messages_channel_id_created_at_idx" ON "chat_messages"("channel_id", "created_at");
CREATE INDEX "chat_messages_tenant_id_idx" ON "chat_messages"("tenant_id");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_channel_id_fkey" FOREIGN KEY ("tenant_id", "channel_id") REFERENCES "chat_channels"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quem participa (conversa direta) e até onde cada pessoa leu (todas).
CREATE TABLE "chat_reads" (
    "tenant_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ,
    CONSTRAINT "chat_reads_pkey" PRIMARY KEY ("channel_id", "user_id")
);
CREATE INDEX "chat_reads_tenant_id_user_id_idx" ON "chat_reads"("tenant_id", "user_id");
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_tenant_id_channel_id_fkey" FOREIGN KEY ("tenant_id", "channel_id") REFERENCES "chat_channels"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_channels" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chat_channels" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chat_messages" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "chat_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_reads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chat_reads" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- Mensagens não são apagadas pela aplicação (só marcadas como apagadas).
REVOKE DELETE, TRUNCATE ON chat_messages FROM nexo_app;
