-- CreateEnum
CREATE TYPE "manager_role" AS ENUM ('ADMIN', 'MANAGER');

-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "role" "manager_role" NOT NULL DEFAULT 'MANAGER',
ADD COLUMN     "login" TEXT,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "managers_login_key" ON "managers"("login");
