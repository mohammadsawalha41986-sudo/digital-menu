import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '@/server/storage/local';
import { StorageError, assertSafeKey } from '@/server/storage/provider';

describe('storage key validation', () => {
  it('rejects traversal, absolute paths and control characters', () => {
    const unsafe = [
      '',
      '/etc/passwd',
      '../secrets.env',
      'businesses/../../etc/passwd',
      'businesses\\windows',
      'businesses//double',
      'a'.repeat(513),
    ];

    for (const key of unsafe) {
      expect(() => assertSafeKey(key), key).toThrow(StorageError);
    }

    expect(() => assertSafeKey(`file${String.fromCharCode(0)}.pdf`)).toThrow(StorageError);
  });

  it('accepts ordinary namespaced keys', () => {
    expect(() => assertSafeKey('businesses/DEM001/menus/main-2026-01.pdf')).not.toThrow();
  });
});

describe('LocalStorageProvider', () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'dpos-storage-'));
    provider = new LocalStorageProvider({
      root,
      publicPrefix: '/uploads',
      signingSecret: 'test-secret',
    });
  });

  it('round-trips an object', async () => {
    const body = Buffer.from('%PDF-1.7 demo');
    const stored = await provider.put({
      key: 'businesses/DEM001/menu.pdf',
      body,
      contentType: 'application/pdf',
    });

    expect(stored.size).toBe(body.byteLength);
    expect(stored.publicUrl).toBe('/uploads/businesses/DEM001/menu.pdf');
    expect(await provider.exists('businesses/DEM001/menu.pdf')).toBe(true);
    expect(Buffer.from((await provider.get('businesses/DEM001/menu.pdf')) ?? [])).toEqual(body);
  });

  it('reports a miss as null rather than throwing', async () => {
    expect(await provider.get('businesses/DEM001/absent.pdf')).toBeNull();
    expect(await provider.head('businesses/DEM001/absent.pdf')).toBeNull();
    expect(await provider.exists('businesses/DEM001/absent.pdf')).toBe(false);
  });

  it('deletes idempotently', async () => {
    await provider.put({ key: 'tmp/a.txt', body: Buffer.from('a'), contentType: 'text/plain' });
    await provider.delete('tmp/a.txt');
    await provider.delete('tmp/a.txt');
    expect(await provider.exists('tmp/a.txt')).toBe(false);
  });

  it('cannot read or write outside its root', async () => {
    const outside = path.join(path.dirname(root), 'outside.txt');
    await writeFile(outside, 'secret');

    await expect(provider.get('../outside.txt')).rejects.toThrow(StorageError);
    await expect(
      provider.put({ key: '../escaped.txt', body: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toThrow(StorageError);

    // The file outside the root is untouched.
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });

  it('issues expiring signed URLs for private objects', async () => {
    const url = await provider.signedUrl('businesses/DEM001/private.pdf', {
      expiresInSeconds: 60,
    });

    expect(url).toContain('/uploads/businesses/DEM001/private.pdf');
    expect(url).toMatch(/expires=\d+/);
    expect(url).toMatch(/signature=[0-9a-f]{32}/);
    // The signing secret itself never appears in the URL.
    expect(url).not.toContain('test-secret');
  });
});
