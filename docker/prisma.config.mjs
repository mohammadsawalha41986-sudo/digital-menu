/**
 * Runtime-only Prisma configuration.
 *
 * `prisma.config.ts` at the repository root is for development and CI: it is
 * TypeScript and it loads dotenv, neither of which exists in the runtime
 * image. This file is copied into /app/migrator beside a minimal Prisma CLI
 * install so `migrate deploy` can run on release with nothing in the
 * environment but `DATABASE_URL`.
 *
 * Paths are absolute, so the CLI's working directory does not matter.
 */

import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

const schemaRoot = path.join('/app', 'prisma');

export default defineConfig({
  schema: path.join(schemaRoot, 'schema.prisma'),
  datasource: { url: env('DATABASE_URL') },
  migrations: { path: path.join(schemaRoot, 'migrations') },
});
