-- Restore the profile fields required for ERP users. The development database
-- was reset before this migration, so adding required columns is safe.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

ALTER TABLE "User"
  ADD COLUMN "dateOfBirth" DATE NOT NULL,
  ADD COLUMN "mobile" TEXT NOT NULL,
  ADD COLUMN "gender" "Gender" NOT NULL,
  ADD COLUMN "address" TEXT NOT NULL,
  ADD COLUMN "photoUrl" TEXT NOT NULL,
  ADD COLUMN "signatureUrl" TEXT NOT NULL;

CREATE UNIQUE INDEX "User_companyId_mobile_key" ON "User"("companyId", "mobile");
