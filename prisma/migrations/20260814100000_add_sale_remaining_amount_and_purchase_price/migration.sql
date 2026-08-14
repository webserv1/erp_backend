-- Additive fields only. Legacy purchase totals remain intact but are no longer used by the API.
ALTER TABLE "Sale"
  ADD COLUMN "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Purchase"
  ADD COLUMN "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
