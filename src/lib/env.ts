import { z } from 'zod';

/**
 * Single validated entry point for configuration.
 *
 * Rules this enforces (master spec §136, §127):
 *  - No module outside this file reads `process.env` for application config.
 *  - The process fails loudly and early on malformed configuration.
 *  - Production requires real secrets; development may fall back to safe
 *    localhost defaults so a clean checkout boots without ceremony.
 */

const url = z.string().url();

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SHADOW_DATABASE_URL: z.string().min(1).optional(),

  APP_URL: url.default('http://localhost:3000'),
  /** Origin embedded in permanent QR codes — immutable per deployment. */
  PUBLIC_URL: url.default('http://localhost:3000'),

  STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('storage'),
  STORAGE_LOCAL_PUBLIC_PREFIX: z.string().startsWith('/').default('/uploads'),

  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().min(1).optional(),
  REDIS_URL: z.string().optional(),
  ANALYTICS_SALT: z.string().optional(),
});

const schema = baseSchema.superRefine((value, ctx) => {
  const requireInProduction = (key: keyof typeof value, hint: string) => {
    if (value.NODE_ENV === 'production' && !value[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required in production (${hint})`,
      });
    }
  };

  requireInProduction('AUTH_SECRET', 'generate with: openssl rand -base64 32');

  if (value.NODE_ENV === 'production' && value.AUTH_SECRET?.startsWith('dev-only')) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUTH_SECRET'],
      message: 'AUTH_SECRET still holds the development placeholder value',
    });
  }

  if (value.STORAGE_PROVIDER === 'r2') {
    for (const key of ['STORAGE_BUCKET', 'STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when STORAGE_PROVIDER=r2`,
        });
      }
    }

    // The R2 provider is not written yet. Without this the credentials
    // validate, the app boots, and the first thing anyone learns is a health
    // check reporting `storage: down` with nothing saying why — a deploy that
    // fails for a reason nobody can read. Refuse here, where the message can
    // name the cause.
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_PROVIDER'],
      message:
        'STORAGE_PROVIDER=r2 is configured but the R2 provider is not implemented. ' +
        'Use STORAGE_PROVIDER=local.',
    });
  }
});

export type Env = z.infer<typeof schema>;

/** Exported for tests: validate an arbitrary source without touching process.env. */
export function parseEnv(source: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Never echo values back — only the offending keys.
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return result.data;
}

let cached: Env | undefined;

/**
 * Lazily validated environment. Lazy so that importing a module for a unit
 * test does not require a full production configuration.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test-only escape hatch. */
export function resetEnvCache(): void {
  cached = undefined;
}
