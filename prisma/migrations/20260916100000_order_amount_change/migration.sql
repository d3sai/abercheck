-- CreateTable
CREATE TABLE "order_amount_changes" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "previous_amount_due" DECIMAL(14,2) NOT NULL,
    "new_amount_due" DECIMAL(14,2) NOT NULL,
    "changed_by_telegram_id" BIGINT NOT NULL,
    "changed_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_amount_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_amount_changes_order_id_idx" ON "order_amount_changes"("order_id");

-- AddForeignKey
ALTER TABLE "order_amount_changes" ADD CONSTRAINT "order_amount_changes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
