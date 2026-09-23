-- DropIndex
DROP INDEX "ProductMaster_companyId_type_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProductMaster_companyId_type_categoryId_name_key"
ON "ProductMaster"("companyId", "type", "categoryId", "name");
