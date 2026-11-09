-- Suporte: chamados do negócio para a nexo.
-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "owner_unread" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_type" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_status_updated_at_idx" ON "support_tickets"("status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_id_key" ON "support_tickets"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "support_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: o negócio só vê os próprios chamados. O painel de suporte da nexo liga
-- app.support_admin na transação para ler e responder todos (só estas duas tabelas).
CREATE FUNCTION app_support_admin() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.support_admin', true) = 'on' $$;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access ON support_tickets
  USING (tenant_id = app_current_tenant() OR app_support_admin())
  WITH CHECK (tenant_id = app_current_tenant() OR app_support_admin());

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access ON support_messages
  USING (tenant_id = app_current_tenant() OR app_support_admin())
  WITH CHECK (tenant_id = app_current_tenant() OR app_support_admin());

-- Ninguém apaga chamado pela aplicação (histórico do atendimento).
REVOKE DELETE, TRUNCATE ON support_tickets, support_messages FROM nexo_app;
