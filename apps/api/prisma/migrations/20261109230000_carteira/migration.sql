-- Premium P3 (09/11/2026): regras da Carteira de clientes (dias para atenção, risco e perdida).
-- Só acrescenta; vazio vale o padrão (30, 45 e 90 dias).
ALTER TABLE "tenants" ADD COLUMN "portfolio_rules" JSONB NOT NULL DEFAULT '{}';
