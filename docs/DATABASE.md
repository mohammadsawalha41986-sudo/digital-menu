# Database

PostgreSQL 16 via Prisma 7. Schema in `prisma/schema.prisma`, migrations in
`prisma/migrations/` (master spec §121, §133).

## Model map

```
User ──< BusinessMembership >── Business ─┬─ BrandTheme (1:1)
                                          ├─ Branch ──< BranchItemOverride >── MenuItem
                                          ├─ Media
                                          ├─ QrCode
                                          ├─ Offer
                                          ├─ PublicFile ── PublicFileVersion
                                          ├─ ImportBatch ── ImportRow
                                          ├─ PriceHistory
                                          ├─ AnalyticsEvent
                                          ├─ AuditLog
                                          └─ Menu ─┬─ MenuVersion (publication pointer)
                                                   └─ MenuCategory ── MenuItem ── MenuItemImage
ApiClient (standalone — scoped by business id array)
```

## Decisions worth knowing before you change it

### `Business.publicId` is load-bearing

It is what the QR encodes. It is unique, treated as immutable, and constrained at the
database level to Crockford base32 minus I, L, O and U:

```sql
CHECK ("publicId" ~ '^[0-9A-HJ-KM-NP-TV-Z]{6}$')
```

That constraint exists because an id containing an excluded letter is **silently
unreachable** — the reader normalises it to a different string and finds nothing, with no
error anywhere. The application already validated this; the constraint stops fixtures,
migrations and direct SQL from bypassing it. It caught real bugs the day it was added.

### `MenuItem.businessId` is denormalised

Items reach their tenant through `category → menu → business`, but every tenant-scoped
query would then need a three-hop join and one missed hop is a cross-tenant leak. The
direct column makes the scope a single predicate, and gives the importer its match key:

```prisma
@@unique([businessId, itemCode])
```

### Money is integer minor units

`priceMinor Int` plus `currency String`. Never a float. Minor-unit count is a property of
the currency — KWD, BHD and OMR use three digits — and lives in `src/lib/money.ts`.

### Publication is a pointer, not a flag

`MenuVersion` rows are append-only; `Menu.currentVersionId` points at the live one.
Publishing is a transaction that inserts a version and repoints the menu, so a reader can
never observe a menu whose current version does not exist.

The same pattern backs `PublicFile.currentVersionId`: replacing a PDF adds a version and
repoints, which is why the public URL and the QR are untouched.

### Rollback needs `ImportRow.beforeState`

Each row an import touches stores the item's prior values. Without it, "undo this bulk
price update" is not implementable after the fact.

### Analytics stores no personal data

No IP column, no user agent column, no cookie id. Only a salted daily hash — see
`docs/ARCHITECTURE.md` §7 for the construction and why it rotates.

## Indexes

Beyond primary and unique keys:

| Table | Index | Why |
|---|---|---|
| `businesses` | `status`, `createdAt` | Admin listing and the public status filter |
| `business_memberships` | `businessId` | Tenant grant lookups |
| `menus` | `(businessId, status)` | Public menu selection |
| `menu_categories` | `businessId`, `(menuId, sortOrder)` | Tenant scope; ordered render |
| `menu_items` | `(categoryId, sortOrder)`, `(businessId, availability)` | Ordered render; public filtering |
| `offers` | `(businessId, isActive, startsAt, endsAt)` | Covers the live-offer window predicate |
| `public_files` | `(businessId, isPublic, sortOrder)` | Public downloads |
| `analytics_events` | `(businessId, createdAt)`, `(businessId, eventType, createdAt)` | Range and per-event reporting |
| `audit_logs` | `(businessId, createdAt)`, `(entity, entityId)` | Activity feed; entity history |
| `import_batches` | `(businessId, createdAt)` | Import history |
| `price_history` | `(businessId, createdAt)`, `itemCode` | Price audit |

## Transactions

Used where a partial write would be observable:

- **Menu publication** — version insert + pointer repoint.
- **File upload** — row upsert + version insert + pointer repoint.
- **Import rollback** — every restore plus the batch status, so a half-undone batch is not
  a reachable state.
- **Business creation** — business + owner membership + brand theme.

Import *execution* is deliberately **not** one transaction: partial import is a
requirement (§64), so each row commits independently and failures are recorded per row.

## Migrations

```bash
npm run db:migrate    # create + apply in development
npm run db:deploy     # apply in production
npm run db:status     # verify no drift
npm run db:validate   # validate the schema file
```

Migrations are committed SQL and are the only sanctioned way the schema changes. The
runtime image ships them so a release can run `migrate deploy` before serving.

## Seeding

`npm run db:seed` is deterministic and idempotent: fixed public ids, fixed keys, upserts
throughout, and demo rows converge on re-run rather than going stale.

It provisions the staff account with a generated password printed **once**, or takes
`SEED_ADMIN_PASSWORD` from the environment. An existing account keeps its password.

It seeds seven businesses: the working demo (`DEM001`, two branches), an Arabic-only café
(`DEM002`), a draft that must never be publicly readable (`DRAFT1`), and the five showcase
businesses (`DEM003`–`DEM007`) that back the §140 design QA.

## Backups

Not automated by this repository — it is a deployment concern, and the platform holds no
data that can be reconstructed from elsewhere. Two things matter when configuring them:

1. **`public_file_versions` rows reference objects in the storage provider.** A database
   backup without the corresponding bucket snapshot restores a menu whose PDFs 404.
2. **`api_clients` holds token hashes.** Restoring an old backup silently re-enables keys
   revoked since.
