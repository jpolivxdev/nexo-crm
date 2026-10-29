-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "acting_reason" TEXT,
ADD COLUMN     "acting_tenant_id" UUID,
ADD COLUMN     "acting_until" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ,
ADD COLUMN     "onboarding_started_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tenant_directory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "onboarding_started_at" TIMESTAMPTZ,
    "onboarding_completed_at" TIMESTAMPTZ,

    CONSTRAINT "tenant_directory_pkey" PRIMARY KEY ("id")
);


-- Diretório de negócios para o admin nexo: só nome, nicho e datas. Sem RLS, só leitura para a
-- aplicação; quem escreve é o gatilho abaixo (SECURITY DEFINER, dono das tabelas).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "tenant_directory" FROM nexo_app;

CREATE FUNCTION sync_tenant_directory() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  INSERT INTO tenant_directory (id, name, niche, created_at, onboarding_started_at, onboarding_completed_at)
  VALUES (NEW.id, NEW.name, NEW.niche, NEW.created_at, NEW.onboarding_started_at, NEW.onboarding_completed_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    niche = EXCLUDED.niche,
    onboarding_started_at = EXCLUDED.onboarding_started_at,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sync_tenant_directory() FROM PUBLIC;

CREATE TRIGGER tenants_sync_directory
  AFTER INSERT OR UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION sync_tenant_directory();

-- Negócios que já existem entram no diretório. O RLS forçado esconderia as linhas até do dono,
-- então ele é suspenso só dentro desta migração (mesma transação).
ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
INSERT INTO tenant_directory (id, name, niche, created_at, onboarding_started_at, onboarding_completed_at)
  SELECT id, name, niche, created_at, onboarding_started_at, onboarding_completed_at FROM tenants
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
