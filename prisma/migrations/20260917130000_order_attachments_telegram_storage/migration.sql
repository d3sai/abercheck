-- AlterTable
ALTER TABLE "order_attachments" DROP COLUMN "storage_key",
ADD COLUMN     "telegram_file_id" TEXT NOT NULL,
ADD COLUMN     "telegram_message_id" INTEGER NOT NULL;
