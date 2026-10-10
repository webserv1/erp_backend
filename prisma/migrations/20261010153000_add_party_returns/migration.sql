CREATE TABLE "public"."PartyReturn" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "saleNumber" TEXT,
  "partyId" INTEGER,
  "partyName" TEXT NOT NULL,
  "shopName" TEXT NOT NULL,
  "productDetails" JSONB,
  "amountDetails" JSONB,
  "reason" TEXT NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL,
  "returnDate" DATE NOT NULL,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartyReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartyReturn_companyId_saleNumber_idx"
  ON "public"."PartyReturn"("companyId", "saleNumber");

CREATE INDEX "PartyReturn_companyId_partyId_idx"
  ON "public"."PartyReturn"("companyId", "partyId");

CREATE INDEX "PartyReturn_companyId_returnDate_idx"
  ON "public"."PartyReturn"("companyId", "returnDate");

ALTER TABLE "public"."PartyReturn"
ADD CONSTRAINT "PartyReturn_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PartyReturn"
ADD CONSTRAINT "PartyReturn_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "public"."Party"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."PartyReturn"
ADD CONSTRAINT "PartyReturn_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
