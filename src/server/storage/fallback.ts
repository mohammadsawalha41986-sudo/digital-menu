import type { PutObjectInput, SignedUrlOptions, StorageProvider, StoredObject } from './provider';

/**
 * Storage while moving from a local volume to a bucket.
 *
 * The bucket is the primary: reads and writes go there first. Anything the
 * bucket does not have yet, or cannot answer, is read from the volume and
 * copied up in the background, so no image goes missing while files move. An
 * upload the bucket refuses is kept on the volume instead of failing, and is
 * copied up later. Once every file is in the bucket the volume is detached and
 * this wrapper is no longer used.
 */
export class FallbackStorageProvider implements StorageProvider {
  readonly name: string;

  constructor(
    private readonly primary: StorageProvider,
    private readonly fallback: StorageProvider,
    private readonly log: (message: string) => void = (message) => console.warn(message),
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    try {
      return await this.primary.put(input);
    } catch (error) {
      this.log(`STORAGE_FALLBACK_PUT ${input.key} ${describe(error)}`);
      const stored = await this.fallback.put(input);
      // Same address either way: visitors read through the app.
      return { ...stored, publicUrl: this.primary.publicUrl(input.key) };
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const fromPrimary = await this.primary.get(key).catch((error: unknown) => {
      this.log(`STORAGE_FALLBACK_GET ${key} ${describe(error)}`);
      return null;
    });
    if (fromPrimary) return fromPrimary;

    const fromFallback = await this.fallback.get(key);
    if (fromFallback) this.backfill(key, fromFallback);
    return fromFallback;
  }

  async head(key: string): Promise<StoredObject | null> {
    const fromPrimary = await this.primary.head(key).catch(() => null);
    return fromPrimary ?? (await this.fallback.head(key));
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await Promise.all([this.primary.delete(key), this.fallback.delete(key).catch(() => undefined)]);
  }

  publicUrl(key: string): string {
    return this.primary.publicUrl(key);
  }

  async signedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const inPrimary = await this.primary.exists(key).catch(() => false);
    return inPrimary ? this.primary.signedUrl(key, options) : this.fallback.signedUrl(key, options);
  }

  probe(): Promise<void> {
    return this.primary.probe();
  }

  /** Copies a file read from the volume into the bucket; never in the way of the read. */
  private backfill(key: string, body: Uint8Array) {
    void this.primary
      .put({ key, body, contentType: contentTypeFor(key) })
      .then(() => this.log(`STORAGE_BACKFILL ${key}`))
      .catch((error: unknown) => this.log(`STORAGE_BACKFILL_FAILED ${key} ${describe(error)}`));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
};

/** A content type from the file name. Visitors are served the type recorded in the database, not this. */
export function contentTypeFor(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[extension] ?? 'application/octet-stream';
}
