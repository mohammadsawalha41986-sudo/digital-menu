-- Menu layout and motion: section order, offers placement, hero and dish
-- photo effects, background style. Additive; defaults reproduce the menu
-- exactly as it is today.
ALTER TABLE "brand_themes"
  ADD COLUMN "sectionOrder" TEXT[] NOT NULL DEFAULT ARRAY['hero', 'menu', 'offers', 'reviews', 'location']::TEXT[],
  ADD COLUMN "offersInsideMenu" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "heroEffect" TEXT NOT NULL DEFAULT 'slide',
  ADD COLUMN "dishEffect" TEXT NOT NULL DEFAULT 'zoom',
  ADD COLUMN "backgroundStyle" TEXT NOT NULL DEFAULT 'solid';
