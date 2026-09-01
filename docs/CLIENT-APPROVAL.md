# CLIENT APPROVAL

How a client sees their profile before it is published, approves it, and asks
for changes — without an account.

Spec sections in brackets.

---

## Why this exists

The managed-service model turns on one step: *send it to the client, get a
decision*. Before this, staff could preview a profile only behind a login, so
that step had no mechanism at all `[§71, §72, §139]`.

## The flow `[§72, §138]`

```
draft → create a preview link → client opens it
                                     ├── Approve
                                     └── Request a change → tracked item for staff
                              → staff publish
```

The client needs no account, no password and no dashboard. They get a link.

## The link

`/review/{key}.{secret}`

| Property | How |
|---|---|
| **Unguessable** `[§127]` | 20 random bytes over a 32-character alphabet, beside a short public key. |
| **Not recoverable from the database** | Only the SHA-256 of the secret is stored, exactly as an API key is. A leaked row hands over nothing usable. |
| **Expiring** `[§127]` | Chosen at creation, 1–90 days, checked on every request rather than only at issue. |
| **Revocable** `[§127]` | One click. The next request sees nothing. |
| **Draft-only** | It renders the business's own draft. It is not a way to make an unpublished business public. |

Unknown, wrong, expired and revoked all answer **identically** — a 404.
Distinguishing them tells whoever is guessing which half they got right. The
page is also rate limited and `noindex`.

## What the client sees

The **real** profile, through the real render path: same query, same templates,
same brand tokens. A bespoke preview renderer drifts from the live page, and the
drift is discovered by the client `[§77]`.

Two differences, both deliberate:

- **No analytics are recorded.** An approval round must not appear in the
  business's visitor numbers, or the figures staff quote become a lie.
- **A review bar sits above it**, styled deliberately *outside* the brand token
  system. It is the agency talking, not the business, and a client must be able
  to tell the page under review apart from the controls reviewing it.

## Approving, and asking for changes `[§73, §140]`

Approve is one button. Requesting a change asks for a note, and that note becomes
a tracked `ChangeRequest` staff work through — alongside ones staff add
themselves, because most requests still arrive by phone.

The name a client types is stored as **self-declared** and never treated as
authentication. The link is the only credential. Their notes are recorded exactly
as written, and nothing acts on them automatically.

## Where staff work

`/admin/businesses/{id}/review`

- Create a link, choose who it is for and how long it lasts. The URL is shown
  **once** — it is not stored, so a lost link is replaced rather than recovered.
- See every link: who it was for, whether it was opened and how often, what the
  client decided, and their words.
- Work through change requests, marking them done or reopening them.

The dashboard surfaces both across every business: businesses waiting on a
client, and change requests still open `[§144]`.
