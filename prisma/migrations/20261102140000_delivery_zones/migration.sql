-- Delivery by distance: where it is measured from, and what each band costs.
-- Additive only: two nullable columns and a new table. No existing row changes.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "deliveryLat" DECIMAL(9,6),
ADD COLUMN "deliveryLng" DECIMAL(9,6);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "maxMeters" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_zones_businessId_maxMeters_idx" ON "delivery_zones"("businessId", "maxMeters");

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
