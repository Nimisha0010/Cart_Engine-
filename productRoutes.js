const express = require('express');
const router = express.Router();

const { createProduct, listProducts, getProductBySku } = require('../controllers/productController');
const { validateBody, schemas } = require('../middleware/validate');

// POST   /api/products            -> create a catalog product
// GET    /api/products            -> list products (filter by ?category=)
// GET    /api/products/:sku       -> fetch one product by SKU
router.post('/', validateBody(schemas.createProduct), createProduct);
router.get('/', listProducts);
router.get('/:sku', getProductBySku);

module.exports = router;
