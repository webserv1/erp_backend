-- Sales multi-select uses normalized junction tables. No PostgreSQL array columns are created.
CREATE TABLE "SaleBrand" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,
    CONSTRAINT "SaleBrand_pkey" PRIMARY KEY ("saleId", "productMasterId")
);

CREATE TABLE "SaleColor" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,
    CONSTRAINT "SaleColor_pkey" PRIMARY KEY ("saleId", "productMasterId")
);

CREATE TABLE "SaleSize" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,
    CONSTRAINT "SaleSize_pkey" PRIMARY KEY ("saleId", "productMasterId")
);

CREATE INDEX "SaleBrand_productMasterId_idx" ON "SaleBrand"("productMasterId");
CREATE INDEX "SaleColor_productMasterId_idx" ON "SaleColor"("productMasterId");
CREATE INDEX "SaleSize_productMasterId_idx" ON "SaleSize"("productMasterId");

ALTER TABLE "SaleBrand" ADD CONSTRAINT "SaleBrand_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleBrand" ADD CONSTRAINT "SaleBrand_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleColor" ADD CONSTRAINT "SaleColor_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleColor" ADD CONSTRAINT "SaleColor_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleSize" ADD CONSTRAINT "SaleSize_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleSize" ADD CONSTRAINT "SaleSize_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing sales by converting each legacy single selection into one junction row.
INSERT INTO "SaleBrand" ("saleId", "productMasterId") SELECT "id", "brandId" FROM "Sale" WHERE "brandId" IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "SaleColor" ("saleId", "productMasterId") SELECT "id", "colorId" FROM "Sale" WHERE "colorId" IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "SaleSize" ("saleId", "productMasterId") SELECT "id", "sizeId" FROM "Sale" WHERE "sizeId" IS NOT NULL ON CONFLICT DO NOTHING;
