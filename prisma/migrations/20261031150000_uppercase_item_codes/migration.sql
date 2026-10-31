-- Duplicating a dish made a code with a lower-case suffix ("BURGER-1-copy"),
-- while every form, import and API lookup upper-cases a code first. Such a
-- dish could not be found by its code: it could not be deleted from the menu
-- editor, and saving it or re-importing it created a second dish instead.
-- Upper-case those codes.
--
-- Only the letter case of the code changes; a code whose upper-case form is
-- already taken by another dish in the same restaurant is left as it is.
UPDATE "menu_items" AS i
SET "itemCode" = upper(i."itemCode")
WHERE i."itemCode" <> upper(i."itemCode")
  AND NOT EXISTS (
    SELECT 1
    FROM "menu_items" AS other
    WHERE other."businessId" = i."businessId"
      AND other."itemCode" = upper(i."itemCode")
  );
