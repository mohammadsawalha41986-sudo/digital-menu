# Digital Profile OS

Premium, dynamic digital business profiles behind a **permanent QR code** — Arabic-first,
English-supported, mobile-first, multi-tenant, multi-template, run as a managed service.

A visitor scans a QR (or opens a permanent URL) and gets a branded experience: menu or
service catalogue, offers, images, prices, calories where provided, downloadable menu
files, contact, social and location. No login, no app, no ordering.

The company operates the platform. The client receives a finished service.

## Status

Early — architecture and goals defined, implementation not started.

- **[docs/GOALS.md](docs/GOALS.md)** — north star, invariants, stack decision, phased
  delivery plan with acceptance criteria, and the open decisions that block Phase 0.

## The one rule everything else serves

The QR is permanent; the content is dynamic.

```
QR → Permanent Profile URL → Business → Current Content → Template → Brand Theme
```

Changing prices, images, calories, offers, the PDF menu, the brand or the template must
never change the QR or the public URL.
