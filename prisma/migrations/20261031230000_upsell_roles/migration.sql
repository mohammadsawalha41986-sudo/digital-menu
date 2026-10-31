-- Additive: a section's role for automatic suggestions, and the switch for them.
-- No existing row is changed: a null role is read from the section's names.
ALTER TABLE "menu_categories" ADD COLUMN "role" TEXT;
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_role_check"
  CHECK ("role" IS NULL OR "role" IN ('MAIN', 'SIDE', 'DRINK', 'DESSERT', 'OTHER'));
ALTER TABLE "businesses" ADD COLUMN "autoUpsell" BOOLEAN NOT NULL DEFAULT true;
