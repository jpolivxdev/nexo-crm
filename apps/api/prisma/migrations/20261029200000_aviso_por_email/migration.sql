-- Avisos para a dona e prazo do "oferecer o próximo horário". Só adiciona colunas.
ALTER TABLE "tenants" ADD COLUMN "notify_email" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "next_visit_days" INTEGER DEFAULT 0;
