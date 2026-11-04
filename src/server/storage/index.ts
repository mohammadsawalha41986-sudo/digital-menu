import { getEnv } from '@/lib/env';
import { LocalStorageProvider } from './local';
import { R2StorageProvider } from './r2';
import { FallbackStorageProvider } from './fallback';
import { copyLocalToBucket } from './copy-local';
import type { StorageProvider } from './provider';

export * from './provider';
export { LocalStorageProvider } from './local';
export { R2StorageProvider } from './r2';
export { FallbackStorageProvider } from './fallback';

let instance: StorageProvider | undefined;

/** The single composition point for local and production object storage. */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  const env = getEnv();

  switch (env.STORAGE_PROVIDER) {
    case 'local':
      instance = localProvider();
      return instance;

    case 'r2': {
      const bucket = bucketProvider();
      // While the old volume is still mounted, it backs the bucket up: see FallbackStorageProvider.
      instance = env.STORAGE_LOCAL_FALLBACK === '1' ? new FallbackStorageProvider(bucket, localProvider()) : bucket;
      return instance;
    }
  }
}

function localProvider(): LocalStorageProvider {
  const env = getEnv();
  return new LocalStorageProvider({
    root: env.STORAGE_LOCAL_ROOT,
    publicPrefix: env.STORAGE_LOCAL_PUBLIC_PREFIX,
    signingSecret: env.AUTH_SECRET ?? 'development-signing-secret',
  });
}

/** The bucket itself, without the volume behind it. */
export function bucketProvider(): R2StorageProvider {
  const env = getEnv();
  return new R2StorageProvider({
    bucket: env.STORAGE_BUCKET as string,
    endpoint: env.STORAGE_ENDPOINT as string,
    accessKey: env.STORAGE_ACCESS_KEY as string,
    secretKey: env.STORAGE_SECRET_KEY as string,
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL as string,
    region: env.STORAGE_REGION,
    urlStyle: env.STORAGE_URL_STYLE,
  });
}

/**
 * The one-off copy from the old volume into the bucket, when the deploy asks
 * for it (STORAGE_COPY_FROM_LOCAL=1). Runs in the background after start-up:
 * the server answers requests meanwhile, and the volume still serves
 * anything not copied yet.
 */
export function startCopyFromLocalIfAsked(): void {
  const env = getEnv();
  if (env.STORAGE_PROVIDER !== 'r2' || env.STORAGE_COPY_FROM_LOCAL !== '1') return;
  setTimeout(() => {
    void copyLocalToBucket(env.STORAGE_LOCAL_ROOT, bucketProvider()).catch((error: unknown) => {
      console.error('STORAGE_COPY_ABORTED', error instanceof Error ? error.message : error);
    });
  }, 5_000);
}

/** Test-only. */
export function setStorageForTesting(provider: StorageProvider | undefined): void {
  instance = provider;
}
