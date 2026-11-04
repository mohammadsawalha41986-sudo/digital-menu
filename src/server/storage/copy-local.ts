import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { contentTypeFor } from './fallback';
import type { StorageProvider } from './provider';

/**
 * Copies every file under a local storage root into a bucket, once. Files the
 * bucket already holds at the same size are skipped, so a second run copies
 * only what is missing. Nothing on the volume is changed or removed.
 *
 * It logs a start line, one line per failure (the first 20), and a summary
 * the deploy is checked against:
 *   STORAGE_COPY_DONE files=718 copied=718 skipped=0 failed=0 bytes=71631894
 */

export interface CopySummary {
  files: number;
  copied: number;
  skipped: number;
  failed: number;
  bytes: number;
}

const PARALLEL = 4;
const MAX_LOGGED_FAILURES = 20;

async function* walk(root: string, dir = ''): AsyncGenerator<string> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    // Health probes write throwaway objects there; they are not content.
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) yield* walk(root, relative);
    else if (entry.isFile()) yield relative;
  }
}

export async function copyLocalToBucket(
  root: string,
  bucket: StorageProvider,
  log: (message: string) => void = (message) => console.log(message),
): Promise<CopySummary> {
  const keys: string[] = [];
  for await (const key of walk(path.resolve(root))) keys.push(key);
  log(`STORAGE_COPY_START files=${keys.length} into=${bucket.name}`);

  const summary: CopySummary = { files: keys.length, copied: 0, skipped: 0, failed: 0, bytes: 0 };
  let next = 0;

  async function worker() {
    while (next < keys.length) {
      const key = keys[next++]!;
      try {
        const file = path.join(path.resolve(root), key);
        const size = (await stat(file)).size;
        const existing = await bucket.head(key);
        if (existing && existing.size === size) {
          summary.skipped += 1;
          continue;
        }
        await bucket.put({ key, body: await readFile(file), contentType: contentTypeFor(key), cacheControl: 'public, max-age=31536000, immutable' });
        summary.copied += 1;
        summary.bytes += size;
      } catch (error) {
        summary.failed += 1;
        if (summary.failed <= MAX_LOGGED_FAILURES) {
          log(`STORAGE_COPY_FAIL ${key} ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, worker));
  log(`STORAGE_COPY_DONE files=${summary.files} copied=${summary.copied} skipped=${summary.skipped} failed=${summary.failed} bytes=${summary.bytes}`);
  return summary;
}
