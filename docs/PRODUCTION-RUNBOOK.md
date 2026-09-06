# Production Runbook

Operating this application: releasing it, checking it, and what to do when it
misbehaves. For the *first* deployment see `docs/DEPLOYMENT.md`; this document
assumes something is already running.

---

## Shape of the system

| Component | Required | Notes |
|---|---|---|
| Application | Yes | Next.js standalone, one process, non-root |
| PostgreSQL 16 | Yes | The only durable store for structured data |
| Storage volume | Yes | Uploads and derivatives; **local disk today**, so it must be a persistent mount |
| Redis | No | `REDIS_URL` is optional and unused by any current path |

**One writable node.** The storage provider is local disk and rate limiting is
in-process. Both must be resolved before running more than one replica; see
[Scaling](#scaling-out).

---

## Environment

Validated at startup by `src/lib/env.ts`, which refuses to boot in production
on a missing or placeholder value.

| Variable | Required | Note |
|---|---|---|
| `DATABASE_URL` | Yes | |
| `AUTH_SECRET` | Yes | `openssl rand -base64 32`. Rotating it signs everyone out. |
| `PUBLIC_URL` | Yes | **Immutable per deployment.** It is baked into printed QR codes. |
| `APP_URL` | Yes | Origin the admin and API are served from |
| `ANALYTICS_SALT` | Yes in production | Derives non-reversible visitor hashes |
| `STORAGE_PROVIDER` | Yes | `local` today; `r2` throws |
| `STORAGE_LOCAL_ROOT` | Yes | Must be the persistent mount |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | First release only | Creates the first staff account; never resets an existing password. Remove once the account exists. |

> **`PUBLIC_URL` is the one value that can destroy printed material.** A QR code
> on a restaurant's table encodes it. Changing it after codes are printed
> breaks every one of them. Treat it as immutable for the life of the
> deployment.

---

## Release

`docker/entrypoint.sh` does the sequence, and the ordering is deliberate:

1. Take ownership of the storage mount (as root), because mounted volumes
   arrive owned by root.
2. `prisma migrate deploy` — **in the container that is about to serve**, so a
   schema change can never be live before the code that needs it. A failed
   migration aborts the release and the previous deployment keeps serving.
3. Bootstrap the staff account if it does not exist.
4. Drop root and `exec node server.js`.

### Checklist

```bash
# Before
npm ci && npm run lint && npm run typecheck && npm test && npm run build
npx prisma migrate status        # no pending drift

# After — see the smoke tests below
curl -sS https://<host>/api/health
```

### Rolling back a release

Redeploy the previous image. **Migrations do not roll back automatically.** All
17 migrations to date are additive — no column drops, no destructive rewrites —
so the previous image runs against the newer schema. Verify that before
assuming it for a *future* migration; a migration that drops or narrows a
column breaks this property and needs an expand/contract split instead.

**Never run `prisma migrate reset` against production.** It destroys all data.

---

## Health

`GET /api/health` reports the three subsystems separately:

```json
{"status":"ok","checks":{"application":"up","database":"up","storage":"up"}}
```

Separately, because the answers differ: a database outage and a full storage
volume need different responses, and a single boolean would hide which it is.

Use it as the platform's health probe. A non-`ok` result should fail the
deployment rather than serve a broken profile.

---

## Production smoke tests

Run after every release. These have **not yet been run against a live
deployment** — see `docs/FINAL-PRODUCTION-READINESS-REPORT.md`.

| # | Check | Expected |
|---|---|---|
| 1 | `GET /api/health` | `status: ok`, all three `up` |
| 2 | `GET /` | Homepage renders |
| 3 | Admin sign-in | Session set, dashboard renders |
| 4 | Create a business | Appears in the list |
| 5 | `GET /m/{publicId}` | Public profile renders |
| 6 | `?lang=ar` | Arabic content, `dir="rtl"` |
| 7 | `?lang=en` | English content, `dir="ltr"` |
| 8 | Images | Load, with `srcset`, no layout shift |
| 9 | Change a price and publish | New price on the public profile |
| 10 | Rollback | Previous price returns |
| 11 | QR download | SVG/PNG; the encoded URL matches `PUBLIC_URL` |
| 12 | QR print kit | PDF downloads and prints |
| 13 | `/m/{publicId}/print` | Printable menu; Arabic mapped correctly |
| 14 | Analytics | A view is recorded |
| 15 | Client preview link | Opens without an account |
| 16 | Client approval | Recorded against the version |
| 17 | Link health | Runs and reports definite states |
| 18 | Command palette | `Ctrl/⌘ K` opens and navigates |
| 19 | Security headers | `curl -D-` shows CSP and HSTS |
| 20 | Sign out | Session cleared |

Record each as **PASS / FAIL / BLOCKED / NOT RUN**. Never record a BLOCKED
check as PASS.

---

## Backups

**No automated backup is configured. This is an open gap.**

What must be backed up:

1. **PostgreSQL** — everything structured.
2. **The storage volume** — uploads and derivatives. Derivatives can be
   regenerated from originals; originals cannot be regenerated from anything.

```bash
# Database
pg_dump "$DATABASE_URL" --format=custom --file=dpos-$(date +%F).dump
pg_restore --clean --if-exists --dbname="$DATABASE_URL" dpos-YYYY-MM-DD.dump

# Storage
tar -czf storage-$(date +%F).tar.gz -C "$STORAGE_LOCAL_ROOT" .
```

Restore is only real once it has been *rehearsed*. Restore into a scratch
database and open a profile before believing the dump.

---

## Common situations

**A profile 404s.** Expected when the business is not `ACTIVE` — drafts are
deliberately not publicly readable, and the response is identical to an unknown
id so it does not disclose existence. Check the business status first.

**Images 404 but the page renders.** The storage mount is missing or was
replaced. Media rows still exist; the objects do not. Check
`STORAGE_LOCAL_ROOT` points at the persistent volume, and `/api/health`'s
`storage` check.

**A menu shows stale prices.** Publishing repoints `currentVersionId` inside a
transaction and invalidates the profile cache. If a price is stale, check that
the change was *published* rather than only saved — draft and live are separate
by design, and Profile Health reports unpublished changes.

**Rate limits behave inconsistently.** They are in-process. With more than one
replica, each has its own counters. This is the expected symptom of scaling out
before replacing the limiter.

**A migration fails on release.** The release aborts and the previous
deployment keeps serving. Fix forward: correct the migration, redeploy. Do not
edit an applied migration in place — `prisma migrate status` will report drift.

**Link checks all report BLOCKED.** Egress is restricted, or the addresses
genuinely resolve to private ranges. `BLOCKED` means "refused before contact",
which is the intended answer for a private address. See `docs/SECURITY.md`.

---

## Scaling out

Two things must change before a second replica:

1. **Storage** — implement the `r2` provider (`src/server/storage/`). Local disk
   means one node can write and others cannot read what it wrote.
2. **Rate limiting** — move `src/server/security/rate-limit.ts` to a shared
   store. In-process counters multiply by the node count.

Neither is a small change disguised as a config flag. Until both are done, run
one node and scale vertically.

---

## Monitoring

Currently: stdout logs and `/api/health`. There is **no error-monitoring
integration**. Minimum worth adding, in order:

1. An uptime check on `/api/health` that alerts on any subsystem going down.
2. Error reporting, so a 500 is noticed before a client reports it.
3. Disk-usage alerting on the storage volume — media grows and nothing prunes
   it automatically.
