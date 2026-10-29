-- Menu design controls on the brand: optional page / card / price colours
-- (null = derived from the brand palette), type size, spacing and photo
-- shape. Additive only; existing restaurants keep exactly what they had.
ALTER TABLE "brand_themes"
  ADD COLUMN "menuPage" TEXT,
  ADD COLUMN "menuCard" TEXT,
  ADD COLUMN "menuPrice" TEXT,
  ADD COLUMN "textScale" TEXT NOT NULL DEFAULT 'md',
  ADD COLUMN "spacing" TEXT NOT NULL DEFAULT 'regular',
  ADD COLUMN "imageShape" TEXT NOT NULL DEFAULT 'landscape';
