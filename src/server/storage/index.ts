import { getEnv } from '@/lib/env';
import { LocalStorageProvider } from './local';
import type { StorageProvider } from './provider';

export * from './provider';
export { LocalStorageProvider } from './local';

let instance: StorageProvider | undefined;

/**
 * The single composition point for storage. Adding Cloudflare R2 means adding
 * one branch here plus a provider class — no domain code changes.
 */
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
      // Deliberately unimplemented in Phase 0. The environment layer already
      // validates R2 credentials, so adding the provider here is additive.
      throw new Error('STORAGE_PROVIDER=r2 is not implemented yet (planned: Phase 4)');
  }
}

/** Test-only. */
export function setStorageForTesting(provider: StorageProvider | undefined): void {
  instance = provider;
}
