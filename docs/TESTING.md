# Testing

## The rule

A test is **PASS** only if it ran and passed. If the database was unavailable,
the browser was missing, the suite was skipped or the environment was mocked in
a way that removed the thing under test, the result is **BLOCKED** or **NOT
RUN** — never PASS.

This is not pedantry. Before this pass, 167 of 624 tests were skipping because
no database was present, and the suite reported green. Those 167 were the
integration suite: tenant isolation, media, publishing, the API. The status
document recorded it honestly as BLOCKED; the *test runner* did not.

CI now makes that impossible:

```yaml
- run: npm test
  env:
    REQUIRE_DATABASE: '1'
```

A missing database fails the run rather than quietly removing a third of the
suite from it.

## Layers

| Layer | Runner | Location | Count |
|---|---|---|---|
| Unit | Vitest | `tests/unit/` | 41 files |
| Integration | Vitest + real Postgres | `tests/integration/` | 13 files |
| End-to-end | Playwright + Chromium | `e2e/` | 15 files |

**670** unit and integration tests, **90** E2E. All passing.

### Unit

Pure logic: money, public-id generation, working-hours state, contrast maths,
font stacks, the media pipeline's derivative and quality rules, rate limiting,
the artwork generator, brand-token integrity, and the SSRF address policy.

No database, no network, no mocks of the code under test.

### Integration

Real PostgreSQL. These are the tests that answer "does the *system* hold",
which is why their absence mattered so much: tenant isolation, media upload and
assignment, menu versioning, publishing, client review, import/export,
analytics, staff management, the public profile read model, QR permanence,
public files, offers and the API.

They read `DATABASE_URL` from `.env`, exactly as the Prisma CLI does.

### End-to-end

Playwright against a **production build**, on a **mobile viewport** (Pixel 7),
because that is the primary design target. Nothing is stubbed: signing in sets
a real session cookie, saving writes to the database, publishing runs the
publication transaction, and assertions read the resulting public profile.

Notable specs:

| Spec | What it protects |
|---|---|
| `full-journey` | The complete acceptance journey, create → publish → QR → rollback |
| `guided-journey` | The eleven-step builder, step by step |
| `design-qa` | That the ten families are genuinely different designs, and that every one stays readable |
| `admin-contrast` | The admin surface, measured rather than eyeballed |
| `typography` | That each shipped font actually loads and draws differently from a fallback |
| `security-headers` | Headers and CSP against a running production build |
| `print-pdf` | That the generated PDF contains complete, correctly-mapped Arabic |
| `command-palette` | Keyboard-only operation |
| `link-health` | That an unchecked link never reads as working, and that a second run is refused |
| `template-preview` | That a draft previews, and that another tenant cannot |

## Running them

```bash
# One-time: a database
createdb digital_profile_os
npx prisma migrate deploy
SEED_ADMIN_PASSWORD=devpassword12345 npm run db:seed

npm run lint
npm run typecheck
npm test          # unit + integration
npm run build
npx playwright test
```

The Playwright config starts `next start` itself and waits on `/api/health`.

In a sandbox with a preinstalled Chromium whose build differs from this
Playwright release:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome npx playwright test
```

## Two things learned the hard way

**Measure, do not eyeball.** Every contrast defect found in this pass had
survived visual review. A 1.82:1 offer panel, an unreadable active nav link and
125 dead custom properties all looked plausible on screen. The tests that catch
them compute ratios and compare token names.

**A test that only sees one state tests one state.** The hours badge has an
open and a closed styling, and only one renders at a time, so half of it was
invisible to any given run — both halves shipped broken at different points,
each surviving because the sweep ran while the *other* state was showing. The
design-QA sweep now flips `data-open` and measures again. When you write a test
against a stateful component, ask which state the clock is hiding.

## Writing a new test

- Assert the **behaviour**, not the implementation. `design-qa` asserts that
  families differ in DOM, metrics and palette — not that a class is named a
  particular thing.
- Prove a regression test **fails without the fix**. Every guard added in this
  pass was verified by reverting its fix and watching it fail. A guard that has
  never failed has not been shown to work.
- If a test cannot run, make it **loud**. Never `skipIf` something into silence
  without a CI-level guard that the skip did not happen.
