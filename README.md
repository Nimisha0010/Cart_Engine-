# Cart_Engine-
Adaptive E-Commerce Cart Engine is a scalable and modular backend application designed to manage shopping cart operations in a multi-tenant e-commerce environment. Built using Node.js, Express.js, MongoDB, and Mongoose, the system enables seamless product management, cart handling, inventory tracking, and checkout processing .
# Adaptive E-Commerce Cart Engine

A scalable multi-tenant shopping cart service built with Node.js, Express, MongoDB, and Mongoose. The system supports product catalog management, cart operations, checkout workflows, stock validation, tenant isolation, and a configurable promotional pricing engine.

## Features

### Product Catalog
- Create products with SKU, category, price, and stock.
- List products with pagination and category filtering.
- Fetch products by SKU.

### Cart Management
- Auto-create carts for new users.
- Add, update, and remove cart items.
- Soft-delete and clear carts.
- Cart expiration (TTL-based lifecycle).

### Multi-Tenant Architecture
- User isolation through `x-user-id` header.
- Separate active carts for each user.
- Partial unique indexing prevents duplicate active carts.

### Checkout & Inventory
- Checkout preview without side effects.
- Stock validation before purchase.
- Transactional checkout with atomic stock updates.
- Inventory deduction after successful checkout.

### Promotional Campaign Engine
Two independent discount systems:

#### Value-Based Discounts
| Cart Value | Discount |
|------------|------------|
| ₹0 – ₹999 | 0% |
| ₹1,000 – ₹2,999 | 5% |
| ₹3,000 – ₹6,999 | 10% |
| ₹7,000 – ₹14,999 | 15% |
| ₹15,000+ | 20% |

#### Category Diversity Discounts
| Categories | Discount |
|------------|------------|
| 1 | 0% |
| 2 | 3% |
| 3 | 6% |
| 4 | 9% |
| 5+ | 12% |

Only the higher percentage discount is applied.

#### Loyalty Bundle Bonus
An additional ₹150 bonus is applied when:
- Cart subtotal ≥ ₹3,000
- Cart contains products from at least 3 categories

---

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- Joi Validation
- Helmet
- Morgan
- CORS

---

## Project Structure

```text
src/
├── config/
│   └── db.js
├── controllers/
│   ├── cartController.js
│   └── productController.js
├── middleware/
│   ├── tenant.js
│   ├── validate.js
│   ├── rateLimiter.js
│   └── errorHandler.js
├── models/
│   ├── User.js
│   ├── Product.js
│   └── Cart.js
├── routes/
│   ├── cartRoutes.js
│   └── productRoutes.js
├── utils/
│   ├── promotionEngine.js
│   ├── asyncHandler.js
│   └── seed.js
├── app.js
└── server.js
```

---

## Installation

### Clone Repository

```bash
git clone <repository-url>
cd cart-engine
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

Create a `.env` file using `.env.example`:

```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/cart-engine
NODE_ENV=development
CART_TTL_MINUTES=4320
```

### Start MongoDB

For transaction support:

```bash
mongod --replSet rs0
```

Initialize replica set once:

```bash
mongosh
rs.initiate()
```

### Run Application

```bash
npm run dev
```

or

```bash
npm start
```

Server runs at:

```text
http://localhost:4000
```

Health Check:

```http
GET /health
```

---

## Authentication Strategy

This project uses lightweight tenant resolution instead of a full authentication system.

All cart requests must include:

```http
x-user-id: demo-user-001
```

The middleware automatically:
1. Resolves the user.
2. Creates a user record if needed.
3. Attaches the internal user ID to the request.
4. Ensures tenant data isolation.

---

## API Endpoints

### Products

#### Create Product

```http
POST /api/products
```

Request:

```json
{
  "sku": "ELEC-001",
  "name": "Wireless Mouse",
  "category": "electronics",
  "price": 699,
  "currency": "INR",
  "stock": 150
}
```

#### List Products

```http
GET /api/products?page=1&limit=20&category=electronics
```

#### Get Product By SKU

```http
GET /api/products/ELEC-001
```

---

### Cart

#### Get Active Cart

```http
GET /api/cart
```

#### Add / Update Item

```http
POST /api/cart/items
```

Request:

```json
{
  "sku": "ELEC-001",
  "quantity": 2,
  "mode": "increment"
}
```

Modes:
- increment
- set

#### Remove Item

```http
DELETE /api/cart/items/:sku
```

#### Clear Cart

```http
DELETE /api/cart
```

#### Checkout Preview

```http
GET /api/cart/checkout
```

#### Confirm Checkout

```http
POST /api/cart/checkout/confirm
```

---

## Sample Checkout Response

```json
{
  "pricing": {
    "subtotal": 3100,
    "totalDiscount": 460,
    "total": 2640
  }
}
```

---

## Design Principles

### Separation of Concerns
- Routes handle URL mapping.
- Controllers orchestrate business logic.
- Models enforce schema rules.
- Middleware manages cross-cutting concerns.
- Utility functions remain pure and testable.

### Data Integrity
- Stock validation before checkout.
- Transactional inventory updates.
- Soft deletion for recoverability.
- Price snapshots stored in cart items.

### Scalability
- Pagination support.
- Indexed queries.
- Embedded cart items for efficient reads.
- Modular architecture.

---

## Future Improvements

- JWT Authentication
- Role-Based Access Control (RBAC)
- Redis Cart Caching
- Automated Unit & Integration Tests
- Order History Service
- Event-Driven Checkout Pipeline
- Analytics & Recommendation Engine

---

## License

MIT License

---

## Author

Adaptive E-Commerce Cart Engine – Assignment Project demonstrating scalable cart architecture, tenant isolation, inventory consistency, and promotional pricing logic.
