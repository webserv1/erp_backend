CREATE TABLE "public"."ProfitWithdrawal" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sqAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "arsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "entryDate" DATE NOT NULL,
  "notes" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfitWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."SalaryEntry" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sqAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "arsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "workerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "entryDate" DATE NOT NULL,
  "notes" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalaryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfitWithdrawal_companyId_entryDate_idx"
  ON "public"."ProfitWithdrawal"("companyId", "entryDate");

CREATE INDEX "SalaryEntry_companyId_entryDate_idx"
  ON "public"."SalaryEntry"("companyId", "entryDate");

ALTER TABLE "public"."ProfitWithdrawal"
ADD CONSTRAINT "ProfitWithdrawal_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ProfitWithdrawal"
ADD CONSTRAINT "ProfitWithdrawal_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."SalaryEntry"
ADD CONSTRAINT "SalaryEntry_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."SalaryEntry"
ADD CONSTRAINT "SalaryEntry_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
