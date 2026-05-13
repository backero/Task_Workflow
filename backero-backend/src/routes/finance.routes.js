const router = require('express').Router();
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse, generateInvoiceNumber } = require('../utils/helpers');
const { SOCKET_EVENTS } = require('../utils/constants');

router.use(authenticate, orgIsolation);

// Transactions
router.get('/transactions', asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, type, category, dateFrom, dateTo } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(filter).populate('createdBy', 'firstName lastName').sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
    Transaction.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(transactions, total, page, limit));
}));

router.post('/transactions', asyncHandler(async (req, res) => {
  const tx = await Transaction.create({ ...req.body, organizationId: req.user.organizationId, createdBy: req.user._id });
  sendSuccess(res, { transaction: tx }, 'Transaction recorded', 201);
}));

// Finance summary
router.get('/summary', asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;
  const orgId = req.user.organizationId;
  const now = new Date();
  let startDate;
  if (period === 'today') { startDate = new Date(now.setHours(0, 0, 0, 0)); }
  else if (period === 'week') { startDate = new Date(Date.now() - 7 * 86400000); }
  else if (period === 'month') { startDate = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (period === 'year') { startDate = new Date(now.getFullYear(), 0, 1); }

  const [income, expense, categoryBreakdown] = await Promise.all([
    Transaction.aggregate([
      { $match: { organizationId: orgId, type: 'income', date: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { organizationId: orgId, type: 'expense', date: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { organizationId: orgId, date: { $gte: startDate } } },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
    ]),
  ]);

  const totalIncome = income[0]?.total || 0;
  const totalExpense = expense[0]?.total || 0;
  sendSuccess(res, { summary: { totalIncome, totalExpense, netProfit: totalIncome - totalExpense, categoryBreakdown } });
}));

// Invoices
router.get('/invoices', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Invoice.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(invoices, total, page, limit));
}));

router.post('/invoices', asyncHandler(async (req, res) => {
  const invoiceNumber = generateInvoiceNumber();
  const { lineItems = [], ...rest } = req.body;

  let subtotal = 0, totalGst = 0, totalDiscount = 0;
  const processedItems = lineItems.map((item) => {
    const itemTotal = item.quantity * item.unitPrice - (item.discount || 0);
    const gstAmt = (itemTotal * (item.gstRate || 18)) / 100;
    subtotal += itemTotal;
    totalGst += gstAmt;
    totalDiscount += item.discount || 0;
    return { ...item, gstAmount: gstAmt, total: itemTotal + gstAmt };
  });

  const totalAmount = subtotal + totalGst;

  const invoice = await Invoice.create({
    ...rest,
    lineItems: processedItems,
    subtotal,
    totalGst,
    totalDiscount,
    totalAmount,
    balanceAmount: totalAmount,
    invoiceNumber,
    organizationId: req.user.organizationId,
    createdBy: req.user._id,
  });

  sendSuccess(res, { invoice }, 'Invoice created', 201);
}));

router.get('/invoices/:id', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!invoice) return sendError(res, 'Invoice not found.', 404);
  sendSuccess(res, { invoice });
}));

router.put('/invoices/:id', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!invoice) return sendError(res, 'Invoice not found.', 404);
  if (invoice.status === 'paid') return sendError(res, 'Cannot edit a paid invoice.', 400);

  const { lineItems = [], ...rest } = req.body;
  let subtotal = 0, totalGst = 0, totalDiscount = 0;

  const processedItems = lineItems.map((item) => {
    const itemSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0);
    const gstAmt = (itemSubtotal * (Number(item.gstRate) || 0)) / 100;
    subtotal += itemSubtotal;
    totalGst += gstAmt;
    totalDiscount += Number(item.discount) || 0;
    return { ...item, gstAmount: gstAmt, total: itemSubtotal + gstAmt };
  });

  const totalAmount = subtotal + totalGst;
  Object.assign(invoice, {
    ...rest,
    lineItems: processedItems,
    subtotal,
    totalGst,
    totalDiscount,
    totalAmount,
    balanceAmount: totalAmount - (invoice.paidAmount || 0),
    updatedBy: req.user._id,
  });

  await invoice.save();
  sendSuccess(res, { invoice }, 'Invoice updated');
}));

router.delete('/invoices/:id', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!invoice) return sendError(res, 'Invoice not found.', 404);
  if (invoice.status === 'paid') return sendError(res, 'Cannot delete a paid invoice.', 400);
  await invoice.deleteOne();
  sendSuccess(res, {}, 'Invoice deleted');
}));

router.patch('/invoices/:id/payment', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { amount, method, reference, notes } = req.body;
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!invoice) return sendError(res, 'Invoice not found.', 404);

  invoice.paymentHistory.push({ amount, method, date: new Date(), reference, notes });
  invoice.paidAmount += amount;
  invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;
  invoice.status = invoice.balanceAmount <= 0 ? 'paid' : 'partially_paid';
  if (invoice.status === 'paid') invoice.paidDate = new Date();
  await invoice.save();

  // Record transaction
  await Transaction.create({
    organizationId: req.user.organizationId,
    type: 'income',
    category: 'Invoice Payment',
    amount,
    description: `Payment for Invoice ${invoice.invoiceNumber}`,
    paymentMethod: method,
    reference,
    invoiceId: invoice._id,
    date: new Date(),
    createdBy: req.user._id,
  });

  if (invoice.status === 'paid') {
    io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.INVOICE_PAID, { invoiceId: invoice._id, amount: invoice.totalAmount });
  }

  sendSuccess(res, { invoice }, 'Payment recorded');
}));

module.exports = router;
