-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('REGULAR', 'MINUS_CLOSING');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "order_type" "order_type" NOT NULL DEFAULT 'REGULAR';
