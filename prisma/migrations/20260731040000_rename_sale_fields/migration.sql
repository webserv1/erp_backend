ALTER TABLE "Sale" RENAME COLUMN "itemName" TO "productName";

ALTER TABLE "Sale" RENAME COLUMN "itemCode" TO "productCode";

DROP INDEX "Sale_companyId_itemCode_key";

CREATE UNIQUE INDEX "Sale_companyId_productCode_key" ON "Sale"("companyId", "productCode");