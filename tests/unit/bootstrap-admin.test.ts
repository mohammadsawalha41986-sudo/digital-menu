import { describe, expect, it } from 'vitest';
import { hashPassword as bootstrapHash } from '../../docker/bootstrap-admin.mjs';
import { verifyPassword, hashPassword } from '@/server/auth/password';

/**
 * The release bootstrap script hashes passwords without importing the
 * application's TypeScript — the runtime image has no toolchain for it. That
 * duplication is only safe while the two agree, so this test is the contract:
 * a password hashed by the script must verify against the application, and
 * vice versa.
 */

describe('bootstrap admin hashing', () => {
  it('produces a hash the application accepts', async () => {
    const stored = await bootstrapHash('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong horse battery', stored)).toBe(false);
  });

  it('writes the same self-describing format the application writes', async () => {
    const [scheme, n, r, p] = (await bootstrapHash('correct horse battery')).split('$');
    const [appScheme, appN, appR, appP] = (await hashPassword('correct horse battery')).split('$');

    expect([scheme, n, r, p]).toEqual([appScheme, appN, appR, appP]);
  });

  it('enforces the same minimum length', async () => {
    await expect(bootstrapHash('short')).rejects.toThrow(/at least 12/);
  });
});
