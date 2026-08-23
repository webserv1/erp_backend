ALTER TABLE "Supplier"
ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Purchase"
ADD COLUMN "totalPurchaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Purchase" AS purchase
SET "totalPurchaseAmount" =
  COALESCE(product."quantity", 0) * COALESCE(product."purchasePrice", 0)
FROM "Product" AS product
WHERE product."companyId" = purchase."companyId"
  AND product."productCode" = purchase."productCode";

UPDATE "Supplier" AS supplier
SET "paidAmount" = COALESCE((
  SELECT SUM(purchase."paidAmount")
  FROM "Purchase" AS purchase
  WHERE purchase."supplierId" = supplier."id"
), 0);
