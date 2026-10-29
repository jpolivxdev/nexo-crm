-- Regras de etapa criadas pela dona ("se X, colocar em Y"). Só adiciona coluna.
ALTER TABLE "pipelines" ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]';
