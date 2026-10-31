-- Hero banners chosen by the restaurant, and how long each hero slide stays.
-- Additive: no existing row changes; a restaurant without banners keeps the
-- automatic hero built from its offers and dishes.
ALTER TABLE "businesses" ADD COLUMN "heroIntervalSec" INTEGER NOT NULL DEFAULT 6;

CREATE TABLE "hero_banners" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "headingAr" TEXT,
    "headingEn" TEXT,
    "subheadingAr" TEXT,
    "subheadingEn" TEXT,
    "ctaLabelAr" TEXT,
    "ctaLabelEn" TEXT,
    "ctaUrl" TEXT,
    "overlay" INTEGER NOT NULL DEFAULT 0,
    "focalX" DOUBLE PRECISION,
    "focalY" DOUBLE PRECISION,
    "mobileFocalX" DOUBLE PRECISION,
    "mobileFocalY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hero_banners_businessId_sortOrder_idx" ON "hero_banners"("businessId", "sortOrder");

ALTER TABLE "hero_banners" ADD CONSTRAINT "hero_banners_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hero_banners" ADD CONSTRAINT "hero_banners_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
