-- Conversas: a dona pode arquivar. Mensagem nova da cliente tira do arquivo.
ALTER TABLE "conversations" ADD COLUMN "archived_at" TIMESTAMPTZ;
CREATE INDEX "conversations_tenant_id_last_message_at_idx" ON "conversations" ("tenant_id", "last_message_at" DESC);
