CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "colorId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sale_companyId_itemCode_key" ON "Sale"("companyId", "itemCode");

CREATE INDEX "Sale_companyId_sizeId_idx" ON "Sale"("companyId", "sizeId");

CREATE INDEX "Sale_companyId_colorId_idx" ON "Sale"("companyId", "colorId");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;