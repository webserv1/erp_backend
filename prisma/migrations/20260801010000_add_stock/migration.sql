CREATE TABLE "Stock" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "qtyIn" INTEGER NOT NULL DEFAULT 0,
    "qtyOut" INTEGER NOT NULL DEFAULT 0,
    "balanceStock" INTEGER NOT NULL DEFAULT 0,
    "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saleValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Stock_companyId_productCode_key" ON "Stock"("companyId", "productCode");

CREATE INDEX "Stock_companyId_sizeId_idx" ON "Stock"("companyId", "sizeId");

CREATE INDEX "Stock_companyId_status_idx" ON "Stock"("companyId", "status");

ALTER TABLE "Stock" ADD CONSTRAINT "Stock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Stock" ADD CONSTRAINT "Stock_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;