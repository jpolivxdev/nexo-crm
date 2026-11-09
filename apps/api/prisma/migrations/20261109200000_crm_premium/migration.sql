-- Premium P2 (09/11/2026): CRM completo. Vários funis, campanhas, campos próprios, dono do
-- atendimento, previsão de fechamento e tarefas com responsável. Só acrescenta; nada é apagado.

-- Chance de fechar em cada etapa (0 a 100), para a previsão. Nulo: a etapa não entra na conta.
ALTER TABLE "stages" ADD COLUMN "probability" INTEGER;

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "pipeline_id" UUID,
    "starts_on" DATE,
    "ends_on" DATE,
    "budget_cents" INTEGER,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "campaigns_tenant_id_idx" ON "campaigns"("tenant_id");
CREATE UNIQUE INDEX "campaigns_tenant_id_id_key" ON "campaigns"("tenant_id", "id");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_pipeline_id_fkey" FOREIGN KEY ("tenant_id", "pipeline_id") REFERENCES "pipelines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "custom_fields" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "custom_fields_tenant_id_idx" ON "custom_fields"("tenant_id");
CREATE UNIQUE INDEX "custom_fields_tenant_id_id_key" ON "custom_fields"("tenant_id", "id");
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Atendimento: quem cuida (login da equipe), campanha de origem, previsão e campos próprios.
-- owner_user_id fica sem chave estrangeira: o login pode sair da equipe; o serviço confere o
-- negócio e limpa o campo quando o acesso é removido.
ALTER TABLE "deals" ADD COLUMN "title" TEXT;
ALTER TABLE "deals" ADD COLUMN "owner_user_id" UUID;
ALTER TABLE "deals" ADD COLUMN "campaign_id" UUID;
ALTER TABLE "deals" ADD COLUMN "expected_close_on" DATE;
ALTER TABLE "deals" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "campaigns"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "deals_tenant_id_owner_user_id_idx" ON "deals"("tenant_id", "owner_user_id");

-- Tarefas: tipo (ligar, retorno, reunião, outra) e responsável.
ALTER TABLE "tasks" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'todo';
ALTER TABLE "tasks" ADD COLUMN "assignee_user_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "deal_id" UUID;
CREATE INDEX "tasks_tenant_id_assignee_user_id_idx" ON "tasks"("tenant_id", "assignee_user_id");

-- Isolamento por negócio (mesmo padrão das outras tabelas).
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaigns" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_fields" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_fields" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
