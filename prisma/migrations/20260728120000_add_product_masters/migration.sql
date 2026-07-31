CREATE TYPE "MasterType" AS ENUM ('CATEGORY', 'BRAND', 'COLOR', 'SIZE');

CREATE TABLE "ProductMaster" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" "MasterType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductMaster_companyId_type_name_key" ON "ProductMaster"("companyId", "type", "name");

CREATE INDEX "ProductMaster_companyId_type_idx" ON "ProductMaster"("companyId", "type");