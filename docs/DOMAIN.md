# Domain

The vocabulary this codebase uses, and what each term is allowed to mean.

## Business (the tenant)

The unit of ownership. Everything tenant-scoped reaches a `Business` through a
`businessId` foreign key, which is what isolation filters on.

- **Public id** — opaque, 6 characters, Crockford base32 minus I/L/O/U. The identifier the
  QR encodes and the API addresses. Immutable.
- **Slug** — an internal admin handle. *Not* the public URL.
- **Status** — `DRAFT` | `ACTIVE` | `INACTIVE`. Only `ACTIVE` is publicly readable, and a
  draft is indistinguishable from a nonexistent business from outside.
- **Default locale** — what a visitor gets when they express no preference.

## Membership

The tenant grant. A business id arriving in a request is a *request*; a `BusinessMembership`
row for the authenticated user is what turns it into a *grant*.

Roles rank `VIEWER < EDITOR < MANAGER < OWNER`. A platform `SUPER_ADMIN` acts with owner
authority without a membership row, but still cannot reach a business that does not exist.

## Branch

A location. Branches have their own permanent QR at `/m/{publicId}/b/{branchKey}` and may
deviate from the shared menu through `BranchItemOverride` rows — one row per deviation, not
a copy of the menu.

An unknown branch key degrades to the business profile rather than 404-ing, so a printed
branch code survives a rename.

## Menu, category, item

```
Menu ── MenuCategory ── MenuItem
```

- **Menu** — has a tenant-scoped `key` (`main`, `breakfast`, `drinks`) and a publication
  pointer.
- **Category** — ordered grouping within one menu.
- **Item** — the priced thing. Carries a business-scoped `itemCode`, which is the stable
  identity Excel exports carry and imports match on.

### Availability

`AVAILABLE` | `UNAVAILABLE` | `SEASONAL` | `HIDDEN`. `HIDDEN` never reaches a visitor;
`UNAVAILABLE` is shown and flagged rather than removed.

### Price

Integer minor units plus a currency. `null` means the business has not set one — the
profile shows no price rather than a zero.

### Calories

`null` means the business never measured it. **The platform never infers nutrition data.**
This is a rule, not a default (§37).

## Publication

A `MenuVersion` is an append-only publication record; `Menu.currentVersionId` points at the
live one. Publishing inserts a version and repoints the pointer, atomically.

This is why content changes never change an address: they change what the pointer points
at, not where the pointer lives.

## Offer

A scheduled promotion with an optional window and a timezone. **Liveness is computed at
read time**, never written by a job — a cron that fails would leave expired promotional
pricing on a customer's menu.

Discount is arithmetic or absent: a stated percentage is used only when in range,
otherwise it is derived from the two prices, and where the numbers do not support one,
none is shown.

## Public file

Something the business has explicitly published — a PDF the platform hosts, or a link to a
menu it hosts elsewhere. Versioned; only the current version is reachable.

Never a QR destination. The QR resolves to the profile; the profile links to the file.

## Brand theme

Colours, font choice, radius scale. Emitted as `--brand-*` custom properties. Identity
only — it never changes layout.

## Template and variant

Structure. A React component plus a stylesheet, registered in code. A business stores a
key pair; unknown keys fall back rather than failing.

**Template ≠ theme.** Recolouring is not a new template.

## Analytics event

A recorded interaction carrying a business, an event type, a public target key, a coarse
device class, a locale, and a salted daily visitor hash.

No IP, no user agent, no cookie identifier — see `docs/ARCHITECTURE.md` §7.

## Import batch

One import run, its per-row outcomes, and each touched item's prior state. The prior state
is what makes rollback possible.

## API client

A machine consumer. Holds a token hash, a business allowlist (empty means platform-wide)
and an optional `marketingClientId` for correlation with AI Marketing OS.

## Terms this codebase deliberately avoids

- **"Order", "cart", "checkout"** — not in scope for v1, and naming them invites them in.
- **"Tenant id"** — the column is `businessId`. One name for one thing.
- **"Slug" for public URLs** — the public URL carries a public id. The slug is internal.
- **"Active offer"** as a stored flag — `isActive` means *enabled*; whether it is *live*
  is computed from the window.
