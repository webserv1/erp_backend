DROP INDEX "Purchase_companyId_purchaseNumber_key";

CREATE INDEX "Purchase_companyId_purchaseNumber_idx"
ON "Purchase" ("companyId", "purchaseNumber");
