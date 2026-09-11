-- CreateEnum
CREATE TYPE "manager_status" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "status" "manager_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "username" TEXT;
