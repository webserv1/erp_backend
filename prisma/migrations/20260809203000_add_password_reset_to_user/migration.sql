ALTER TABLE "User" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpiry" TIMESTAMP(3);
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");