# AGENCY OPERATIONS

Running many businesses without opening each one.

Spec sections in brackets.

---

## The question the dashboard answers `[§88, §144]`

Not "how much is there?" — nobody asks that — but **"what needs my attention?"**

`/admin` leads with it: unpriced items, menus never published, businesses still
in draft, offers expiring within three days, open change requests, clients yet
to respond, missing opening hours, items without photographs. Ordered by
severity, each naming the businesses affected and linking to their health
screen.

### Why it does not run Profile Health per business `[§143]`

That reads a menu tree each time. At the thousand businesses the spec asks the
platform to work at, a thousand tree reads is a slow page and a heavy database.

The dashboard asks a small number of aggregate indexed questions instead, with
the detail one click away. Every figure is a real count — nothing sampled,
nothing estimated, because staff quote these to clients.

## Staff and access `[§17–§21]`

`/admin/staff`, super-admin only, and a 404 for everyone else — a staff user has
no business learning the screen exists.

| Platform role | Reaches |
|---|---|
| `SUPER_ADMIN` | Every business, plus staff and API-key management |
| `STAFF` | Only businesses explicitly granted |

Per-business roles: `VIEWER` reads, `EDITOR` changes content, `MANAGER` also
publishes and edits the business, `OWNER` is everything short of platform
administration.

**Nobody can lock the platform out of itself.** The last active super admin
cannot be demoted or deactivated, and nobody can deactivate themselves. Those
checks live in the service, because the UI is not the only caller.

Generated passwords are shown **once** and never stored in plaintext. They omit
`l`, `I`, `0` and `O`, because a password gets read aloud or typed by hand at
least once. They are not emailed: this platform sends no mail, and pretending
otherwise leaves an administrator waiting for a message that never arrives.

## Service mode `[§21, §22, §166]`

`/admin/businesses/{id}/quick` — one screen, large targets, no navigation, for
the three things that go wrong during service:

- an item runs out — one tap
- a price is wrong — one field
- an offer must stop — one tap

Plus contact numbers, because that is what a business changes in a hurry. Items
are listed with the unavailable ones first: during service, the list you want is
what is off.

Fast does not mean unaccountable. Every action goes through the same tenant
guard, writes the same audit entry, records price history exactly as the menu
editor does, and invalidates the public profile.

## Search `[§91]`

`/admin/search` covers businesses, branches, menus, categories, items, offers
and files in one box.

The set of businesses the user may see is resolved **first**, and every query is
bounded to it. A search box is exactly the surface where a missing tenant check
becomes one client reading another's menu.

A plain form and a server render rather than search-as-you-type: one round trip,
works without JavaScript, the back button behaves, and the result is a link you
can send someone.

## History and accountability `[§146, §147]`

`/admin/businesses/{id}/history`

- **Price changes**, with both figures, who made them, and whether they came
  from a person or an import batch. Every path that changes a price writes one:
  the menu editor, bulk edit, the importer and service mode.
- **The audit log**, filtered by the actions this business has actually
  recorded, with field-level before-and-after where the writer captured it.

Item names are looked up separately rather than joined, because a history row
deliberately outlives its item.

## Client review `[§71–§73]`

See `docs/CLIENT-APPROVAL.md`.

## What is not implemented

- **Bulk operations across several businesses** `[§145]` — export, status
  change, health report for a selection.
- **A command palette** `[§92]`.
- **Link health checking** `[§65]` — external links are stored and honestly
  reported as *unchecked* rather than assumed working.
