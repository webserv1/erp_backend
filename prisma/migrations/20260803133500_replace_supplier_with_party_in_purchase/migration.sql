ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_supplierId_fkey";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "supplierId";
ALTER TABLE "Purchase" ADD COLUMN "partyId" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "partyName" TEXT;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Purchase_companyId_supplierId_idx";
CREATE INDEX "Purchase_companyId_partyId_idx" ON "Purchase"("companyId", "partyId");