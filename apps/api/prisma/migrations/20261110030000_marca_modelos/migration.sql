-- Premium P8 (10/11/2026): marca do negócio (cor, fonte, logo), domínio próprio e modelos de
-- mensagem de WhatsApp e e-mail.
ALTER TABLE "tenants" ADD COLUMN "brand_color" TEXT;
ALTER TABLE "tenants" ADD COLUMN "brand_font" TEXT;
ALTER TABLE "tenants" ADD COLUMN "custom_domain" TEXT;
ALTER TABLE "tenants" ADD COLUMN "domain_token" TEXT;
ALTER TABLE "tenants" ADD COLUMN "domain_verified_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "tenants_custom_domain_key" ON "tenants"("custom_domain");

-- Logo do negócio (uma por negócio), fora da tabela de negócios para não pesar nas consultas.
CREATE TABLE "brand_logos" (
    "tenant_id" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "brand_logos_pkey" PRIMARY KEY ("tenant_id")
);
ALTER TABLE "brand_logos" ADD CONSTRAINT "brand_logos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_logos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_logos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "brand_logos" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_templates_tenant_id_id_key" ON "message_templates"("tenant_id", "id");
CREATE INDEX "message_templates_tenant_id_idx" ON "message_templates"("tenant_id");
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "message_templates" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
REVOKE DELETE, TRUNCATE ON message_templates FROM nexo_app;

-- Tela de login no domínio próprio: descobre o negócio pelo endereço, só se o domínio já foi
-- verificado. Devolve só o id; a marca é lida depois dentro do negócio (RLS).
CREATE OR REPLACE FUNCTION tenant_for_domain(host TEXT) RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT id FROM tenants
    WHERE custom_domain = lower(host) AND domain_verified_at IS NOT NULL
    LIMIT 1
  $$;
REVOKE ALL ON FUNCTION tenant_for_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_for_domain(TEXT) TO nexo_app;
