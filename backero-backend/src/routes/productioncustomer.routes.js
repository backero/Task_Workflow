const router = require('express').Router();
const ProductionCustomer = require('../models/ProductionCustomer');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

router.use(authenticate, orgIsolation);

// GET all / search production customers
router.get('/', asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = { organizationId: req.user.organizationId };
  if (search) {
    const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: esc, $options: 'i' };
  }
  const customers = await ProductionCustomer.find(filter).sort({ name: 1 }).limit(200);
  sendSuccess(res, { customers });
}));

// POST create a production customer (manager+)
router.post('/', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const { name, contact, leadId, defaultContainer, savedCrmSpec } = req.body;
  if (!name?.trim()) return sendError(res, 'Customer name is required.', 400);
  const customer = await ProductionCustomer.create({
    organizationId: req.user.organizationId,
    name: name.trim(), contact, leadId: leadId || undefined, defaultContainer,
    savedCrmSpec: savedCrmSpec || {},
    createdBy: req.user._id,
  });
  sendSuccess(res, { customer }, 'Customer saved', 201);
}));

// PATCH update a production customer's saved details / checklist (manager+)
router.patch('/:id', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const customer = await ProductionCustomer.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!customer) return sendError(res, 'Customer not found.', 404);
  const { name, contact, defaultContainer, savedCrmSpec } = req.body;
  if (name !== undefined) customer.name = name;
  if (contact !== undefined) customer.contact = contact;
  if (defaultContainer !== undefined) customer.defaultContainer = defaultContainer;
  if (savedCrmSpec !== undefined) customer.savedCrmSpec = { ...(customer.savedCrmSpec || {}), ...savedCrmSpec };
  await customer.save();
  sendSuccess(res, { customer }, 'Customer updated');
}));

module.exports = router;
