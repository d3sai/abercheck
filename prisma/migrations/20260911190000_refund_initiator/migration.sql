-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_initiated_by_fkey";

-- AlterTable
ALTER TABLE "refunds" DROP COLUMN "initiated_by",
ADD COLUMN     "initiated_by_name" TEXT NOT NULL,
ADD COLUMN     "initiated_by_telegram_id" BIGINT NOT NULL;
