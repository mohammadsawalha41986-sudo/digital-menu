-- Additive: marks the dish links written from the automatic suggestions, so
-- turning those suggestions off clears only what the menu itself wrote. Every
-- existing row keeps false, which is the restaurant's own picks.
ALTER TABLE "menu_items" ADD COLUMN "pairsAuto" BOOLEAN NOT NULL DEFAULT false;
