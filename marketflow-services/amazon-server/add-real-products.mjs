import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

const realProducts = [
  {
    sku: 'AMZN-WH-001',
    name: 'Wireless Headphones Pro',
    sellingPrice: 2999,
    productCost: 800,
    procurementCost: 150,
    packagingCost: 50,
    fulfillmentCost: 100,
    shippingCost: 80,
    platformFees: 300,
    returnsLoss: 50,
    quantity: 45,
    marketplace: 'amazon_in',
  },
  {
    sku: 'AMZN-PC-002',
    name: 'Premium Phone Case',
    sellingPrice: 499,
    productCost: 80,
    procurementCost: 20,
    packagingCost: 15,
    fulfillmentCost: 20,
    shippingCost: 30,
    platformFees: 50,
    returnsLoss: 10,
    quantity: 120,
    marketplace: 'amazon_in',
  },
  {
    sku: 'AMZN-UC-003',
    name: 'USB-C Fast Charging Cable',
    sellingPrice: 299,
    productCost: 50,
    procurementCost: 10,
    packagingCost: 8,
    fulfillmentCost: 15,
    shippingCost: 20,
    platformFees: 30,
    returnsLoss: 5,
    quantity: 200,
    marketplace: 'amazon_in',
  },
  {
    sku: 'AMZN-SM-004',
    name: 'Smartphone Screen Protector',
    sellingPrice: 199,
    productCost: 40,
    procurementCost: 8,
    packagingCost: 5,
    fulfillmentCost: 12,
    shippingCost: 15,
    platformFees: 20,
    returnsLoss: 3,
    quantity: 300,
    marketplace: 'amazon_in',
  },
  {
    sku: 'AMZN-PB-005',
    name: 'Portable Power Bank 20000mAh',
    sellingPrice: 1499,
    productCost: 450,
    procurementCost: 80,
    packagingCost: 30,
    fulfillmentCost: 60,
    shippingCost: 50,
    platformFees: 150,
    returnsLoss: 30,
    quantity: 65,
    marketplace: 'amazon_in',
  },
];

try {
  const db = new DatabaseSync(centralDbPath);

  console.log('📊 Creating products table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      name TEXT,
      sellingPrice REAL,
      productCost REAL,
      procurementCost REAL,
      packagingCost REAL,
      fulfillmentCost REAL,
      shippingCost REAL,
      platformFees REAL,
      returnsLoss REAL,
      quantity INTEGER,
      marketplace TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('📥 Adding real Amazon products...');

  for (const product of realProducts) {
    db.prepare(`
      INSERT OR REPLACE INTO products
      (sku, name, sellingPrice, productCost, procurementCost, packagingCost,
       fulfillmentCost, shippingCost, platformFees, returnsLoss, quantity, marketplace, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      product.sku,
      product.name,
      product.sellingPrice,
      product.productCost,
      product.procurementCost,
      product.packagingCost,
      product.fulfillmentCost,
      product.shippingCost,
      product.platformFees,
      product.returnsLoss,
      product.quantity,
      product.marketplace
    );

    console.log(`  ✅ ${product.sku}: ${product.name}`);
  }

  db.close();
  console.log('');
  console.log('✅ Real products added to database!');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
