-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "payload" JSONB;

-- AlterTable
ALTER TABLE "stages" ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "attendant_name" TEXT NOT NULL DEFAULT 'a equipe',
ADD COLUMN     "faq" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "min_notice_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "slot_step_minutes" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "channel_routes" (
    "channel" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_routes_pkey" PRIMARY KEY ("channel","external_id")
);

-- CreateIndex
CREATE INDEX "channel_routes_tenant_id_idx" ON "channel_routes"("tenant_id");


-- Rotas do canal apontam para um negócio existente.
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Etapas já criadas ganham a chave usada pelas regras de classificação.
UPDATE stages SET key = CASE name
  WHEN 'Novo contato' THEN 'new'
  WHEN 'Pediu informação' THEN 'asked_info'
  WHEN 'Agendou' THEN 'scheduled'
  WHEN 'Atendido' THEN 'attended'
  WHEN 'Voltou' THEN 'returned'
  WHEN 'Não seguiu' THEN 'lost'
  WHEN 'Qualificado' THEN 'qualified'
  WHEN 'Orçamento' THEN 'proposal'
  WHEN 'Negociação' THEN 'negotiation'
  WHEN 'Fechado' THEN 'won'
  WHEN 'Perdido' THEN 'lost'
END
WHERE key IS NULL;

CREATE UNIQUE INDEX "stages_pipeline_id_key_key" ON "stages"("pipeline_id", "key");
