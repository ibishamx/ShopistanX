-- CreateEnum
CREATE TYPE "SettlementMatch" AS ENUM ('MATCHED', 'AMOUNT_MISMATCH', 'NOT_DELIVERED', 'UNKNOWN_TRACKING', 'DUPLICATE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "holdReason" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "onHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskDetail" JSONB,
ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "orderRules" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "cod_settlements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "courierName" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fileName" TEXT,
    "totalPaisa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_settlement_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "orderId" UUID,
    "match" "SettlementMatch" NOT NULL,

    CONSTRAINT "cod_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cod_settlements_tenant_id_createdAt_idx" ON "cod_settlements"("tenant_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cod_settlements_tenant_id_id_key" ON "cod_settlements"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "cod_settlement_lines_tenant_id_settlementId_idx" ON "cod_settlement_lines"("tenant_id", "settlementId");

-- CreateIndex
CREATE INDEX "cod_settlement_lines_tenant_id_orderId_idx" ON "cod_settlement_lines"("tenant_id", "orderId");

-- CreateIndex
CREATE INDEX "orders_tenant_id_trackingNumber_idx" ON "orders"("tenant_id", "trackingNumber");

-- CreateIndex
CREATE INDEX "orders_phone_idx" ON "orders"("phone");

-- AddForeignKey
ALTER TABLE "cod_settlement_lines" ADD CONSTRAINT "cod_settlement_lines_tenant_id_settlementId_fkey" FOREIGN KEY ("tenant_id", "settlementId") REFERENCES "cod_settlements"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_settlement_lines" ADD CONSTRAINT "cod_settlement_lines_tenant_id_orderId_fkey" FOREIGN KEY ("tenant_id", "orderId") REFERENCES "orders"("tenant_id", "id") ON DELETE SET NULL ("orderId") ON UPDATE CASCADE;

-- Tenant isolation for the new tables (same policy as every tenant table).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cod_settlements', 'cod_settlement_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.tenant_id'')::uuid)
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'')::uuid)', t);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
      t, t || '_tenant_fk');
  END LOOP;
END $$;
