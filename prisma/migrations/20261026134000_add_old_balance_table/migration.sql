CREATE TABLE "public"."OldBalance" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "partyId" INTEGER NOT NULL,
  "partyName" TEXT NOT NULL,
  "oldBalanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "billUrl" TEXT,
  "createdById" INTEGER,
  "status" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OldBalance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OldBalance_companyId_partyId_idx"
  ON "public"."OldBalance"("companyId", "partyId");
CREATE INDEX "OldBalance_companyId_status_idx"
  ON "public"."OldBalance"("companyId", "status");
CREATE INDEX "OldBalance_companyId_createdAt_idx"
  ON "public"."OldBalance"("companyId", "createdAt");

ALTER TABLE "public"."OldBalance"
ADD CONSTRAINT "OldBalance_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."OldBalance"
ADD CONSTRAINT "OldBalance_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "public"."Party"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."OldBalance"
ADD CONSTRAINT "OldBalance_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
