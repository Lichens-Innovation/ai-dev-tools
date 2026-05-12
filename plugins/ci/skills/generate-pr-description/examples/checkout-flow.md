# Extended Example — checkout-flow

This example walks through Steps A–E from the skill for a realistic multi-theme PR.

---

## Context

- **Branch:** `feature/checkout-flow`
- **Parent:** `main`
- **Scope:** Payment service, cart UI, discount API, tests, and docs.

---

## Step A — Raw changes extracted from diff

| Change | Source |
|---|---|
| `PaymentService`: added Stripe integration | commit + diff |
| `PaymentService`: added retry logic on failure | commit + diff |
| `CartSummary` component: shows discount badge | commit + diff |
| `CartSummary` component: fixed item count bug | commit + diff |
| `DiscountAPI`: new `/apply` endpoint | commit + diff |
| `auth.test.ts`: added login edge-case tests | diff (test file) |
| `checkout.test.ts`: added checkout flow tests | diff (test file) |
| `README.md`: updated setup instructions | diff (markdown file) |

---

## Step B — Group into themes

| Theme | Raw changes assigned |
|---|---|
| **Payment** | Stripe integration, retry logic |
| **Cart UI** | Discount badge, item count fix |
| **API** | `/apply` endpoint |
| **Tests** | `auth.test.ts`, `checkout.test.ts` |
| **Docs** | `README.md` update |

---

## Step C — Decide hierarchy level per theme

| Theme | Distinct sub-changes | Level |
|---|---|---|
| Payment | 2 (Stripe provider, retry logic) | Level-1 + Level-2 |
| Cart UI | 2 (badge display, count fix) | Level-1 + Level-2 |
| API | 1 (`/apply` endpoint) | Level-1 only |
| Tests | 2 (auth tests, checkout tests) | Level-1 + Level-2 |
| Docs | 1 (README update) | Level-1 only |

---

## Step D — Written bullets

```markdown
- **Payment:** Stripe integration with fault tolerance.
  - Stripe payment provider added.
  - Retry logic on failed transactions.
- **Cart UI:** visual and functional improvements.
  - Discount badge displayed in cart summary.
  - Fixed incorrect item count display.
- **API:** `/apply` discount endpoint added.
- **Tests:** coverage for auth and checkout flows.
  - Login edge-case tests (`auth.test.ts`).
  - End-to-end checkout flow tests (`checkout.test.ts`).
- **Docs:** README setup instructions updated.
```

---

## Step E — Validation checklist

- [x] No theme appears more than once at Level-1.
- [x] Every Level-2 bullet belongs to a different component/behavior within its theme.
- [x] No sub-change is repeated across different themes.
- [x] Themes with only one sub-change (API, Docs) have no Level-2 bullets.

---

## Final PR output

```markdown
## PR Description

feat(checkout): implement checkout flow with Stripe and discounts

- **Payment:** Stripe integration with fault tolerance.
  - Stripe payment provider added.
  - Retry logic on failed transactions.
- **Cart UI:** visual and functional improvements.
  - Discount badge displayed in cart summary.
  - Fixed incorrect item count display.
- **API:** `/apply` discount endpoint added.
- **Tests:** coverage for auth and checkout flows.
  - Login edge-case tests (`auth.test.ts`).
  - End-to-end checkout flow tests (`checkout.test.ts`).
- **Docs:** README setup instructions updated.

## Checklist

- [x] Tests added or updated
- [x] Documentation updated
```
