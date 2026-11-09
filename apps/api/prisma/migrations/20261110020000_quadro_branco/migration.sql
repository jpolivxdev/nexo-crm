-- Premium P7 (10/11/2026): Quadro branco. Cada quadro guarda os desenhos (JSON conferido pelo
-- servidor) e as imagens à parte (até 5 MB cada). Quadro arquivado sai da lista e fica no banco.
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "boards_tenant_id_id_key" ON "boards"("tenant_id", "id");
CREATE INDEX "boards_tenant_id_idx" ON "boards"("tenant_id");
ALTER TABLE "boards" ADD CONSTRAINT "boards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "board_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "board_files_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "board_files_board_id_idx" ON "board_files"("board_id");
CREATE INDEX "board_files_tenant_id_idx" ON "board_files"("tenant_id");
ALTER TABLE "board_files" ADD CONSTRAINT "board_files_tenant_id_board_id_fkey" FOREIGN KEY ("tenant_id", "board_id") REFERENCES "boards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "boards" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "board_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "board_files" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "board_files" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

REVOKE DELETE, TRUNCATE ON boards, board_files FROM nexo_app;
