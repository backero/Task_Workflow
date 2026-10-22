require('dotenv').config();
const mongoose = require('mongoose');
const ProductionOrder = require('./src/models/ProductionOrder');
const Lead = require('./src/models/Lead');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const lead = await Lead.findOne({ name: 'bubu' });
  const count = await ProductionOrder.countDocuments({ organizationId: lead.organizationId });
  const order = await ProductionOrder.create({
    organizationId: lead.organizationId,
    orderNumber: `PO-TEST-${Date.now()}`,
    batch: `BATCH-TEST-${Date.now()}`,
    status: 'Planned',
    stage: 1,
    customer: lead.name,
    leadId: lead._id,
    processSteps: [],
  });
  console.log('Created test order:', order._id.toString(), 'linked to lead:', lead._id.toString());
  await mongoose.disconnect();
})();
