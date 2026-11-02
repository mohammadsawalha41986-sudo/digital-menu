-- Import idempotency: a confirmed import records the key from its preview.
-- Nullable, so every existing batch stays valid. The unique index is what stops
-- a second confirm with the same key from applying the same rows twice.
-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN "importKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_businessId_importKey_key" ON "import_batches"("businessId", "importKey");
