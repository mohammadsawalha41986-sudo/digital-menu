import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FallbackStorageProvider } from '@/server/storage/fallback';
import { copyLocalToBucket } from '@/server/storage/copy-local';
import { R2StorageProvider } from '@/server/storage/r2';
import type { PutObjectInput, StorageProvider, StoredObject } from '@/server/storage/provider';

/**
 * Moving images from the server's volume to a bucket: nothing may go missing
 * on the way. The bucket is read first; what it lacks comes from the volume
 * and is copied up; an upload the bucket refuses stays on the volume.
 */

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>();
  failing = false;
  constructor(readonly name: string) {}
  private check() {
    if (this.failing) throw new Error(`${this.name} unavailable`);
  }
  async put(input: PutObjectInput): Promise<StoredObject> {
    this.check();
    this.objects.set(input.key, new Uint8Array(input.body));
    return { key: input.key, size: input.body.byteLength, contentType: input.contentType, publicUrl: this.publicUrl(input.key) };
  }
  async get(key: string) {
    this.check();
    return this.objects.get(key) ?? null;
  }
  async head(key: string) {
    this.check();
    const body = this.objects.get(key);
    return body ? { key, size: body.byteLength, contentType: 'application/octet-stream' } : null;
  }
  async exists(key: string) {
    return (await this.head(key)) !== null;
  }
  async delete(key: string) {
    this.check();
    this.objects.delete(key);
  }
  publicUrl(key: string) {
    return `https://menu.example.com/uploads/${key}`;
  }
  async signedUrl(key: string) {
    return `${this.name}:${key}`;
  }
  async probe() {
    this.check();
  }
}

const bytes = (text: string) => new TextEncoder().encode(text);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the bucket backed by the old volume', () => {
  it('serves a file the bucket does not have yet from the volume, and copies it up', async () => {
    const bucket = new MemoryStorage('bucket');
    const volume = new MemoryStorage('volume');
    volume.objects.set('businesses/A/media/x.webp', bytes('photo'));
    const storage = new FallbackStorageProvider(bucket, volume, () => undefined);

    expect(await storage.get('businesses/A/media/x.webp')).toEqual(bytes('photo'));
    await settle();
    expect(bucket.objects.get('businesses/A/media/x.webp')).toEqual(bytes('photo'));
  });

  it('keeps serving from the volume when the bucket fails, and keeps uploads there', async () => {
    const bucket = new MemoryStorage('bucket');
    const volume = new MemoryStorage('volume');
    volume.objects.set('a.webp', bytes('old'));
    bucket.failing = true;
    const storage = new FallbackStorageProvider(bucket, volume, () => undefined);

    expect(await storage.get('a.webp')).toEqual(bytes('old'));
    const stored = await storage.put({ key: 'b.webp', body: bytes('new'), contentType: 'image/webp' });
    expect(volume.objects.get('b.webp')).toEqual(bytes('new'));
    expect(stored.publicUrl).toBe('https://menu.example.com/uploads/b.webp');
  });

  it('reads the bucket first, writes to it, and deletes from both', async () => {
    const bucket = new MemoryStorage('bucket');
    const volume = new MemoryStorage('volume');
    bucket.objects.set('a.webp', bytes('new'));
    volume.objects.set('a.webp', bytes('old'));
    const storage = new FallbackStorageProvider(bucket, volume, () => undefined);

    expect(await storage.get('a.webp')).toEqual(bytes('new'));
    await storage.put({ key: 'c.webp', body: bytes('c'), contentType: 'image/webp' });
    expect(bucket.objects.has('c.webp')).toBe(true);
    expect(volume.objects.has('c.webp')).toBe(false);
    await storage.delete('a.webp');
    expect(bucket.objects.has('a.webp') || volume.objects.has('a.webp')).toBe(false);
    expect(await storage.get('missing.webp')).toBeNull();
  });
});

describe('copying the volume into the bucket', () => {
  let root = '';

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'copy-local-'));
    await mkdir(path.join(root, 'businesses/A/media'), { recursive: true });
    await mkdir(path.join(root, '.probe'), { recursive: true });
    await writeFile(path.join(root, 'businesses/A/media/x.webp'), 'photo');
    await writeFile(path.join(root, 'businesses/A/media/x@640.webp'), 'small');
    await writeFile(path.join(root, 'businesses/A/menu.pdf'), 'pdf');
    await writeFile(path.join(root, '.probe/health'), 'ok');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies every file once, skips what is already there, and leaves health probes out', async () => {
    const bucket = new MemoryStorage('bucket');
    const lines: string[] = [];

    const first = await copyLocalToBucket(root, bucket, (line) => lines.push(line));
    expect(first).toEqual({ files: 3, copied: 3, skipped: 0, failed: 0, bytes: 13 });
    expect([...bucket.objects.keys()].sort()).toEqual(['businesses/A/media/x.webp', 'businesses/A/media/x@640.webp', 'businesses/A/menu.pdf']);
    expect(lines.at(-1)).toBe('STORAGE_COPY_DONE files=3 copied=3 skipped=0 failed=0 bytes=13');

    const second = await copyLocalToBucket(root, bucket, () => undefined);
    expect(second).toMatchObject({ copied: 0, skipped: 3, failed: 0 });
  });

  it('counts and names a file it could not copy', async () => {
    const bucket = new MemoryStorage('bucket');
    bucket.failing = true;
    const lines: string[] = [];
    const summary = await copyLocalToBucket(root, bucket, (line) => lines.push(line));
    expect(summary).toMatchObject({ files: 3, copied: 0, failed: 3 });
    expect(lines.filter((line) => line.startsWith('STORAGE_COPY_FAIL'))).toHaveLength(3);
  });
});

describe('S3 addressing for a Railway bucket', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the bucket in the host name and signs with the bucket’s region', async () => {
    const seen: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });
      return new Response(null, { status: 200 });
    }));
    const bucket = new R2StorageProvider({
      bucket: 'menu-images-abc',
      endpoint: 'https://t3.storageapi.dev',
      accessKey: 'access-key',
      secretKey: 'secret-key',
      publicBaseUrl: 'https://menu.example.com/uploads',
      region: 'auto',
      urlStyle: 'virtual',
    });

    await bucket.put({ key: 'businesses/A/media/x@640.webp', body: bytes('x'), contentType: 'image/webp' });
    expect(seen[0]!.url).toBe('https://menu-images-abc.t3.storageapi.dev/businesses/A/media/x%40640.webp');
    expect(seen[0]!.authorization).toMatch(/Credential=access-key\/\d{8}\/auto\/s3\/aws4_request/);
    expect(bucket.publicUrl('businesses/A/media/x.webp')).toBe('https://menu.example.com/uploads/businesses/A/media/x.webp');
  });

  it('keeps the path style for R2 unless told otherwise', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response(null, { status: 404 });
    }));
    const r2 = new R2StorageProvider({
      bucket: 'menus',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      accessKey: 'a',
      secretKey: 's',
      publicBaseUrl: 'https://media.example.com',
    });
    await r2.get('a.webp');
    expect(seen[0]).toBe('https://account.r2.cloudflarestorage.com/menus/a.webp');
  });
});
