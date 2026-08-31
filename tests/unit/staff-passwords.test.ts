import { describe, expect, it } from 'vitest';
import { generatePassword } from '@/server/admin/user-service';
import { assertPasswordPolicy, hashPassword, verifyPassword } from '@/server/auth/password';

describe('generated staff passwords', () => {
  it('satisfies the policy the platform enforces', () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(() => assertPasswordPolicy(generatePassword())).not.toThrow();
    }
  });

  it('omits characters that are misread when typed by hand', () => {
    // A password is read aloud or copied at least once, so l/I/0/O are out.
    const sample = Array.from({ length: 50 }, () => generatePassword()).join('');
    expect(sample).not.toMatch(/[lI0O]/);
  });

  it('is different every time', () => {
    const generated = new Set(Array.from({ length: 100 }, () => generatePassword()));
    expect(generated.size).toBe(100);
  });

  it('round-trips through hashing, so a handed-over password actually works', async () => {
    const password = generatePassword();
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(generatePassword(), hash)).toBe(false);
  });

  it('is never stored in the hash it produces', async () => {
    const password = generatePassword();
    expect(await hashPassword(password)).not.toContain(password);
  });
});
