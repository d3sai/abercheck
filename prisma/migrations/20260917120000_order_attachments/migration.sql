-- CreateTable
CREATE TABLE "order_attachments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_telegram_id" BIGINT NOT NULL,
    "uploaded_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_attachments_order_id_idx" ON "order_attachments"("order_id");

-- AddForeignKey
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
