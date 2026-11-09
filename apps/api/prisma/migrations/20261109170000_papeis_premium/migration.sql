-- Premium (09/11/2026): plano novo, gestor e consultor na equipe, acessos por papel e
-- verificação em duas etapas obrigatória. Só acrescenta; nada é apagado.
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'PREMIUM';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONSULTANT';

ALTER TABLE "tenants" ADD COLUMN "access_rules" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "tenants" ADD COLUMN "require_mfa" BOOLEAN NOT NULL DEFAULT false;
