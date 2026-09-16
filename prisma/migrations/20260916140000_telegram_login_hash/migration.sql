-- CreateTable
CREATE TABLE "telegram_login_hashes" (
    "hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telegram_login_hashes_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "telegram_login_hashes_expires_at_idx" ON "telegram_login_hashes"("expires_at");
