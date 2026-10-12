CREATE TABLE "public"."SupplierReturn" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "purchaseNumber" TEXT,
  "supplierId" INTEGER,
  "supplierName" TEXT NOT NULL,
  "supplierAddress" TEXT NOT NULL,
  "invoiceDate" DATE NOT NULL,
  "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "returnAmountReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."SupplierReturnItem" (
  "id" SERIAL NOT NULL,
  "supplierReturnId" INTEGER NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sizeName" TEXT,
  "colorName" TEXT,
  "brandName" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit" "public"."SaleUnit" NOT NULL DEFAULT 'PIECES',
  "purchaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalPurchaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierReturn_companyId_purchaseNumber_idx"
  ON "public"."SupplierReturn"("companyId", "purchaseNumber");
CREATE INDEX "SupplierReturn_companyId_supplierId_idx"
  ON "public"."SupplierReturn"("companyId", "supplierId");
CREATE INDEX "SupplierReturn_companyId_invoiceDate_idx"
  ON "public"."SupplierReturn"("companyId", "invoiceDate");
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx"
  ON "public"."SupplierReturnItem"("supplierReturnId");

ALTER TABLE "public"."SupplierReturn"
ADD CONSTRAINT "SupplierReturn_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."SupplierReturn"
ADD CONSTRAINT "SupplierReturn_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."SupplierReturn"
ADD CONSTRAINT "SupplierReturn_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."SupplierReturnItem"
ADD CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey"
FOREIGN KEY ("supplierReturnId") REFERENCES "public"."SupplierReturn"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
