-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "public"."MasterType" AS ENUM ('CATEGORY', 'BRAND', 'COLOR', 'SIZE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."SaleUnit" AS ENUM ('PIECES', 'DOZEN');

-- CreateTable
CREATE TABLE "public"."Company" (
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "id" SERIAL NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyBranding" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "bgImageUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Expense" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL,
    "billUrl" TEXT,
    "createdById" INTEGER,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Party" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "partyName" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "partyProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "brandId" INTEGER NOT NULL,
    "colorId" INTEGER NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "productImage" TEXT,
    "gst" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brandIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "colorIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "sizeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "quantity" INTEGER,
    "unit" "public"."SaleUnit" NOT NULL DEFAULT 'PIECES',
    "purchasePrice" DECIMAL(12,2),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductMaster" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" "public"."MasterType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER,
    "quantity" INTEGER,
    "purchaseAmount" DOUBLE PRECISION,
    "saleAmount" DOUBLE PRECISION,
    "unit" "public"."SaleUnit" NOT NULL DEFAULT 'PIECES',

    CONSTRAINT "ProductMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Purchase" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "createdById" INTEGER,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "productCode" TEXT,
    "remainingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPurchaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "productName" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "generatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sale" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "sizeId" INTEGER,
    "colorId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "unit" "public"."SaleUnit" NOT NULL DEFAULT 'PIECES',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "partyId" INTEGER,
    "partyName" TEXT,
    "perSaleProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandId" INTEGER,
    "remarks" TEXT,
    "totalSaleProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SaleBrand" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,

    CONSTRAINT "SaleBrand_pkey" PRIMARY KEY ("saleId","productMasterId")
);

-- CreateTable
CREATE TABLE "public"."SaleColor" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,

    CONSTRAINT "SaleColor_pkey" PRIMARY KEY ("saleId","productMasterId")
);

-- CreateTable
CREATE TABLE "public"."SaleSize" (
    "saleId" INTEGER NOT NULL,
    "productMasterId" INTEGER NOT NULL,

    CONSTRAINT "SaleSize_pkey" PRIMARY KEY ("saleId","productMasterId")
);

-- CreateTable
CREATE TABLE "public"."Stock" (
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

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "mobile" TEXT NOT NULL,
    "gender" "public"."Gender" NOT NULL,
    "address" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "signatureUrl" TEXT NOT NULL,
    "aadhaarUrl" TEXT NOT NULL,
    "panUrl" TEXT NOT NULL,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."session" (
    "sid" VARCHAR(255) NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBranding_companyId_unique" ON "public"."CompanyBranding"("companyId" ASC);

-- CreateIndex
CREATE INDEX "Expense_companyId_category_idx" ON "public"."Expense"("companyId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "public"."Expense"("companyId" ASC);

-- CreateIndex
CREATE INDEX "Party_companyId_idx" ON "public"."Party"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Party_companyId_mobile_key" ON "public"."Party"("companyId" ASC, "mobile" ASC);

-- CreateIndex
CREATE INDEX "Product_companyId_brandId_idx" ON "public"."Product"("companyId" ASC, "brandId" ASC);

-- CreateIndex
CREATE INDEX "Product_companyId_categoryId_idx" ON "public"."Product"("companyId" ASC, "categoryId" ASC);

-- CreateIndex
CREATE INDEX "Product_companyId_colorId_idx" ON "public"."Product"("companyId" ASC, "colorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_productCode_key" ON "public"."Product"("companyId" ASC, "productCode" ASC);

-- CreateIndex
CREATE INDEX "Product_companyId_sizeId_idx" ON "public"."Product"("companyId" ASC, "sizeId" ASC);

-- CreateIndex
CREATE INDEX "ProductMaster_companyId_categoryId_idx" ON "public"."ProductMaster"("companyId" ASC, "categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMaster_companyId_type_categoryId_name_key" ON "public"."ProductMaster"("companyId" ASC, "type" ASC, "categoryId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "ProductMaster_companyId_type_idx" ON "public"."ProductMaster"("companyId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMaster_companyId_type_name_without_category_key" ON "public"."ProductMaster"("companyId" ASC, "type" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "Purchase_companyId_purchaseNumber_idx" ON "public"."Purchase"("companyId" ASC, "purchaseNumber" ASC);

-- CreateIndex
CREATE INDEX "Purchase_companyId_status_idx" ON "public"."Purchase"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Purchase_companyId_supplierId_idx" ON "public"."Purchase"("companyId" ASC, "supplierId" ASC);

-- CreateIndex
CREATE INDEX "Report_companyId_periodStart_idx" ON "public"."Report"("companyId" ASC, "periodStart" ASC);

-- CreateIndex
CREATE INDEX "Report_companyId_type_idx" ON "public"."Report"("companyId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "public"."Role"("name" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_brandId_idx" ON "public"."Sale"("companyId" ASC, "brandId" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_colorId_idx" ON "public"."Sale"("companyId" ASC, "colorId" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_paymentStatus_idx" ON "public"."Sale"("companyId" ASC, "paymentStatus" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_productCode_idx" ON "public"."Sale"("companyId" ASC, "productCode" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_sizeId_idx" ON "public"."Sale"("companyId" ASC, "sizeId" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_status_idx" ON "public"."Sale"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Sale_companyId_supplierId_idx" ON "public"."Sale"("companyId" ASC, "supplierId" ASC);

-- CreateIndex
CREATE INDEX "SaleBrand_productMasterId_idx" ON "public"."SaleBrand"("productMasterId" ASC);

-- CreateIndex
CREATE INDEX "SaleColor_productMasterId_idx" ON "public"."SaleColor"("productMasterId" ASC);

-- CreateIndex
CREATE INDEX "SaleSize_productMasterId_idx" ON "public"."SaleSize"("productMasterId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Stock_companyId_productCode_key" ON "public"."Stock"("companyId" ASC, "productCode" ASC);

-- CreateIndex
CREATE INDEX "Stock_companyId_sizeId_idx" ON "public"."Stock"("companyId" ASC, "sizeId" ASC);

-- CreateIndex
CREATE INDEX "Stock_companyId_status_idx" ON "public"."Stock"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "public"."Supplier"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_mobile_key" ON "public"."Supplier"("companyId" ASC, "mobile" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "public"."User"("companyId" ASC, "email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_mobile_key" ON "public"."User"("companyId" ASC, "mobile" ASC);

-- CreateIndex
CREATE INDEX "User_companyId_roleId_idx" ON "public"."User"("companyId" ASC, "roleId" ASC);

-- CreateIndex
CREATE INDEX "User_resetToken_idx" ON "public"."User"("resetToken" ASC);

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "public"."session"("expire" ASC);

-- AddForeignKey
ALTER TABLE "public"."CompanyBranding" ADD CONSTRAINT "CompanyBranding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Party" ADD CONSTRAINT "Party_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "public"."Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleBrand" ADD CONSTRAINT "SaleBrand_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleBrand" ADD CONSTRAINT "SaleBrand_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleColor" ADD CONSTRAINT "SaleColor_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleColor" ADD CONSTRAINT "SaleColor_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleSize" ADD CONSTRAINT "SaleSize_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleSize" ADD CONSTRAINT "SaleSize_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Stock" ADD CONSTRAINT "Stock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Stock" ADD CONSTRAINT "Stock_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "public"."ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
