/**
 * One-time fix: Lead.productLinks.basis and .priceStatus enums were rebuilt to match the
 * reference design (basis: "Customer's Formula"/House Formula/To Be Developed; priceStatus:
 * Not quoted/Quoted/Accepted). Existing rows still carry the old values ('Catalog SKU',
 * 'Client Provided', 'Pending', 'Rejected'), and Mongoose validates the WHOLE productLinks
 * array on any save — so leaving stale values in place silently 400s every future product
 * link/edit on that lead, not just ones touching the stale row.
 * Run: node migrate-product-link-vocab.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Lead = require('./src/models/Lead');

const BASIS_MAP = { 'Catalog SKU': 'House Formula', 'Client Provided': "Customer's Formula" };
const PRICE_STATUS_MAP = { Pending: 'Not quoted', Rejected: 'Not quoted' };

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const leads = await Lead.find({ 'productLinks.0': { $exists: true } });
  let leadsTouched = 0, rowsTouched = 0;

  for (const lead of leads) {
    let changed = false;
    for (const link of lead.productLinks) {
      if (BASIS_MAP[link.basis]) { link.basis = BASIS_MAP[link.basis]; changed = true; rowsTouched++; }
      if (PRICE_STATUS_MAP[link.priceStatus]) { link.priceStatus = PRICE_STATUS_MAP[link.priceStatus]; changed = true; }
    }
    if (changed) { await lead.save(); leadsTouched++; }
  }

  console.log(`Leads touched: ${leadsTouched}, product-link rows normalized: ${rowsTouched}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
