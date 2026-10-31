-- Additive: option calories and per-option quantity, group description.
ALTER TABLE "modifier_groups" ADD COLUMN "descriptionAr" TEXT;
ALTER TABLE "modifier_groups" ADD COLUMN "descriptionEn" TEXT;
ALTER TABLE "modifier_options" ADD COLUMN "caloriesDelta" INTEGER;
ALTER TABLE "modifier_options" ADD COLUMN "maxQty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_maxQty_check" CHECK ("maxQty" >= 1 AND "maxQty" <= 20);
