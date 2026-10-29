-- Per-section layout on the public menu. Additive; every existing section
-- starts on `auto`, which fills the row by how many dishes it has.
ALTER TABLE "menu_categories" ADD COLUMN "displayStyle" TEXT NOT NULL DEFAULT 'auto';
