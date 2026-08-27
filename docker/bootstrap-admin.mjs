/**
 * First-run staff account provisioning.
 *
 * A fresh deployment has a schema and no way in: migrations create tables,
 * not people. This runs on release and creates one SUPER_ADMIN from
 * BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD.
 *
 * Three rules it does not break:
 *  - It never resets an existing account's password. An operator's login
 *    surviving a redeploy matters more than convenience.
 *  - It never prints the password.
 *  - Absent configuration is not an error: it says so and exits 0, so a
 *    deployment that provisions accounts another way still boots.
 *
 * It talks to Postgres directly rather than through Prisma because the
 * standalone runtime bundle carries `pg` but not the Prisma CLI or the seed
 * toolchain. The hash format is the one src/server/auth/password.ts reads;
 * tests/unit/bootstrap-admin.test.ts fails if the two ever diverge.
 */

import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  if (password.length > 256) throw new Error('Password must be at most 256 characters');

  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH);

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Prisma generates cuids client-side, so a raw insert supplies its own id. */
function generateId() {
  return `c${randomBytes(12).toString('hex')}`;
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('   no BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD — skipping');
    return;
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT id, "passwordHash" FROM users WHERE email = $1',
      [email],
    );

    if (existing.rows[0]?.passwordHash) {
      console.log(`   ${email} already exists — password left unchanged`);
      return;
    }

    const passwordHash = await hashPassword(password);
    const name = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrator';

    if (existing.rows[0]) {
      await client.query(
        `UPDATE users
            SET "passwordHash" = $2, role = 'SUPER_ADMIN', "isActive" = true,
                "updatedAt" = now()
          WHERE id = $1`,
        [existing.rows[0].id, passwordHash],
      );
      console.log(`   provisioned password for existing account ${email}`);
      return;
    }

    await client.query(
      `INSERT INTO users (id, email, name, "passwordHash", role, "isActive",
                          "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true, now(), now())`,
      [generateId(), email, name, passwordHash],
    );

    console.log(`   created administrator ${email}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`   bootstrap failed: ${error.message}`);
    process.exit(1);
  });
}
