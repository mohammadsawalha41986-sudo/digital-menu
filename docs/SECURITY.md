# Security

What is defended, how, and what is knowingly accepted. Written to be checked
rather than believed: every claim below names the code or the test that makes
it true.

---

## Threat model

The platform is operated by an agency on behalf of client businesses. Three
parties can supply input:

1. **Staff** — authenticated, scoped to the businesses they are granted.
2. **Clients** — unauthenticated holders of a preview token.
3. **Visitors** — anonymous, on the public profile.

The consequences that matter, in order:

1. One client's data reaching another client (**tenant isolation**).
2. An anonymous visitor reading unpublished work (**draft confidentiality**).
3. The server being used as a proxy into networks it can reach and the
   attacker cannot (**SSRF**).
4. An upload becoming code, or escaping its namespace (**file handling**).
5. Credential guessing (**authentication**).

---

## Authorisation and tenant isolation

Authorisation lives in the **services**, never in routes or actions:

```ts
const context = await requireTenantContext(user, businessId, 'EDITOR');
```

A route that forgets to check cannot succeed, because the service it calls will
refuse. This is the single most important structural property in the codebase.

Scope is resolved **before** querying, not filtered afterwards. Global search
and the command palette both resolve the visible business set first and bound
every query to it — a search box is exactly where a missing check turns into
one client reading another's menu.

- `tests/integration/tenant-isolation.test.ts`
- `e2e/template-preview.spec.ts` — the preview route refuses another tenant and
  refuses a signed-out visitor.

**The admin session gate is in the dashboard layout, not middleware.**
Middleware cannot reach the database, so it could only check that a token
parses — not that the account still exists and is active.

---

## Identifiers: what is public

A business has two identifiers, and the distinction is load-bearing:

| | Used for | May appear publicly |
|---|---|---|
| `id` (cuid) | Foreign keys, admin routes behind the session gate | **No** |
| `publicId` | QR codes, `/m/{publicId}`, storage keys | Yes — that is its job |

Media storage keys are namespaced by `publicId`. They were namespaced by the
internal `id`, and because a media URL is rendered into every public profile,
every page published an internal identifier and allowed anyone to correlate a
tenant across profiles. Fixed in `storeMedia`; asserted from both ends:

- `tests/integration/media.test.ts` — the key contains the public id and not
  the internal one.
- `tests/integration/public-profile.test.ts` — no cuid appears anywhere in the
  serialised read model.

The public read model is a deliberate projection, not a serialised ORM object.
That is what makes the second assertion possible at all.

---

## SSRF — Link Health

Link Health exists to make the server fetch a URL an operator typed. That is
the textbook shape of SSRF, so the defences are the feature.

`src/server/links/address.ts` decides policy; `src/server/links/probe.ts`
enforces it around the fetch.

**Decided from the string, before any DNS query:**

| Rule | Why |
|---|---|
| Scheme must be `http:` or `https:` | `file:` reads the server's disk; `gopher:` and `dict:` speak other protocols through an HTTP client |
| Port must be one of `80`, `443`, `8080`, `8443` (or absent) | An allowlist, not a blocklist. Left open, a URL field is a port scanner: a live Redis announces itself by *how* the connection fails, and a blocklist has to be right about every service anyone will ever run |
| No credentials in the URL | `http://user:pass@host/` hands the operator's credentials to whatever the hostname currently resolves to |

**Decided after resolution, on the addresses themselves:**

The **resolved addresses** are judged, never the hostname — a name the attacker
controls can resolve to anything. **Every** address must pass: a name resolving
to both a public address and `127.0.0.1` is an attack, not a fallback.

Refused: `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16`
(**the cloud metadata service** — the highest-value SSRF target there is),
`172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, the TEST-NETs, multicast
and the reserved space. For IPv6: loopback, unspecified, link-local, unique-local,
multicast, documentation, and the forms that carry a v4 address inside —
`::ffff:`, `64:ff9b::` (NAT64) and `2002::` (6to4), each judged as the v4
address it contains.

An address that cannot be parsed is **refused, not guessed at**. This is what
closes the octal bypass (`0177.0.0.1`, which some resolvers read as
`127.0.0.1`).

**Enforced around the request:**

- Redirects are followed **manually**, and every hop goes through the same
  checks. Handing redirects to `fetch` means nothing looks at the address that
  is actually contacted.
- Bounded: 5s total, 3 hops, 64 KiB read then the stream is cancelled.
- Nothing is sent: no cookies, no credentials, no operator identity.
- The result is a **status class and a short reason**, never response content.

Tests: `tests/unit/link-address.test.ts` (19 cases, each one an attack that has
been used) and `tests/unit/link-probe.test.ts`, which proves the guard against
a **real HTTP server bound to loopback** — an address that genuinely exists and
genuinely answers — and proves that a redirect toward the metadata service is
refused at the second hop.

### Accepted risk: DNS rebinding

The name is resolved for the check and resolved again by the connection. A
resolver that returns a public address to the first query and a private one to
the second would defeat the check.

Closing this requires connecting to the *checked address* with the `Host`
header preserved, which the platform `fetch` does not expose. The mitigation is
that a probe returns only a status class and never a body, so a successful
rebind yields "this address answered" — a single bit, not an exfiltration
channel. Combined with the port allowlist, the reachable surface is small.

**This is accepted, not overlooked.** Revisit if the probe is ever changed to
return response content, or if an HTTP client with pinned-address connection
becomes available.

### Amplification

The cost of a check is outbound requests to third parties, so a loose limit
hurts the *target*, not this platform. Probes run **sequentially**, capped at 24
links per run, and rate-limited to **one run per business per minute**
(`RULES.linkCheck`). `e2e/link-health.spec.ts` asserts the second run is
refused.

---

## File uploads

Three-way validation: the declared content type, the extension and the **magic
bytes** must agree (`src/server/files/validation.ts`). Size caps are per type.

Storage keys are **generated**, never derived from the filename:
`businesses/{publicId}/media/{16 hex}{ext}`. A crafted filename can neither
escape the tenant namespace nor overwrite an existing object. Dimensions are
read from the bytes with `sharp`, not trusted from the client.

`/uploads/[...key]` is **not an open file server**. Three conditions gate it:

1. The key must correspond to a `Media` row — an object on disk that no row
   references cannot be fetched by guessing a path.
2. The owning business must be `ACTIVE`…
3. …**or** the requester must be staff with a grant on it, so an operator can
   preview a business they are still setting up.

`?w=` serves a **pre-generated** derivative. The width is checked against the
widths actually generated for that row, never passed to an image pipeline —
this is what stops the route becoming an on-demand resizer, the classic way an
image endpoint turns into a denial-of-service amplifier.

A draft business's media returns **404, not 403**: the route does not disclose
that it exists.

---

## Authentication and sessions

- Passwords are hashed with scrypt (`src/server/auth/password.ts`).
- Login is rate-limited **per account** (8 / 15 min) and **per client**
  (25 / 15 min), so one source cannot spray many accounts. A correct password
  clears the account window.
- A wrong password and an unknown address return the **same message** — no
  account enumeration. `e2e/admin.spec.ts` asserts this.
- The seed never resets an existing password, and prints a generated one once
  rather than shipping a hard-coded credential into every environment that ever
  ran it.
- `src/lib/env.ts` refuses to boot in production on a missing or placeholder
  `AUTH_SECRET`.

## Client preview tokens

Tokens are random, expiring and revocable. Brute-forcing one is the threat, so
they are rate-limited per client (30 / min, `RULES.previewToken`). A preview
records nothing in the business's visitor numbers —
`e2e/guided-journey.spec.ts` asserts an owner looking at their own preview is
not counted as a customer.

## Rate limiting

One implementation, `src/server/security/rate-limit.ts`, with every rule
declared in one place: `events`, `loginAccount`, `loginClient`, `api`,
`previewToken`, `palette`, `linkCheck`.

**It is in-process.** With more than one application node the limits multiply by
the node count. Acceptable for a single-node deployment; a shared store is
required before scaling out — the same constraint that gates the storage
provider (see `docs/DEPLOYMENT.md`).

## Transport and headers

CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, COOP, and HSTS **in production only**. Verified against a
running production build (`e2e/security-headers.spec.ts`), including that the
CSP permits no external origin.

Framing is restricted to **this origin rather than forbidden outright**:
`frame-ancestors 'none'` was shipped once and broke the admin's own template
previews.

Outbound links on operator-supplied URLs carry
`rel="noreferrer noopener nofollow external"`.

---

## Known-open items

| Item | Severity | Note |
|---|---|---|
| `mysql2` advisory, transitive via `prisma` | Informational | Unreachable — the app uses the `pg` adapter |
| `deepmerge-ts` via `@prisma/config`, `uuid` via `exceljs` | Informational | Awaiting upstream releases |
| DNS rebinding on link probes | Low | Accepted, above |
| In-process rate limiting | Low | Correct for one node; blocks scaling out |
| No error monitoring integration | Low | Errors reach stdout only |

## Reporting

Report suspected vulnerabilities to the repository owner privately. Do not open
a public issue.
