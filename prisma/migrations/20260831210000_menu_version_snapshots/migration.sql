-- Menu version snapshots (master spec §84, §85).
--
-- A published version previously recorded only that a publish had happened.
-- These columns give it the content to go back to, the change counts the
-- history list shows, and a note of which version a rollback restored.
--
-- All nullable: versions published before this migration keep their rows and
-- are reported as un-restorable rather than being deleted or back-filled with
-- content that was never actually theirs.

-- AlterTable
ALTER TABLE "menu_versions" ADD COLUMN     "snapshot" JSONB;
ALTER TABLE "menu_versions" ADD COLUMN     "summary" JSONB;
ALTER TABLE "menu_versions" ADD COLUMN     "restoredFromVersion" INTEGER;
