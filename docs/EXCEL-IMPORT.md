# Excel / CSV import and export

The workflow the spec is built around: **export → edit prices in the spreadsheet →
re-import → items update rather than duplicate → and it can be undone** (master spec
§57–§79, §126).

## Workflow

```
Download template ─┐
                   ├─→ Fill in → Upload → Preview → Confirm → Results → (Roll back)
Export current menu┘
```

Nothing is written until an operator confirms the preview (§61). The preview step performs
no database writes at all.

## The template

`/admin/businesses/{id}/data` → **Excel template**.

It carries the column headers, one example row so the expected shape is visible rather
than described, and a second sheet documenting every column: Arabic label, whether it is
required, and what the field means.

A test asserts the template's own headers auto-map — a template that fails its own
importer would be a trap.

## Columns

Required: `category_ar`, `item_name_ar`, `price`. Everything else optional.

| Column | Notes |
|---|---|
| `item_id` | Stable item code. Present → update that item. Empty → create a new one (§66) |
| `category_ar` / `category_en` | Category created on demand from the file |
| `item_name_ar` / `item_name_en` | English is never machine-filled |
| `description_ar` / `description_en` | |
| `price` | In the business currency. Reads Eastern Arabic-Indic digits |
| `currency` | Ignored on import — the business currency governs |
| `calories` | Only imported when supplied. An empty cell stays empty (§37) |
| `serving_size` | Doubles as duration for service businesses |
| `ingredients_ar` / `ingredients_en` | |
| `allergens` | Comma separated; Arabic spellings accepted |
| `tags` | Comma separated |
| `image_url` | Validated, not fetched during import. A bad URL never fails the row (§70) |
| `featured`, `available` | `TRUE`/`FALSE`, or `نعم`/`لا`, or `متوفر`/`غير متوفر` (§69) |
| `sort_order` | Whole number |
| `menu` | Menu key. Blank uses the menu chosen at import (§74) |
| `branch` | Branch key. Present → the row sets a branch price override (§73) |

## Header matching

The file that arrives is a restaurant's own spreadsheet, so matching normalises:

- case and surrounding whitespace,
- Arabic diacritics,
- the several Unicode forms of alef and yeh that the same word gets written with,
- `_`, `-` and `.` as word separators.

Each column declares aliases in both languages (`السعر`, `price`, `amount`, `cost`, …).
Unknown columns stay unmapped rather than being guessed at, and the detected mapping is
shown in the preview for the operator to check (§60).

## Validation

Every problem is reported as **row + column + value + what is wrong + a concrete fix** —
which is what repairs a 400-row file. A count of failures is not.

- Valid rows import alongside invalid ones (§64).
- A bad image URL warns without failing the row (§70).
- An unrecognised allergen is reported rather than dropped, because a missing allergen is
  a safety matter (§38).
- Duplicate item codes within one file are flagged, naming the earlier row (§65).
- A price that cannot be read fails the row rather than being guessed — a wrong price
  reaches a printed menu.

An error report for any batch is downloadable as a spreadsheet (§63).

## Duplicate handling

Rows match on `(businessId, itemCode)`. On a match, the operator chooses **update** or
**skip** at confirmation time (§65). Rows without an `item_id` get a derived, stable code
so re-importing the same file updates rather than duplicating.

## Price history

Every price change writes a `PriceHistory` row carrying old value, new value, currency,
who changed it, and the batch when it came from an import (§124, §77).

## Rollback

Each touched row stores the item's prior state before it is changed, so a batch can be
undone: updated items are restored, created items removed — in one transaction (§76, §126).

A batch can be rolled back **once**. Twice would restore stale values over whatever
legitimately happened since.

## Export

Deliberately import-shaped: same columns, same order, `item_id` populated. That is the only
reason the round trip works.

| Audience | Includes `item_id` | For |
|---|---|---|
| Admin | Yes | Editing and re-importing |
| Client | No | Handing a business its own menu data without internal identifiers (§79) |

Formats: `.xlsx` and `.csv`.

## Limits

- 5,000 data rows per file.
- Image ZIP import (§71) is **not implemented**. The `image_url` column is validated but
  images are not fetched during import; media is uploaded through the media library
  instead. Fetching arbitrary URLs server-side is an SSRF surface that needs an allowlist
  and a fetch budget to do safely, and that was not worth shipping half-done.
