-- Removes supplier contact details from the Sale table.
-- Only supplierId and supplierName are retained (supplierMobile/Email/Address dropped).
-- The live database already contains these columns from a previously applied
-- (git-discarded) migration, so this is also applied directly against the DB.
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "supplierMobile";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "supplierEmail";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "supplierAddress";
