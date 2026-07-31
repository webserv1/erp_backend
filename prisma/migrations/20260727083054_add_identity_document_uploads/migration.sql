/*
  Warnings:

  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - Added the required column `aadhaarUrl` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `panUrl` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "phone",
ADD COLUMN     "aadhaarUrl" TEXT NOT NULL,
ADD COLUMN     "panUrl" TEXT NOT NULL;
