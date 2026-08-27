-- CreateEnum
CREATE TYPE "QrArtworkStyle" AS ENUM ('PLAIN', 'WITH_LOGO', 'WITH_NAME', 'WITH_PROMPT');

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "label" TEXT NOT NULL,
    "artwork" "QrArtworkStyle" NOT NULL DEFAULT 'PLAIN',
    "foreground" TEXT NOT NULL DEFAULT '#111111',
    "background" TEXT NOT NULL DEFAULT '#FFFFFF',
    "sizePx" INTEGER NOT NULL DEFAULT 512,
    "lastValidatedAt" TIMESTAMP(3),
    "lastContrast" DOUBLE PRECISION,
    "lastOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_codes_businessId_idx" ON "qr_codes"("businessId");

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
