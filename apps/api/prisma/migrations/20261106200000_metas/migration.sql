-- Metas do mês definidas pela dona (atendimentos realizados e faturamento). Vazio = sem meta.
ALTER TABLE "tenants" ADD COLUMN "goals" JSONB NOT NULL DEFAULT '{}';
