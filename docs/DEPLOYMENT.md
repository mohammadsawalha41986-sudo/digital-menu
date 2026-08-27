# Deployment

Target: **Hostinger VPS + Coolify + Docker + PostgreSQL**, with Cloudflare R2 for object
storage (master spec §132–§136).

Nothing Hostinger-specific is baked into the application; it is an ordinary Docker
workload behind a reverse proxy.

## The image

Multi-stage `Dockerfile` producing a `next build --output standalone` runtime layer with
no toolchain, no source and no dev dependencies, serving as a non-root user, with a
`HEALTHCHECK` hitting `/api/health`.

**No secret is required at build time.** The database client is lazy behind a proxy
specifically so that `docker build` never needs production configuration — see
`docs/ARCHITECTURE.md` §2. Build once in CI, configure at deploy.

```bash
docker build -t digital-profile-os .
```

## Environment

Copy `.env.example`. Everything is validated at startup by `src/lib/env.ts`; the app
refuses to serve on malformed configuration and names the offending key **without printing
its value**.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | always | |
| `APP_URL` | defaulted | Origin serving admin and the API |
| `PUBLIC_URL` | defaulted | **Baked into every QR payload. Immutable once codes are printed.** |
| `AUTH_SECRET` | production | `openssl rand -base64 32`. The dev placeholder is rejected by name |
| `STORAGE_PROVIDER` | defaulted | `local` \| `r2` |
| `STORAGE_LOCAL_ROOT` | if `local` | Must be a persistent volume |
| `STORAGE_BUCKET` / `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | if `r2` | Validated together |
| `ANALYTICS_SALT` | recommended | Without it, visits are counted anonymously rather than with a predictable hash |
| `REDIS_URL` | optional | Not required today |

### `PUBLIC_URL` deserves a decision, not a default

It is the origin inside every printed QR code. Changing it after codes are printed
invalidates all of them. Decide the public hostname before the first client goes live.

## Coolify

1. New resource → **Docker Compose** or **Dockerfile**, pointed at this repository.
2. Add a PostgreSQL resource; set `DATABASE_URL` from it.
3. Set the environment variables above. Generate `AUTH_SECRET` and `ANALYTICS_SALT`
   *once* — rotating `AUTH_SECRET` invalidates every staff session, and rotating
   `ANALYTICS_SALT` breaks unique-visitor continuity across the rotation.
4. Health check path: `/api/health`. It reports application, database and storage, and
   returns 503 when any dependency is down, so Coolify will hold traffic off a broken
   release.
5. Persistent storage: mount a volume at `/app/storage` if using the local provider. With
   R2 no volume is needed.

## Railway

Railway builds the `Dockerfile` from the connected branch. Three of its constraints shape
the image, and all three are handled:

- **`VOLUME` is rejected.** Railway refuses an image containing a `VOLUME` instruction
  (`dockerfile invalid: docker VOLUME at Line N is not supported, use Railway Volumes`).
  The instruction is gone; attach a Railway Volume mounted at `/app/storage` instead.
- **The proxy targets one port.** Set `PORT` to whatever the service domain targets. The
  server reads `PORT`; the image defaults it to 3000.
- **Volumes mount as root.** The entrypoint takes ownership of the storage root, then
  drops to uid 1001 before exec'ing the server. Nothing serves traffic as root.

Setup:

1. Service → connect this repository and branch.
2. Add PostgreSQL; set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`.
3. Set `AUTH_SECRET`, `ANALYTICS_SALT`, `APP_URL`, `PUBLIC_URL`, `PORT`,
   `STORAGE_PROVIDER=local`, `STORAGE_LOCAL_ROOT=/app/storage`.
4. Attach a volume at `/app/storage`.
5. Health check path `/api/health` (`railway.json` sets it).

`PUBLIC_URL` on a `*.up.railway.app` domain is a decision, not a placeholder — see above.
Move to the final custom domain **before** printing any QR code.

## Release procedure

Migrations run **before** the new image serves traffic, from inside the container that is
about to serve it: `docker/entrypoint.sh` runs `prisma migrate deploy` and only then execs
the server. A failed migration aborts the release, so the previous deployment keeps
serving rather than a new one serving against a schema it does not match.

The Prisma CLI is not part of the traced standalone bundle, so the image carries a minimal,
isolated copy of it under `/app/migrator` (its own `node_modules` and an ESM
`prisma.config.mjs`, so no TypeScript loader or dotenv is needed at runtime). The version is
read from `package.json` at build time and cannot drift from the client.

Applying migrations by hand, where a host offers no release step:

```bash
npm run db:deploy
```

`npm run db:status` verifies no drift; CI runs it on every push.

## Storage

`local` writes beneath `STORAGE_LOCAL_ROOT` and serves through the application. Fine for a
single VPS with a persistent volume.

`r2` is the production intent. The `StorageProvider` abstraction and the environment
validation for R2 credentials are in place; **the R2 provider class itself is not
implemented** — `getStorage()` throws a clear error if selected. Adding it is one class
and one branch, with no change to any domain code. This is called out here rather than
buried because selecting `STORAGE_PROVIDER=r2` today will fail at first use, not at boot.

## Reverse proxy

Terminate TLS at the proxy and forward `X-Forwarded-For`. The application uses that header
only as hash material for anonymous visitor counting and never for authorisation, so a
spoofed value costs nothing but a slightly inflated unique count.

HTTPS matters beyond the usual reasons here: the QR validator refuses to encode a
non-HTTPS destination outside localhost, because a printed code cannot be upgraded later.

## Logging

Structured `console` output to stdout, which is what Docker and Coolify collect. Errors
carry a message and context; secrets, connection strings and request bodies are never
logged. Unexpected API errors are logged in full server-side and returned as a bare 500.

## Backups

See `docs/DATABASE.md` § Backups. Two things to get right: snapshot the storage bucket
alongside the database, and remember that restoring an old `api_clients` table re-enables
revoked keys.

## Scaling notes

The one piece of in-process state is the event-ingest rate limiter. Running more than one
instance makes it per-instance rather than global, which is a correctness weakening, not a
failure — it moves behind Redis when a second instance is added. Everything else is
stateless.
