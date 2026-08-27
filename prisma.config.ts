import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 keeps connection details out of the schema file. The URL is read
 * from the validated environment at CLI time; application code never reads
 * `process.env` directly (see src/lib/env.ts).
 */
/**
 * `env()` resolves eagerly and throws on a missing key, so the shadow database
 * is declared only when one is configured. `prisma migrate dev` wants it;
 * `generate`, `migrate deploy` and `migrate status` do not, and an image build
 * has no reason to carry one.
 */
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL
  ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
  : {};

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
    ...shadowDatabaseUrl,
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
