-- Additive: per-dish discounts and the offers-section settings.
ALTER TABLE "businesses" ADD COLUMN "offersSort" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "businesses" ADD COLUMN "discountIncludesOptions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "menu_items" ADD COLUMN "discountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menu_items" ADD COLUMN "discountMode" TEXT;
ALTER TABLE "menu_items" ADD COLUMN "discountValue" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN "discountStartsAt" TIMESTAMP(3);
ALTER TABLE "menu_items" ADD COLUMN "discountEndsAt" TIMESTAMP(3);
ALTER TABLE "menu_items" ADD COLUMN "discountBranchKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "menu_items" ADD COLUMN "discountSortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "menu_items" ADD COLUMN "discountUpdatedAt" TIMESTAMP(3);

-- Database-level guards behind the server's own checks.
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_discount_mode_check"
  CHECK ("discountMode" IS NULL OR "discountMode" IN ('PERCENT', 'AMOUNT', 'PRICE'));
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_discount_value_check"
  CHECK ("discountValue" IS NULL OR "discountValue" > 0);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_discount_window_check"
  CHECK ("discountStartsAt" IS NULL OR "discountEndsAt" IS NULL OR "discountEndsAt" > "discountStartsAt");
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_offers_sort_check"
  CHECK ("offersSort" IN ('PERCENT', 'SAVING', 'NEWEST', 'ENDING', 'MANUAL'));
