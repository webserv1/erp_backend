-- Add payment information to Sale without removing legacy data.
ALTER TABLE "Sale"
  ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- Keep the existing legacy total column, but make it safe for new Sales records
-- now that totals are no longer calculated or returned by the Sales API.
ALTER TABLE "Sale" ALTER COLUMN "total" SET DEFAULT 0;

CREATE INDEX "Sale_companyId_paymentStatus_idx" ON "Sale"("companyId", "paymentStatus");
