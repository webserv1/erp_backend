ALTER TABLE "Sale" ADD COLUMN "supplierId" INTEGER;

ALTER TABLE "Sale" ADD COLUMN "supplierName" TEXT;

ALTER TABLE "Sale" ADD COLUMN "supplierMobile" TEXT;

ALTER TABLE "Sale" ADD COLUMN "supplierEmail" TEXT;

ALTER TABLE "Sale" ADD COLUMN "supplierAddress" TEXT;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Sale_companyId_supplierId_idx" ON "Sale"("companyId", "supplierId");