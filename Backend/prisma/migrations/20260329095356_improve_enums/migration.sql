/*
  Warnings:

  - You are about to drop the column `isPremium` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('ADVISOR', 'PERSONAL', 'FRIEND');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isPremium",
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'ADVISOR';
