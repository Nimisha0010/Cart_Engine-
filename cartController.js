const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { computeCheckoutPricing } = require('../utils/promotionEngine');

const CART_TTL_MINUTES = Number(process.env.CART_TTL_MINUTES) || 4320; // default 3 days

/**
 * Finds the user's active, non-deleted cart, creating one if it doesn't
 * exist yet. Every cart mutation goes through this so we never accidentally
 * operate on a stale or deleted cart.
 *
 * NOTE: not wrapped in a transaction. The partial unique index on
 * { user, status: 'active', isDeleted: false } is what actually prevents
 * duplicate active carts under concurrent first requests — Mongo will
 * reject the second insert with a duplicate-key error (handled by
 * errorHandler), so a retried request safely converges on the
 * single existing cart.
 */
async function getOrCreateActiveCart(userId) {
  let cart = await Cart.findOne({ user: userId, status: 'active', isDeleted: false });

  if (!cart) {
    cart = await Cart.create({
      user: userId,
      status: 'active',
      items: [],
      expiresAt: new Date(Date.now() + CART_TTL_MINUTES * 60 * 1000),
    });
  }

  return cart;
}

/**
 * GET /api/cart
 * Returns the caller's active cart (scoped via req.userId from the tenant
 * middleware — never trusts a client-supplied cart id for read access).
 */
const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateActiveCart(req.userId);
  res.json({ data: cart });
});

/**
 * POST /api/cart/items
 * Item Ingestion Endpoint. Adds a new line item or updates an existing
 * one's quantity. `mode: "increment"` (default) adds to existing quantity;
 * `mode: "set"` overwrites it outright (e.g. for a quantity stepper UI).
 *
 * Design decisions:
 *  - SKU must resolve to a real, active Product — we never trust a
 *    client-supplied price or name into the cart.
 *  - unitPriceSnapshot is captured from the catalog at write time.
 *  - Every successful ingestion call slides the cart's TTL forward,
 *    so an actively-shopped cart never expires mid-session.
 */
const addOrUpdateItem = asyncHandler(async (req, res) => {
  const { sku, quantity, mode } = req.body;

  const product = await Product.findOne({ sku, isActive: true });
  if (!product) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No active product found for SKU "${sku}".`,
    });
  }

  if (product.stock < quantity && mode !== 'set') {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Requested quantity (${quantity}) exceeds available stock (${product.stock}) for SKU "${sku}".`,
    });
  }

  const cart = await getOrCreateActiveCart(req.userId);
  const existingIndex = cart.items.findIndex((i) => i.sku === product.sku);

  if (existingIndex === -1) {
    cart.items.push({
      product: product._id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      quantity,
      unitPriceSnapshot: product.price,
    });
  } else {
    const newQuantity =
      mode === 'set' ? quantity : cart.items[existingIndex].quantity + quantity;

    if (newQuantity > 999) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Resulting quantity exceeds the maximum allowed per line item (999).',
      });
    }

    cart.items[existingIndex].quantity = newQuantity;
    // Refresh price snapshot in case the catalog price moved since the
    // item was first added — keeps the cart honest without surprising
    // the user mid-checkout (checkout itself re-validates again).
    cart.items[existingIndex].unitPriceSnapshot = product.price;
  }

  cart.recalculateExpiry(CART_TTL_MINUTES);
  await cart.save();

  res.status(200).json({ data: cart });
});

/**
 * DELETE /api/cart/items/:sku
 * Removes a single line item from the active cart.
 */
const removeItem = asyncHandler(async (req, res) => {
  const sku = req.params.sku.toUpperCase();
  const cart = await getOrCreateActiveCart(req.userId);

  const beforeCount = cart.items.length;
  cart.items = cart.items.filter((i) => i.sku !== sku);

  if (cart.items.length === beforeCount) {
    return res.status(404).json({
      error: 'Not Found',
      message: `SKU "${sku}" is not present in the active cart.`,
    });
  }

  cart.recalculateExpiry(CART_TTL_MINUTES);
  await cart.save();
  res.json({ data: cart });
});

/**
 * DELETE /api/cart
 * Soft-deletes (clears) the active cart rather than hard-deleting it,
 * preserving it for analytics/recovery. A fresh active cart will be
 * lazily created on the next request.
 */
const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.userId, status: 'active', isDeleted: false });

  if (!cart) {
    return res.status(404).json({ error: 'Not Found', message: 'No active cart to clear.' });
  }

  cart.isDeleted = true;
  cart.deletedAt = new Date();
  await cart.save();

  res.json({ data: { message: 'Cart cleared.', cartId: cart._id } });
});

/**
 * GET /api/cart/checkout
 * Dynamic Campaign Pricing Checkout. Recomputes subtotal/discounts fresh
 * against current cart contents (does NOT mutate cart status — this is a
 * preview/summary endpoint; see POST /api/cart/checkout/confirm for the
 * state-changing version).
 */
const previewCheckout = asyncHandler(async (req, res) => {
  const cart = await getOrCreateActiveCart(req.userId);

  if (cart.items.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Cannot checkout an empty cart.',
    });
  }

  const pricing = computeCheckoutPricing(cart.items);
  res.json({ data: { cartId: cart._id, items: cart.items, pricing } });
});

/**
 * POST /api/cart/checkout/confirm
 * Finalizes checkout: re-validates stock against the live catalog
 * (defends against stock depletion between preview and confirm),
 * decrements stock, marks the cart `checked_out`, and returns the final
 * pricing breakdown. This is intentionally a separate step from preview
 * so a UI can show pricing without side effects.
 */
const confirmCheckout = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const cart = await Cart.findOne({
        user: req.userId,
        status: 'active',
        isDeleted: false,
      }).session(session);

      if (!cart || cart.items.length === 0) {
        const err = new Error('Cannot checkout an empty or missing cart.');
        err.status = 400;
        throw err;
      }

      for (const item of cart.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product || !product.isActive) {
          const err = new Error(`Product for SKU "${item.sku}" is no longer available.`);
          err.status = 409;
          throw err;
        }
        if (product.stock < item.quantity) {
          const err = new Error(
            `Insufficient stock for SKU "${item.sku}". Available: ${product.stock}, requested: ${item.quantity}.`
          );
          err.status = 409;
          throw err;
        }
      }

      // All checks passed — decrement stock atomically.
      for (const item of cart.items) {
        await Product.updateOne(
          { _id: item.product },
          { $inc: { stock: -item.quantity } }
        ).session(session);
      }

      const pricing = computeCheckoutPricing(cart.items);

      cart.status = 'checked_out';
      await cart.save({ session });

      result = { cartId: cart._id, items: cart.items, pricing };
    });

    res.status(200).json({ data: result });
  } finally {
    session.endSession();
  }
});

module.exports = {
  getCart,
  addOrUpdateItem,
  removeItem,
  clearCart,
  previewCheckout,
  confirmCheckout,
};
