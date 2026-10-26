-- Segurança do banco (SEGURANCA.md, seção 3). Escrito à mão: o Prisma não modela RLS nem EXCLUDE.

-- 1. Papel da aplicação: sem superusuário, sem BYPASSRLS, sem login por padrão.
--    A senha e o LOGIN são definidos fora das migrações (script local ou painel do provedor).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    CREATE ROLE nexo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app;
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM nexo_app;
  END IF;
END
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app;

-- 2. Auditoria só de inclusão: a aplicação não altera nem apaga registros.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM nexo_app;

-- 3. Negócio da sessão. Definido por transação com set_config('app.tenant_id', ..., true).
--    Sem negócio definido, nenhuma linha aparece.
CREATE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- 4. RLS ligado e forçado (vale até para o dono das tabelas).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'professionals', 'services', 'professional_services', 'availability', 'time_off',
    'appointments', 'reminders', 'contacts', 'consents', 'conversations', 'messages',
    'pipelines', 'stages', 'deals', 'tasks', 'events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t
    );
  END LOOP;
END
$$;

-- Auditoria: lê só o próprio negócio; grava no próprio negócio ou sem negócio (ações de admin/login).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_logs FOR SELECT
  USING (tenant_id = app_current_tenant());
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant());

-- 5. Horário duplo: dois horários ativos do mesmo profissional não podem se sobrepor.
--    O próprio banco recusa a segunda reserva, mesmo em pedidos simultâneos.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_valid_range CHECK (ends_at > starts_at);

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('SCHEDULED', 'CONFIRMED'));

-- 6. Coerência básica de agenda.
ALTER TABLE availability
  ADD CONSTRAINT availability_valid CHECK (
    weekday BETWEEN 0 AND 6 AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute
  );
ALTER TABLE services
  ADD CONSTRAINT services_valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 1440);
ALTER TABLE time_off
  ADD CONSTRAINT time_off_valid_range CHECK (ends_at > starts_at);
