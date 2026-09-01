# BASELINE — measured before upgrade work

Recorded at the start of the production-completion effort. Every number here was
produced by running the command, not by reading documentation.

## Commands

| Command | Result |
|---|---|
| `npm ci` | **FAILED** on a clean clone — `postinstall` runs `prisma generate`, and `prisma.config.ts` resolved `env('DATABASE_URL')` eagerly (`PrismaConfigEnvError`). Fixed in Phase 1. |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 242 passed, **124 skipped**, 20 files passed / 9 skipped |
| `npm run build` | succeeds — 39 routes, standalone output, no build-time secrets |

## Skipped tests — why

The nine skipped files are the integration suite. Each guards on a reachable
`DATABASE_URL`:

```
tests/integration/{analytics,api,import-export,media,menu-studio,offers,
public-files,public-profile,qr-permanence,tenant-isolation}.test.ts
```

They are **BLOCKED**, not passing. This environment has the `docker` client but
**no Docker daemon**, and no PostgreSQL binary, so no database can be started
locally. They execute in CI, which provisions `postgres:16-alpine` as a service.

E2E (`e2e/*.spec.ts`, Playwright) is blocked for the same reason — it runs
`next start` against a migrated, seeded database.

## Environment requirements

| Requirement | State here |
|---|---|
| Node ≥ 20.11 | v22.22.2 ✓ |
| PostgreSQL 16 | **unavailable** — no daemon |
| Docker | client present, **daemon absent** |
| Chromium (Playwright) | present at `/opt/pw-browsers/chromium` |

## Deployment status

**BLOCKED — ACCESS REQUIRED.** No deployment credentials are reachable from this
session (no Railway/Coolify/VPS access). Live verification (Phases 60–63) cannot
be performed and is not claimed anywhere in this repository.
