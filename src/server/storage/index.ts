import { getEnv } from '@/lib/env';
import { LocalStorageProvider } from './local';
import { R2StorageProvider } from './r2';
import type { StorageProvider } from './provider';

export * from './provider';
export { LocalStorageProvider } from './local';
export { R2StorageProvider } from './r2';

let instance: StorageProvider | undefined;

/** The single composition point for local and production object storage. */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  const env = getEnv();

  switch (env.STORAGE_PROVIDER) {
    case 'local':
      instance = new LocalStorageProvider({
        root: env.STORAGE_LOCAL_ROOT,
        publicPrefix: env.STORAGE_LOCAL_PUBLIC_PREFIX,
        signingSecret: env.AUTH_SECRET ?? 'development-signing-secret',
      });
      return instance;

    case 'r2':
      instance = new R2StorageProvider({
        bucket: env.STORAGE_BUCKET as string,
        endpoint: env.STORAGE_ENDPOINT as string,
        accessKey: env.STORAGE_ACCESS_KEY as string,
        secretKey: env.STORAGE_SECRET_KEY as string,
        publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL as string,
      });
      return instance;
  }
}

/** Test-only. */
export function setStorageForTesting(provider: StorageProvider | undefined): void {
  instance = provider;
}
