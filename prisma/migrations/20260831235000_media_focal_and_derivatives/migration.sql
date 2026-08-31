-- Focal points and responsive derivatives (master spec §47, §48, §50, §88).
--
-- Images were served exactly as uploaded, at one size, cropped from the
-- centre. That means a phone downloads a desktop-sized photograph, and a dish
-- positioned off-centre loses its subject to a square crop.
--
-- focalX/focalY are nullable rather than defaulted to 0.5 so that an image
-- someone deliberately centred stays distinguishable from one nobody has
-- looked at.

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "focalX" DOUBLE PRECISION;
ALTER TABLE "media" ADD COLUMN     "focalY" DOUBLE PRECISION;
ALTER TABLE "media" ADD COLUMN     "derivativeWidths" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
