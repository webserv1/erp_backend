ALTER TABLE "Product"
  ADD COLUMN "brandIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "colorIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "sizeIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "Product"
SET
  "brandIds" = ARRAY["brandId"],
  "colorIds" = ARRAY["colorId"],
  "sizeIds" = ARRAY["sizeId"];
