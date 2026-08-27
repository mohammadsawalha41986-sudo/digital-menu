-- Enforce the public-identifier alphabet in the database.
--
-- Public ids are Crockford base32 minus I, L, O and U, so a printed code
-- cannot be misread as another valid code (master spec §122). The application
-- generates and validates them, but a row written by a migration, a fixture or
-- a direct SQL statement would bypass that — and an id containing an excluded
-- letter is silently unreachable, because the reader normalises it to a
-- different string and finds nothing.
--
-- A check constraint makes the alphabet a property of the data rather than a
-- convention of the code.
ALTER TABLE "businesses"
  ADD CONSTRAINT "businesses_publicId_alphabet"
  CHECK ("publicId" ~ '^[0-9A-HJ-KM-NP-TV-Z]{6}$');
