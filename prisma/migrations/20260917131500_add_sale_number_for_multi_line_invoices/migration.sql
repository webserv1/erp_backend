ALTER TABLE "Sale"
ADD COLUMN "saleNumber" TEXT;

CREATE INDEX "Sale_companyId_saleNumber_idx" ON "Sale"("companyId", "saleNumber");
