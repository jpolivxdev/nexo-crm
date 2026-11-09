-- Premium P6 (10/11/2026): Wiki do negócio. Categorias, artigos e anexos (guardados no banco,
-- até 5 MB cada). Artigo e anexo não são apagados: são arquivados (archived_at / deleted_at).
CREATE TABLE "wiki_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wiki_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wiki_categories_tenant_id_id_key" ON "wiki_categories"("tenant_id", "id");
CREATE INDEX "wiki_categories_tenant_id_idx" ON "wiki_categories"("tenant_id");
ALTER TABLE "wiki_categories" ADD CONSTRAINT "wiki_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "wiki_articles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "wiki_articles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wiki_articles_tenant_id_id_key" ON "wiki_articles"("tenant_id", "id");
CREATE INDEX "wiki_articles_tenant_id_idx" ON "wiki_articles"("tenant_id");
ALTER TABLE "wiki_articles" ADD CONSTRAINT "wiki_articles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wiki_articles" ADD CONSTRAINT "wiki_articles_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "wiki_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "wiki_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wiki_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wiki_attachments_article_id_idx" ON "wiki_attachments"("article_id");
CREATE INDEX "wiki_attachments_tenant_id_idx" ON "wiki_attachments"("tenant_id");
ALTER TABLE "wiki_attachments" ADD CONSTRAINT "wiki_attachments_tenant_id_article_id_fkey" FOREIGN KEY ("tenant_id", "article_id") REFERENCES "wiki_articles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wiki_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wiki_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "wiki_categories" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "wiki_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wiki_articles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "wiki_articles" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
ALTER TABLE "wiki_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wiki_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "wiki_attachments" USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- Artigos e anexos não são apagados pela aplicação (só arquivados).
REVOKE DELETE, TRUNCATE ON wiki_articles, wiki_attachments FROM nexo_app;
