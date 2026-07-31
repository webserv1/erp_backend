ALTER TABLE "Purchase" ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Sale" ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Purchase_companyId_status_idx" ON "Purchase"("companyId", "status");

CREATE INDEX "Sale_companyId_status_idx" ON "Sale"("companyId", "status");