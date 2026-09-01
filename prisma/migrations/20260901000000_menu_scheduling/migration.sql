-- Menu scheduling (master spec §57).
--
-- Breakfast, lunch, dinner, Ramadan, seasonal. A menu can now carry a date
-- window and a daily window, and is served only inside them.
--
-- Evaluated at read time rather than by a job flipping a flag, exactly as
-- offers already are: a cron that fails must never leave last month's menu on
-- a customer's phone.
--
-- All nullable, so every existing menu keeps being served exactly as before.

-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "startsAt" TIMESTAMP(3);
ALTER TABLE "menus" ADD COLUMN     "endsAt" TIMESTAMP(3);
ALTER TABLE "menus" ADD COLUMN     "dailyFrom" TEXT;
ALTER TABLE "menus" ADD COLUMN     "dailyTo" TEXT;
ALTER TABLE "menus" ADD COLUMN     "timezone" TEXT;
