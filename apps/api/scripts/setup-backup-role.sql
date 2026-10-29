-- Papel só de leitura para o backup (SEGURANCA.md, A11). Rode UMA vez, como superusuário
-- (ou o administrador do Postgres do provedor), trocando a senha:
--   psql -U postgres -d nexo -v senha="'uma-senha-forte'" -f scripts/setup-backup-role.sql
--
-- Por que um papel à parte: as tabelas usam FORCE ROW LEVEL SECURITY, que vale até para o dono.
-- Sem ver todos os negócios, o pg_dump falha. Só superusuário cria papel com BYPASSRLS, por isso
-- isto não está nas migrações. O papel só lê (pg_read_all_data); não escreve nem apaga nada.
CREATE ROLE nexo_backup LOGIN PASSWORD :senha BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT pg_read_all_data TO nexo_backup;
