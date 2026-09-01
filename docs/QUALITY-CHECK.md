# QUALITY CHECK

Profile Health: what it measures, what it refuses to measure, and why it does
not block.

Spec sections in brackets.

---

## What it is

`/admin/businesses/{id}/health` scores a business out of 100 and lists every
finding grouped by severity, each with a link to the screen that fixes it.

`/admin` aggregates the same concerns across every business a user can see,
answering "what needs my attention?" first `[§88, §144]`.

## Three severities, and only one blocks `[§07]`

| Severity | Means | Example |
|---|---|---|
| **ERROR** | The profile does not work as intended | A visible item with no price |
| **WARNING** | Publishable, worth a look | No opening hours |
| **INFO** | Optional improvement | An item with no photograph |

A gate that treats a missing English description like a missing price is a gate
people learn to switch off. Only errors are described as blocking, and even then
the platform does not physically prevent publishing — it says plainly what is
wrong. `[§07]`

## Every finding is actionable `[§06]`

Every finding carries `fixPath`, a route to the screen that resolves it, and a
test asserts that none is missing one. A checklist that reports problems without
saying where to solve them spends the operator's time hunting instead of fixing.

Messages are written for operators. A test rejects any message containing
`null`, `undefined` or a bare field name.

## Scoring

Weighted so severity dominates count: `ERROR` 12, `WARNING` 4, `INFO` 1,
subtracted from 100 and clamped at zero.

The weighting matters more than the numbers. One missing price must cost more
than twelve missing photographs, or the score rewards padding a menu with images
while leaving it unpriced. There is a test for exactly that.

## What it checks

Grouped by area: brand, content, menu, images, nutrition, links, contact, hours,
SEO, QR, downloads, publishing.

Notable rules:

- **An Arabic-only business is never an error.** A business trading only in
  Arabic is a real business, not a mistake. Missing English is INFO, and items
  missing English names are flagged *only* when the business presents itself
  bilingually.
- **A hidden item needs no price.** Only visible items are required to be
  priced.
- **"No photograph anywhere" is a warning; "some items lack one" is a note.** A
  profile with no imagery reads as a price list; a profile with most images
  present is fine.
- **A featured item marked unavailable** is flagged: the profile is leading with
  something nobody can order.
- **Possible duplicates are reported for review, never merged.** Two sizes of
  one dish are not a mistake `[§109]`.

## What it refuses to say `[§107]`

Nutrition findings report **missing data**, never non-compliance. No message
contains the words *compliant*, *compliance*, *certified* or *SFDA*, and a test
greps the whole report to keep it that way.

The reasoning is in `docs/NUTRITION.md`. In short: a regulatory judgement
depends on the menu, the premises and an inspector, none of which this platform
can see, and a system implying otherwise would be selling a legal assurance it
cannot honour.

## Why the rules are pure functions

`src/server/quality/checks.ts` takes a plain record and returns findings. It
knows nothing about Prisma; `service.ts` does the database work and knows
nothing about what counts as a problem.

That split is what lets all twenty-five cases be tested in an environment with
no PostgreSQL, and it means a new check is a pure function with a test rather
than a query with a fixture.

## Scale `[§143]`

The dashboard deliberately does **not** run the full evaluation per business.
That reads a menu tree each time, and a thousand tree reads is a slow page and a
heavy database. It asks a small number of aggregate indexed questions instead,
and links to each business's own health screen for the detail.

Every figure is a real count. Nothing is sampled or estimated, because staff
quote these to clients.
