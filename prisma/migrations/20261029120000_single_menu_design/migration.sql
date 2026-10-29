-- One menu design for every business. The ten earlier families were
-- withdrawn; their variant letters described unrelated layouts, so moved
-- businesses start on the default photo layout ('a'). No row is deleted and
-- no public id, slug or QR destination changes.
UPDATE "businesses"
SET "templateKey" = 'street-food', "variantKey" = 'a'
WHERE "templateKey" <> 'street-food';

ALTER TABLE "businesses" ALTER COLUMN "templateKey" SET DEFAULT 'street-food';
