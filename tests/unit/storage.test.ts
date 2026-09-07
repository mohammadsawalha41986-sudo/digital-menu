import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
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

describe('storage readiness probe', () => {
  it('passes on a usable root and leaves nothing behind', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dpos-probe-ok-'));
    const provider = new LocalStorageProvider({
      root,
      publicPrefix: '/uploads',
      signingSecret: 'test-secret',
    });

    await expect(provider.probe()).resolves.toBeUndefined();

    // The probe object is temporary; a store that accumulated one per health
    // check would fill a volume on its own.
    await expect(readdir(path.join(root, '.probe')).catch(() => [])).resolves.toEqual([]);
  });

  it('fails on a root nothing can be written beneath', async () => {
    // A root that is a file rather than a directory. This one the old check
    // would also have caught — `exists` throws ENOTDIR — but it pins the
    // probe's basic contract: an unusable store does not pass.
    const parent = await mkdtemp(path.join(tmpdir(), 'dpos-probe-bad-'));
    const root = path.join(parent, 'storage');
    await writeFile(root, 'not a directory');

    const provider = new LocalStorageProvider({
      root,
      publicPrefix: '/uploads',
      signingSecret: 'test-secret',
    });

    await expect(provider.probe()).rejects.toThrow();
  });

  it('catches a read-only store that `exists` reports as healthy', async () => {
    // This is the case the old check missed and the reason the probe exists:
    // `stat` succeeds, so `exists` answers a clean "no" and the store looks
    // like a healthy empty one — while every write fails. A read-only mount
    // and a full disk both land here.
    //
    // Skipped for root, who is not subject to the permission bits that make
    // the store read-only. The assertion is about the provider, not the OS.
    if (process.getuid?.() === 0) {
      return;
    }

    const parent = await mkdtemp(path.join(tmpdir(), 'dpos-probe-ro-'));
    const root = path.join(parent, 'storage');
    await mkdir(root);
    await chmod(root, 0o500);

    const provider = new LocalStorageProvider({
      root,
      publicPrefix: '/uploads',
      signingSecret: 'test-secret',
    });

    try {
      await expect(provider.exists('.healthcheck')).resolves.toBe(false);
      await expect(provider.probe()).rejects.toThrow();
    } finally {
      await chmod(root, 0o700);
    }
  });
});
