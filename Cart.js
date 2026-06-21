const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Cart item subdocument.
 *
 * `unitPriceSnapshot` is captured at the moment an item is added/updated.
 * This is a deliberate design choice: a customer's cart total should not
 * silently change because a product's price changed in the catalog while
 * they were shopping. Checkout recomputes against the live catalog price
 * separately and flags drift (see controllers/cartController.js).
 */
const cartItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'quantity must be at least 1'],
      max: [999, 'quantity exceeds maximum allowed per line item'],
    },
    unitPriceSnapshot: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/**
 * Cart document — one active cart per user, enforced by the partial unique
 * index below (a user may accumulate multiple *checked_out* or *abandoned*
 * carts historically, but only one *active* cart at a time).
 *
 * Feature X (see DESIGN.md / README.md "Feature X" section): every cart
 * carries an `expiresAt` timestamp maintained by a MongoDB TTL index.
 * Idle carts are automatically reaped by MongoDB itself — no cron job,
 * no extra infra, no risk of a forgotten background worker.
 */
const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'checked_out', 'abandoned'],
      default: 'active',
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    // Soft delete flag — distinct from `status` because a cart can be
    // logically deleted by a user action independent of the checkout
    // lifecycle (e.g. "clear my cart").
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Feature X: TTL-driven expiration. MongoDB deletes the document once
    // this timestamp is in the past (background sweep, evaluated roughly
    // every 60s by the server, not exact-to-the-second but is exact enough
    // for cart abandonment cleanup).
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

// Only one *active*, non-deleted cart per user.
cartSchema.index(
  { user: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active', isDeleted: false },
  }
);

cartSchema.methods.recalculateExpiry = function (ttlMinutes) {
  this.expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
};

module.exports = mongoose.model('Cart', cartSchema);
