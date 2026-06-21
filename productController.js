const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/products
 * Creates a catalog product. Not strictly required by the spec, but the
 * cart ingestion endpoint needs *something* to validate SKUs against, and
 * shipping a hardcoded product list would undercut the "design your own
 * schema" requirement. See utils/seed.js for a quick way to populate this.
 */
const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ data: product });
});

/**
 * GET /api/products
 * Lists active products, optionally filtered by category. Supports basic
 * pagination so the endpoint stays well-behaved as the catalog grows.
 */
const listProducts = asyncHandler(async (req, res) => {
  const { category, page = 1, limit = 20 } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = String(category).toLowerCase();

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Product.countDocuments(filter),
  ]);

  res.json({
    data: items,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

const getProductBySku = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    sku: req.params.sku.toUpperCase(),
    isActive: true,
  });

  if (!product) {
    return res.status(404).json({ error: 'Not Found', message: 'Product not found.' });
  }

  res.json({ data: product });
});

module.exports = { createProduct, listProducts, getProductBySku };
