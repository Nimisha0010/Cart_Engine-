const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Product catalog.
 *
 * Carts store a reference to a Product plus a *price snapshot* (see
 * Cart.js) rather than re-reading live price at render time everywhere.
 * The catalog is still the source of truth used to validate ingestion
 * requests and to recompute authoritative pricing at checkout.
 *
 * `category` powers the "cart diversity" dimension of the tiered
 * promotion engine (see utils/promotionEngine.js).
 */
const productSchema = new Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'price cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    stock: {
      type: Number,
      required: true,
      min: [0, 'stock cannot be negative'],
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
