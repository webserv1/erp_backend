-- Adds purchase price, stock quantity, and sale unit (PIECES/DOZN) to the Product model.
-- NOTE: The live database already contains these columns (they were applied
-- in a previous, git-discarded migration). This file documents the change for
-- fresh databases and keeps the migration history in sync with the schema.
ALTER TABLE "Product" ADD COLUMN "purchasePrice" NUMERIC;
ALTER TABLE "Product" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "Product" ADD COLUMN "unit" "SaleUnit" NOT NULL DEFAULT 'PIECES';
