/**
 * One-time fix: Batch Tracker stages 1 (Procurement) and 2 (Work Assignment) were
 * swapped so Work Assignment now comes before Procurement. Any ProductionOrder
 * currently sitting mid-flow at stage 1 or 2 has the old meaning baked into its
 * stage number — this flips 1<->2 so those orders keep showing the correct step
 * instead of silently relabeling under them. Stages 0 and 3-7 are unaffected.
 * Run: node migrate-batch-tracker-stage-swap.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ProductionOrder = require('./src/models/ProductionOrder');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const atStage1 = await ProductionOrder.updateMany({ stage: 1 }, { $set: { stage: -1 } });
  const atStage2 = await ProductionOrder.updateMany({ stage: 2 }, { $set: { stage: 1 } });
  const atStageTemp = await ProductionOrder.updateMany({ stage: -1 }, { $set: { stage: 2 } });

  console.log(`Old stage 1 (Procurement) -> stage 2 (Procurement): ${atStage1.modifiedCount} order(s)`);
  console.log(`Old stage 2 (Work Assignment) -> stage 1 (Work Assignment): ${atStage2.modifiedCount} order(s)`);
  console.log(`Finalized temp-swapped orders: ${atStageTemp.modifiedCount} order(s)`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
