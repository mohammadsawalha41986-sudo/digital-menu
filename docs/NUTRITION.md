# NUTRITION

The nutrition model, and the distinction the readiness layer exists to hold.

Spec sections in brackets.

---

## The one rule

> **"Data missing" is not "the business is non-compliant",
> and "data complete" is not "the business is compliant."** `[§107]`

Nothing in this module returns a compliance verdict. It reports which fields the
business has supplied and stops there.

A regulatory judgement depends on the menu, the premises and an inspector —
none of which this platform can see. A system that implied otherwise would be
selling a legal assurance it cannot honour, to a client who would reasonably
rely on it.

A test greps the entire generated report for the language of compliance and
fails if it appears.

## The fields `[§105]`

| Field | Stored as | Notes |
|---|---|---|
| Calories | `Int?` | kcal |
| Caffeine | `caffeineMg Int?` | Named in SFDA guidance alongside calories |
| Sodium | `sodiumMg Int?` | |
| Protein, carbohydrates, fat, fibre, sugar | `*Deci Int?` | Tenths of a gram |
| Serving size | `servingSizeAr/En` | Authored per language |
| Allergens | `String[]` | Declared only; no medical claim is derived |
| High salt | `highSalt Boolean` | Set by the business when it wants the notice shown |
| Physical activity note | `activityNoteAr/En` | Authored, never computed |

### Why every field is nullable

A field nobody filled in must stay distinguishable from one whose true value is
zero. "0 mg of caffeine" is a statement the business made; "caffeine not stated"
is not. Conflating them is how a platform ends up publishing a nutritional claim
nobody made.

A test asserts that a genuine zero counts as *supplied* and an absent value does
not.

### Why grams are integers

Tenths of a gram in an `Int`, for the same reason prices are stored in minor
units: no floating-point value touches the database. `formatGrams` renders
`325` as `32.5 g` and `320` as `32 g`.

### Why the activity note is authored

A calorie-burn figure depends on the person reading it. Computing one would be a
health claim about a customer the platform has never met. The business writes
the sentence, or there is no sentence. `[§05]`

## Per-item state `[§106]`

`COMPLETE` — every field supplied.
`PARTIAL` — some supplied.
`MISSING` — none supplied.

Core fields — calories, serving size, allergens — are tracked separately, so
"show me every item missing calories" is a real filter rather than a scan.

An **empty allergen list counts as not stated.** An absent list and a genuine
"no allergens" declaration are indistinguishable in the data, so the
conservative reading wins: it prompts a person to check. Reporting an unchecked
item as allergen-free is the failure mode with a victim.

## Per-business readiness

`/admin/businesses/{id}/nutrition` shows coverage per field, the items needing
attention, and one overall word: `COMPLETE`, `PARTIAL`, `MISSING` or
`NEEDS_REVIEW`. Never *compliant*.

The disclaimer is rendered unconditionally, not only when something is missing:

> This reports which information the business has supplied. It is not a
> regulatory assessment, and it does not state whether the business meets any
> requirement.

## Businesses this does not apply to

A salon, a barber, a gym or a retailer is told plainly that no nutrition
information is expected, rather than shown an empty checklist that reads as a
failure. `isFoodBusiness()` decides, from the business type. `[§05]`

## Filling the fields in bulk

The fastest route for an existing menu is Data → export, fill the columns in a
spreadsheet, and import back. The importer matches on `itemCode`, so the round
trip updates rather than duplicates. See `docs/EXCEL-IMPORT.md`.
