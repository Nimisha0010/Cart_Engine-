require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const sampleProducts = [
  { sku: 'ELEC-001', name: 'Wireless Mouse', category: 'electronics', price: 699, stock: 150 },
  { sku: 'ELEC-002', name: 'USB-C Hub', category: 'electronics', price: 1499, stock: 80 },
  { sku: 'ELEC-003', name: 'Mechanical Keyboard', category: 'electronics', price: 3499, stock: 40 },
  { sku: 'BOOK-001', name: 'Clean Code', category: 'books', price: 899, stock: 60 },
  { sku: 'BOOK-002', name: 'Designing Data-Intensive Applications', category: 'books', price: 1299, stock: 35 },
  { sku: 'HOME-001', name: 'Ceramic Coffee Mug', category: 'home', price: 349, stock: 200 },
  { sku: 'HOME-002', name: 'Desk Lamp', category: 'home', price: 1199, stock: 70 },
  { sku: 'FIT-001', name: 'Yoga Mat', category: 'fitness', price: 999, stock: 90 },
  { sku: 'FIT-002', name: 'Resistance Band Set', category: 'fitness', price: 549, stock: 120 },
  { sku: 'GROC-001', name: 'Organic Almonds 500g', category: 'grocery', price: 449, stock: 300 },
];

async function seed() {
  await connectDB();

  for (const p of sampleProducts) {
    await Product.findOneAndUpdate({ sku: p.sku }, p, { upsert: true, new: true });
  }

  console.log(`[seed] upserted ${sampleProducts.length} products`);
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
