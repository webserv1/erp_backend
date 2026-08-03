CREATE TABLE "CompanyBranding" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "bgImageUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyBranding_companyId_unique" UNIQUE ("companyId")
);

ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;