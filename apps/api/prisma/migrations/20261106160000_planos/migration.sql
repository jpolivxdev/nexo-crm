-- Planos Grátis / CRM / Completo. BASIC vira COMPLETE: todo negócio que já existe continua
-- com tudo liberado, como antes. Nada é apagado.
ALTER TYPE "Plan" RENAME VALUE 'BASIC' TO 'COMPLETE';
ALTER TYPE "Plan" ADD VALUE 'FREE' BEFORE 'COMPLETE';
ALTER TYPE "Plan" ADD VALUE 'CRM' BEFORE 'COMPLETE';
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'COMPLETE';

-- O admin nexo vê o plano na lista de negócios (o diretório continua sem dado de cliente).
ALTER TABLE "tenant_directory" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'COMPLETE';

CREATE OR REPLACE FUNCTION sync_tenant_directory() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  INSERT INTO tenant_directory (id, name, niche, plan, created_at, onboarding_started_at, onboarding_completed_at)
  VALUES (NEW.id, NEW.name, NEW.niche, NEW.plan, NEW.created_at, NEW.onboarding_started_at, NEW.onboarding_completed_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    niche = EXCLUDED.niche,
    plan = EXCLUDED.plan,
    onboarding_started_at = EXCLUDED.onboarding_started_at,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sync_tenant_directory() FROM PUBLIC;
