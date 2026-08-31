-- Structured nutrition fields (master spec §05, §105-§107).
--
-- Calories and allergens were the whole model. Saudi menu regulation asks for
-- more than that, and a compliance-readiness check cannot report on fields
-- that do not exist.
--
-- Every column is nullable, deliberately: a field the business has not filled
-- in must stay distinguishable from one whose true value is zero. Nothing here
-- is ever computed or estimated by the platform.
--
-- Gram values are stored as tenths of a gram in an integer, for the same
-- reason prices are stored in minor units: no float touches the database.

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "caffeineMg" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "sodiumMg" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "proteinDeci" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "carbsDeci" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "fatDeci" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "fibreDeci" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "sugarDeci" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN     "highSalt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menu_items" ADD COLUMN     "activityNoteAr" TEXT;
ALTER TABLE "menu_items" ADD COLUMN     "activityNoteEn" TEXT;
