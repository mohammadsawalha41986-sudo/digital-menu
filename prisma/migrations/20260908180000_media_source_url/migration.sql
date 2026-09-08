-- Images added by URL rather than uploaded.
--
-- Additive and nullable: every existing row keeps its storageKey and reads
-- back as an uploaded file, so nothing that works today changes behaviour.
ALTER TABLE "media" ADD COLUMN "sourceUrl" TEXT;
