ALTER TABLE "public"."PartyReturn"
ADD COLUMN "netTotalSalePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "invoicePaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "transport" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "invoiceRemainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID';

CREATE TABLE "public"."PartyReturnItem" (
  "id" SERIAL NOT NULL,
  "partyReturnId" INTEGER NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" "public"."SaleUnit" NOT NULL DEFAULT 'PIECES',
  "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalSalePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartyReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartyReturnItem_partyReturnId_idx"
  ON "public"."PartyReturnItem"("partyReturnId");

ALTER TABLE "public"."PartyReturnItem"
ADD CONSTRAINT "PartyReturnItem_partyReturnId_fkey"
FOREIGN KEY ("partyReturnId") REFERENCES "public"."PartyReturn"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PartyReturn"
DROP COLUMN IF EXISTS "productDetails",
DROP COLUMN IF EXISTS "amountDetails";
