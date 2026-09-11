# Trackit

**Know if you're actually making money.** A profit-clarity tool for small business owners (Nigeria first): true profit per product, underpricing alerts with a suggested price, a daily sales habit rewarded with WhatsApp receipts, professional invoices, and a shareable mini-shop that closes orders on WhatsApp.

This is the v1 **web app** (web-first, mobile app comes later): a responsive, installable app backed by a small server. Desktop gets a sidebar layout; mobile collapses the sidebar into a slide-in drawer.

## Run it

The Node backend serves both the app and the API from one process.

```bash
node server/index.mjs
```

Then open `http://localhost:5050`. Sign up (you get a 7-day free trial), and you're in. No build step, no dependencies to install. Optional config lives in `.env` (see `.env.example`) — mainly `PAYSTACK_SECRET_KEY` to take real payments.

## Deploy

Deploy as a **Node service** (Render, Railway, Fly, a VPS): start command `node server/index.mjs`, set `PORT` and, for live billing, `PAYSTACK_SECRET_KEY`. Point `TRACKIT_DATA_DIR` at a persistent disk. The frontend is served by the same process, so there is no separate static host to manage.

## How it is built

- **No framework, no dependencies.** Vanilla JS on the front, a zero-dependency Node server on the back (`node:http` + `node:crypto`).
- **The spine is the product list.** The calculator writes to it, the sales tracker reads from it, the shop publishes it, invoice line items autofill from it. One entry, three payoffs.
- **Accounts + server-authoritative state.** Data and subscription live on the server, scoped to the signed-in business. The client keeps an in-memory copy (hydrated on load, synced back on write) and a `localStorage` cache for a fast/offline paint.

### Files

**Frontend**

| File | Job |
|---|---|
| `index.html` | App shell, auth view, fonts |
| `css/app.css` | The whole design system (BAP palette, Fredoka / Fraunces / Plus Jakarta) |
| `js/api.js` | Client for the backend (holds the session token) |
| `js/store.js` | The spine: in-memory state, hydrate-from-server, debounced write-sync |
| `js/ui.js` | DOM helpers, icons, money formatting, dialogs, toasts, donut |
| `js/screens.js` | Overview, Products, Pricing, Sales, Invoices, Shop, Business, Paywall |
| `js/app.js` | Auth gate, sidebar/drawer shell, hash router, boot |
| `sw.js` | Offline shell cache (API is never cached) |

**Backend** (`server/`)

| File | Job |
|---|---|
| `index.mjs` | HTTP server: serves the app + routes `/api/*` |
| `db.mjs` | JSON-file datastore (swap for SQLite/Postgres later) |
| `auth.mjs` | scrypt password hashing + opaque session tokens |
| `billing.mjs` | Subscription state (trial / active / canceled / expired) |
| `paystack.mjs` | Real Paystack calls, gated by a secret key |
| `seed.mjs` | Demo catalogue for new accounts |

### API

`POST /api/auth/{signup,login,logout}` · `GET /api/me` · `PUT /api/business` · `GET|PUT /api/state` · `POST /api/billing/{initialize,verify,mock-activate,cancel,resume}` · `POST /api/paystack/webhook`. All except auth require a `Bearer` token.

To wipe all accounts locally, stop the server and delete `server/data/`.

## Design system

Pulled from the `Trakkit` moodboard (BAP palette + Kilimanjaro-style rounded display).

- **Ink / brand:** Oiler Navy `#19244e`, Brilliant Blue `#253c96`
- **Profit / energy:** Sunset Orange `#f36b2e`, Mango `#f59a1e`
- **Tint:** Ocean Water `#c4e7e5`
- **Type (three roles):** Fredoka (numbers + wordmark only, used sparingly), **Fraunces** (the editorial secondary — tagline, page intros, empty states, invoice "thank you"), Plus Jakarta Sans (all UI + body).
- **Signature element:** the honesty meter — a per-product margin bar that reads red when underpriced and green when healthy, always paired with a move (a suggested price).

## What is in / out for v1

**In:** product list (progressive costing), pricing calculator, sales tracker with WhatsApp receipts, invoice generator (auto-numbered, product-linked line items, discount, due date, printable / WhatsApp-able document, paid/sent/overdue status), mini-shop with WhatsApp order routing, business settings.

**Out (on purpose):** payment processing, staff accounts, POS hardware, marketing campaigns, overhead accounting. See the product doc.

## Billing & paywall

- **7-day free trial**, then **₦5,000 / month**. Trial starts on first run; a strip counts down the days with a Subscribe button.
- When the trial (or a subscription) lapses, the app **locks** to an upgrade screen. The **Pricing calculator stays free** even when locked — it is the spread hook the product doc protects.
- Subscribe / cancel / resume live in **Business → Billing**. There is a "Preview paywall" demo control to see the locked state.
- **Payments:** the app never collects card details itself. Set `PAYSTACK_SECRET_KEY` and "Subscribe" runs real checkout on Paystack's hosted page; the server verifies the transaction (and a `charge.success` webhook is handled too) before flipping the subscription to active. With no key set, the server runs in **mock mode** and "Subscribe" activates the plan so the flow stays fully testable. Subscription state is **server-authoritative** — it is not editable in the browser.

## Still open

1. **Name** spelling: display uses "Trackit". Folder is "Trakkit". Confirm the real one.
2. **Logo** — placeholder SVG in `assets/`, to be replaced.
3. **Live Paystack keys** — add `PAYSTACK_SECRET_KEY` to take real money; set the webhook URL to `/api/paystack/webhook` in the Paystack dashboard.
4. **Hardening for production** — password reset / email verification, rate limiting, and a real database (the JSON store is single-process). Good next steps before launch.
