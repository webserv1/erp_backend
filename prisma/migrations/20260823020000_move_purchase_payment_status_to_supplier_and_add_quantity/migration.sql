ALTER TABLE "Supplier"
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';

ALTER TABLE "Purchase"
ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "Purchase" AS purchase
SET "quantity" = COALESCE(product."quantity", 0)
FROM "Product" AS product
WHERE product."companyId" = purchase."companyId"
  AND product."productCode" = purchase."productCode";

UPDATE "Supplier" AS supplier
SET "paymentStatus" = COALESCE((
  SELECT purchase."paymentStatus"
  FROM "Purchase" AS purchase
  WHERE purchase."supplierId" = supplier."id"
  ORDER BY purchase."updatedAt" DESC
  LIMIT 1
), 'UNPAID');

DROP INDEX "Purchase_companyId_paymentStatus_idx";

ALTER TABLE "Purchase"
DROP COLUMN "paymentStatus";
