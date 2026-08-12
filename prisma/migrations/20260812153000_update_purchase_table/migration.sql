ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_partyId_fkey";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "partyId";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "partyName";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "dueDate";
ALTER TABLE "Purchase" ADD COLUMN "supplierId" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "supplierName" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "productCode" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "remainingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Purchase_companyId_partyId_idx";
CREATE INDEX "Purchase_companyId_supplierId_idx" ON "Purchase"("companyId", "supplierId");