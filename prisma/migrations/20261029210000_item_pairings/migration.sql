-- Upsell: the dishes a restaurant suggests alongside each dish, by item code.
-- Additive; every existing dish starts with no suggestions.
ALTER TABLE "menu_items" ADD COLUMN "pairsWith" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
