-- Section keys made by older imports for Arabic-only names had capitals
-- ("cat-ABC123"). Every form lowercases a key before looking it up, so those
-- sections could not take a dish from the builder. Lowercase them.
--
-- Only the key's letter case changes. Dishes point at sections by id, not by
-- key, so nothing is detached. A key whose lowercase form is already taken in
-- the same menu is left as it is rather than merged.
UPDATE "menu_categories" AS c
SET "key" = lower(c."key")
WHERE c."key" <> lower(c."key")
  AND NOT EXISTS (
    SELECT 1
    FROM "menu_categories" AS other
    WHERE other."menuId" = c."menuId"
      AND other."key" = lower(c."key")
  );
