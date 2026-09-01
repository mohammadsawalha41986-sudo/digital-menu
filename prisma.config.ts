import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 keeps connection details out of the schema file. The URL is read
 * from the validated environment at CLI time; application code never reads
 * `process.env` directly (see src/lib/env.ts).
 */
/**
 * `env()` resolves eagerly and throws on a missing key, so every optional
 * connection is declared only when one is configured.
 *
 * `DATABASE_URL` is optional *here* on purpose, and it is not a weakening of
 * production validation. The commands that need a database — `migrate`,
 * `db:seed`, `db:status` — fail loudly on their own when the URL is absent,
 * and the running application still refuses to start without it
 * (`src/lib/env.ts` requires it unconditionally). What this separates is
 * build-time from runtime: `prisma generate` reads only the schema, and it
 * runs from `postinstall` — so requiring the URL here made `npm ci` fail on a
 * clean clone before anyone had a chance to write a `.env`.
 */
const datasource = {
  ...(process.env.DATABASE_URL ? { url: env('DATABASE_URL') } : {}),
  ...(process.env.SHADOW_DATABASE_URL
    ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
    : {}),
};

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  ...(Object.keys(datasource).length > 0 ? { datasource } : {}),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
