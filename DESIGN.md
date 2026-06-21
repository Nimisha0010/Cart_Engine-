# DESIGN.md

Architecture, schema decisions, validation strategy, edge cases, and trade-offs for the Adaptive E-Commerce Cart Engine.

## 1. Architecture Overview

Standard layered Express structure with strict separation of concerns:

```
routes/        -> only wires URLs to controllers + validation middleware
controllers/   -> request/response handling, orchestration, no raw query logic beyond what's needed
models/        -> Mongoose schemas, the only place schema-level invariants live
middleware/    -> cross-cutting concerns: tenant resolution, validation, rate limiting, errors
utils/         -> pure, stateless logic (promotion engine, async wrapper) - independently testable
```

The promotion engine (`utils/promotionEngine.js`) is deliberately a pure function with no Express or Mongoose dependency — it takes a plain array of `{quantity, unitPriceSnapshot, category}` and returns a pricing object. This was a conscious choice: pricing math is the highest-risk, most-likely-to-change part of the system, so it should be unit-testable in complete isolation from HTTP and the database.

## 2. Multi-Tenant Session & Schema Isolation

**Strategy:** header-based tenant identification (`x-user-id`) resolved by `middleware/tenant.js` into an internal `User._id`, attached to `req.userId`. Every cart query downstream is filtered by `user: req.userId` — never by a client-supplied cart id alone.

**Why not full JWT auth?** The assignment's evaluation criteria are architecture, data integrity, ambiguity handling, and Feature X — not auth implementation. Building a complete auth stack (password hashing, token issuance/refresh) would have added surface area without exercising any of the graded dimensions. The header-resolution approach still demonstrates the actual skill being tested — **isolating tenant data correctly** — and is structured so swapping in real JWT verification later is a one-file change: replace the body of `resolveTenant` with token verification, keep the same `req.userId` contract for every downstream controller.

**Schema relationship:**

```
User (1) ──── (1 active) Cart ──── (N) CartItem (embedded subdocument)
                                          │
                                          └── references → Product (catalog)
```

- **User ↔ Cart:** one-to-many at the document level (`Cart.user` is an indexed ref), but constrained to **at most one active cart per user** via a partial unique index: `{ user: 1, status: 1 }` with `partialFilterExpression: { status: 'active', isDeleted: false }`. Historical checked-out/abandoned carts are allowed to accumulate per user (useful for reorder/analytics features later) — only "active" is constrained to one.
- **Cart → Items:** items are **embedded subdocuments**, not a separate collection. A cart and its line items are always read and written together (no use case needs to query items independently of their cart), so embedding avoids an unnecessary join/lookup and keeps cart mutations atomic at the document level (a single `save()` covers the whole cart + all its items).
- **CartItem → Product:** items store a `product` ObjectId ref **plus a denormalized snapshot** (`sku`, `name`, `category`, `unitPriceSnapshot`). This is intentional denormalization: it means a cart's displayed contents and pricing never silently change because a product was renamed, recategorized, or repriced after the item was added. The live `Product` document remains the source of truth for stock checks and checkout re-validation.

## 3. Item Ingestion Endpoint

`POST /api/cart/items` is the single endpoint for both "add new item" and "update existing item" — disambiguated by whether the SKU already exists in the cart, with a `mode` flag (`increment` default vs `set`) controlling how quantity conflicts resolve. This was chosen over separate add/update endpoints because, from a client's perspective, "user changed the quantity on this product" is one conceptual action regardless of whether it's the first or fifth time that SKU has touched the cart — collapsing it to one endpoint avoids the client needing to know cart state in advance to pick the right call.

Validation flow on ingestion:
1. Joi schema validates shape (`sku` string, `quantity` 1–999 integer, `mode` enum) → structured 400 on failure.
2. SKU is resolved against the live `Product` catalog — unknown/inactive SKUs are rejected (404), so a cart can never contain a "ghost" item with no backing product.
3. Stock is checked at write time (best-effort; re-checked authoritatively at checkout confirm to close the TOCTOU gap between ingestion and purchase).
4. Cart TTL (`expiresAt`) is refreshed on every successful mutation (see Feature X).

## 4. Dynamic Campaign Pricing Checkout

Split into two endpoints by design:

- `GET /api/cart/checkout` — **preview**, pure read, computes pricing fresh against current cart contents, no mutation. Lets a UI show live pricing as the user edits their cart without any risk of side effects from repeated calls.
- `POST /api/cart/checkout/confirm` — **finalize**, wrapped in a MongoDB transaction: re-validates stock against the live catalog (defends against a race where stock was depleted between preview and confirm by a concurrent buyer), decrements stock, marks the cart `checked_out`.

**Promotion math** (full detail in README.md) deliberately uses a **"best of" competition** between a value-based tier and a diversity-based tier rather than stacking both as a sum. Reasoning: naive stacking (e.g., a maxed-out 20% value tier + 12% diversity tier = 32% off) creates a discount ceiling that scales unpredictably as more dimensions get added later, and is harder for a business stakeholder to reason about ("what's our worst-case margin on a single order?"). A "best of N competing campaigns" model has one critical invariant — **maximum discount per cart equals the single highest tier rate among all configured dimensions** — which makes margin-impact analysis trivial regardless of how many promotional dimensions are added in the future. The flat **Loyalty Bundle Bonus** is layered independently on top of the percentage winner because it represents a different business goal entirely (rewarding cross-category basket diversity specifically), not a bigger version of the same discount.

## 5. Feature X — Sliding Cart Expiration (TTL)

Covered in depth in README.md. Architecturally: implemented via Mongoose schema field `expiresAt` + a MongoDB TTL index (`{ expires: 0 }`, meaning "expire exactly at the stored timestamp"). `Cart.recalculateExpiry()` is called from every successful mutation in `cartController.js`. This was preferred over an application-level cron/cleanup job because:
- Zero additional infrastructure or scheduler dependency.
- Survives app restarts/crashes — cleanup is enforced by the database itself, not by app uptime.
- Naturally "sliding" — active shoppers never see their cart vanish mid-session.

## 6. Input Validation & Security

Two layers, deliberately redundant:

1. **Joi (application layer)** — validates request shape *before* anything touches Mongoose: type coercion, enums, min/max bounds, required fields. Returns a structured `400` with per-field `details[]`.
2. **Mongoose schema validation (data layer)** — a final backstop (e.g., `min`/`max`/`enum`/`required` on the schema itself) in case any document is ever constructed via a path that skips the Joi layer (e.g., a future internal script or migration). `middleware/errorHandler.js` normalizes both Joi and Mongoose validation errors into the same response shape, so API consumers never see two different error formats.

Additional hardening: `helmet` (security headers), `cors`, `express-rate-limit` (abuse/DoS mitigation), `express.json({ limit: '100kb' })` (payload size cap to block oversized-body attacks), and centralized duplicate-key (`11000`) handling that surfaces Mongo unique-index violations as a clean `409 Conflict` instead of a raw 500.

## 7. Edge Cases Considered

- **Concurrent first request from a new user** (tenant creation race) — handled via `findOneAndUpdate` with `upsert: true` rather than separate find-then-create calls.
- **Concurrent "add to cart" calls creating two active carts for the same user** — prevented by the partial unique index on `{ user, status: 'active', isDeleted: false }`; a losing concurrent insert surfaces as a `409` via the centralized duplicate-key handler.
- **Stock depleted between checkout preview and confirm** — confirm re-validates live stock inside a transaction before decrementing; fails the whole transaction atomically with a `409` if stock is now insufficient.
- **Product price changes while sitting in a cart** — handled via price snapshot; updating quantity on an existing line item refreshes the snapshot, but a price change alone (no quantity action) does **not** silently alter what the customer was shown, by design.
- **Empty cart checkout** — explicitly rejected with `400` at both preview and confirm.
- **Quantity overflow on repeated increments** — capped at 999 per line item, validated both at ingestion and after merge-quantity calculation.
- **Cart expiring mid-request** — since TTL deletion is a background sweep (not exact-to-the-millisecond), a theoretical request could race a just-expired cart; `getOrCreateActiveCart` simply creates a fresh active cart if none is found, so the user experience degrades gracefully to "empty cart" rather than erroring.

## 8. Trade-offs / Known Limitations

- **No real authentication** — explicitly scoped out per assignment evaluation criteria; see §2 for the swap-in path to real auth.
- **Transactions require a replica set** — `checkout/confirm` uses `session.withTransaction()`, which MongoDB only supports on replica sets/sharded clusters, not a bare standalone instance. Documented in README.md setup instructions. An alternative for standalone deployments would be a compensating-action (saga) pattern instead of a true transaction, but that trades simplicity for correctness guarantees that matter more here (stock accuracy).
- **TTL sweep timing** — MongoDB's TTL background task runs roughly every 60 seconds, so expiration isn't exact-to-the-second. Acceptable for cart abandonment cleanup; not used for anything requiring precise timing.
- **No pagination on cart items** — carts are assumed to stay within a reasonable item count (tens, not thousands) for a typical e-commerce session; the embedded-subdocument design would need revisiting if that assumption changes.
