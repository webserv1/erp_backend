ALTER TABLE "Purchase"
ADD COLUMN "productName" TEXT;

UPDATE "Purchase" AS purchase
SET "productName" = product."productName"
FROM "Product" AS product
WHERE product."companyId" = purchase."companyId"
  AND product."productCode" = purchase."productCode";

UPDATE "Purchase" AS purchase
SET "totalPurchaseAmount" =
  COALESCE(purchase."quantity", 0)
  * CASE WHEN product."unit" = 'DOZEN' THEN 12 ELSE 1 END
  * COALESCE(purchase."purchasePrice", 0)
FROM "Product" AS product
WHERE product."companyId" = purchase."companyId"
  AND product."productCode" = purchase."productCode";

DROP INDEX "ProductMaster_companyId_type_name_key";

CREATE UNIQUE INDEX "ProductMaster_companyId_type_categoryId_name_key"
ON "ProductMaster" ("companyId", "type", "categoryId", "name")
WHERE "categoryId" IS NOT NULL;

CREATE UNIQUE INDEX "ProductMaster_companyId_type_name_without_category_key"
ON "ProductMaster" ("companyId", "type", "name")
WHERE "categoryId" IS NULL;
