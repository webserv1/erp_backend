-- DropIndex
DROP INDEX "ProductMaster_companyId_type_categoryId_name_key";

-- RenameIndex
ALTER INDEX "ProductMaster_companyId_type_name_without_category_key" RENAME TO "ProductMaster_companyId_type_name_key";
