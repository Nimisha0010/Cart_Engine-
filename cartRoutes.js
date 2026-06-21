const express = require('express');
const router = express.Router();

const {
  getCart,
  addOrUpdateItem,
  removeItem,
  clearCart,
  previewCheckout,
  confirmCheckout,
} = require('../controllers/cartController');

const resolveTenant = require('../middleware/tenant');
const { validateBody, schemas } = require('../middleware/validate');

// Every cart route requires tenant resolution (x-user-id header).
router.use(resolveTenant);

// GET    /api/cart                       -> get (or lazily create) active cart
// POST   /api/cart/items                 -> add/update a line item
// DELETE /api/cart/items/:sku            -> remove a line item
// DELETE /api/cart                       -> soft-delete (clear) active cart
// GET    /api/cart/checkout              -> preview pricing (no side effects)
// POST   /api/cart/checkout/confirm      -> finalize checkout (decrements stock)
router.get('/', getCart);
router.post('/items', validateBody(schemas.addOrUpdateItem), addOrUpdateItem);
router.delete('/items/:sku', removeItem);
router.delete('/', clearCart);
router.get('/checkout', previewCheckout);
router.post('/checkout/confirm', confirmCheckout);

module.exports = router;
