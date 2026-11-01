-- Additive: the restaurant's own figure for the welcome message shown when the
-- menu opens. Nullable; every existing row keeps no figure.
ALTER TABLE "businesses" ADD COLUMN "welcomeMediaId" TEXT;
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_welcomeMediaId_fkey" FOREIGN KEY ("welcomeMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
