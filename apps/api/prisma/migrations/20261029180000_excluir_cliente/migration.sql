-- Exclusão de dados de uma cliente final (direitos do titular, LGPD).
-- A linha da cliente fica, anônima, para os horários e relatórios continuarem certos.
ALTER TABLE "contacts" ADD COLUMN "erased_at" TIMESTAMPTZ;
