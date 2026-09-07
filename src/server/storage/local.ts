import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  StorageError,
  assertSafeKey,
  type PutObjectInput,
  type SignedUrlOptions,
  type StorageProvider,
  type StoredObject,
} from './provider';

export interface LocalStorageOptions {
  /** Filesystem root, resolved from the project working directory. */
  root: string;
  /** URL prefix the application serves these objects from. */
  publicPrefix: string;
  /** Secret used to sign time-limited URLs. */
  signingSecret: string;
}

/**
 * Development / self-hosted provider. Writes beneath a single root directory
 * and never resolves outside it: every key passes `assertSafeKey`, and the
 * resulting absolute path is re-checked against the root before use.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  private readonly root: string;
  private readonly publicPrefix: string;
  private readonly signingSecret: string;

  constructor(options: LocalStorageOptions) {
    this.root = path.resolve(options.root);
    this.publicPrefix = options.publicPrefix.replace(/\/$/, '');
    this.signingSecret = options.signingSecret;
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const absolute = path.resolve(this.root, key);

    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new Error('Resolved path escapes the storage root');
    }

    return absolute;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const absolute = this.resolve(input.key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);

    return {
      key: input.key,
      size: input.body.byteLength,
      contentType: input.contentType,
      publicUrl: this.publicUrl(input.key),
      lastModified: new Date(),
    };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const stats = await stat(this.resolve(key));
      return {
        key,
        size: stats.size,
        // The local provider does not persist metadata; callers needing a
        // precise content type read it from the database record.
        contentType: 'application/octet-stream',
        publicUrl: this.publicUrl(key),
        lastModified: stats.mtime,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${this.publicPrefix}/${key}`;
  }

  async signedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    assertSafeKey(key);
    const expires = Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 300);
    const signature = createHash('sha256')
      .update(`${key}:${expires}:${this.signingSecret}`)
      .digest('hex')
      .slice(0, 32);

    return `${this.publicPrefix}/${key}?expires=${expires}&signature=${signature}`;
  }

  async probe(): Promise<void> {
    // Unique per call so two probes racing cannot delete each other's object.
    const key = `.probe/${randomUUID()}`;
    const body = new TextEncoder().encode('ok');

    try {
      await this.put({ key, body, contentType: 'text/plain' });

      const read = await this.get(key);
      if (!read || read.byteLength !== body.byteLength) {
        throw new StorageError('Storage probe wrote an object it could not read back');
      }
    } finally {
      await this.delete(key).catch(() => {});
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
  );
}
