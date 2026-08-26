-- `prisma migrate dev` diffs migrations against a throwaway shadow database.
-- Creating it up front avoids needing superuser rights at migration time.
CREATE DATABASE digital_profile_os_shadow OWNER dpos;
