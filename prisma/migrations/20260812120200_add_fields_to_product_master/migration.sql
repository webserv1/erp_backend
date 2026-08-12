ALTER TABLE "ProductMaster" ADD COLUMN "categoryId" INTEGER;
ALTER TABLE "ProductMaster" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "ProductMaster" ADD COLUMN "purchaseAmount" DOUBLE PRECISION;
ALTER TABLE "ProductMaster" ADD COLUMN "saleAmount" DOUBLE PRECISION;
CREATE INDEX "ProductMaster_companyId_categoryId_idx" ON "ProductMaster"("companyId", "categoryId");