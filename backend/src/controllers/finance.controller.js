const Transaction   = require('../models/Transaction');
const Invoice       = require('../models/Invoice');
const Organization  = require('../models/Organization');
const Product       = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { success, created, notFound, badRequest } = require('../utils/response');
const { log }         = require('../services/activityLog.service');
const { emitToOrg }   = require('../sockets/index');
const { generateInvoicePDF } = require('../services/pdf.service');
const logger = require('../utils/logger');

/* ─── Finance summary ───────────────────────────────────────────────────────── */

const getSummary = async (req, res) => {
  const orgId = req.user.organizationId;
  const { from, to } = req.query;
  try {
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);

    const match = { organizationId: orgId };
    if (from || to) match.date = dateFilter;

    const [stats, byCategory, recentTx] = await Promise.all([
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
      Transaction.find(match)
        .sort({ date: -1 })
        .limit(10)
        .populate('createdBy', 'name phone')
        .lean(),
    ]);

    const map = stats.reduce((a, s) => { a[s._id] = { total: s.total, count: s.count }; return a; }, {});
    const revenue  = map.INCOME?.total  || 0;
    const expenses = map.EXPENSE?.total || 0;

    const outstandingInvoices = await Invoice.countDocuments({
      organizationId: orgId,
      status: { $in: ['DRAFT', 'SENT'] },
    });

    return success(res, {
      revenue,
      expenses,
      profit: revenue - expenses,
      outstandingInvoices,
      byCategory,
      recentTransactions: recentTx,
    });
  } catch (err) {
    logger.error(`getSummary: ${err.message}`);
    throw err;
  }
};

/* ─── Monthly breakdown (for chart) ────────────────────────────────────────── */

const getMonthlyData = async (req, res) => {
  const orgId = req.user.organizationId;
  const months = Math.min(parseInt(req.query.months || '6'), 12);
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1); since.setHours(0, 0, 0, 0);

    const data = await Transaction.aggregate([
      { $match: { organizationId: orgId, date: { $gte: since } } },
      {
        $group: {
          _id: {
            year:  { $year: '$date' },
            month: { $month: '$date' },
            type:  '$type',
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(d.getMonth() + i);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1;
      const label = `${monthNames[d.getMonth()]} ${yr}`;

      const row = data.filter(r => r._id.year === yr && r._id.month === mo);
      const revenue  = row.find(r => r._id.type === 'INCOME')?.total  || 0;
      const expenses = row.find(r => r._id.type === 'EXPENSE')?.total || 0;
      result.push({ month: monthNames[d.getMonth()], label, revenue, expenses });
    }

    return success(res, { data: result });
  } catch (err) {
    logger.error(`getMonthlyData: ${err.message}`);
    throw err;
  }
};

/* ─── Transactions CRUD ─────────────────────────────────────────────────────── */

const listTransactions = async (req, res) => {
  const orgId = req.user.organizationId;
  const { type, category, from, to, page = 1, limit = 20 } = req.query;
  try {
    const filter = { organizationId: orgId };
    if (type)     filter.type     = type;
    if (category) filter.category = { $regex: `^${category}$`, $options: 'i' };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to)   filter.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('createdBy', 'name phone')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    return success(res, { transactions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error(`listTransactions: ${err.message}`);
    throw err;
  }
};

const createTransaction = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const tx = await Transaction.create({ ...req.body, organizationId: orgId, createdBy: req.user._id });
    await log({ userId: req.user._id, organizationId: orgId, action: 'TRANSACTION_CREATED', entity: 'Transaction', entityId: tx._id });
    emitToOrg(orgId.toString(), 'finance:transaction_created', { transaction: tx });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});
    return created(res, { transaction: tx }, 'Transaction recorded');
  } catch (err) {
    logger.error(`createTransaction: ${err.message}`);
    throw err;
  }
};

const updateTransaction = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, organizationId: orgId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!tx) return notFound(res, 'Transaction not found');
    await log({ userId: req.user._id, organizationId: orgId, action: 'TRANSACTION_UPDATED', entity: 'Transaction', entityId: tx._id });
    emitToOrg(orgId.toString(), 'finance:transaction_updated', { transaction: tx });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});
    return success(res, { transaction: tx }, 'Transaction updated');
  } catch (err) {
    logger.error(`updateTransaction: ${err.message}`);
    throw err;
  }
};

const deleteTransaction = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const tx = await Transaction.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
    if (!tx) return notFound(res, 'Transaction not found');
    await log({ userId: req.user._id, organizationId: orgId, action: 'TRANSACTION_DELETED', entity: 'Transaction', entityId: tx._id });
    emitToOrg(orgId.toString(), 'finance:transaction_deleted', { transactionId: req.params.id });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});
    return success(res, {}, 'Transaction deleted');
  } catch (err) {
    logger.error(`deleteTransaction: ${err.message}`);
    throw err;
  }
};

const getCategories = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const categories = await Transaction.distinct('category', { organizationId: orgId, category: { $ne: null } });
    return success(res, { categories: categories.filter(Boolean).sort() });
  } catch (err) {
    logger.error(`getFinanceCategories: ${err.message}`);
    throw err;
  }
};

/* ─── Invoices ──────────────────────────────────────────────────────────────── */

const calcTotals = (items) => {
  let subtotal = 0, taxAmount = 0;
  const computed = items.map(item => {
    const lineTotal  = Number(item.quantity) * Number(item.unitPrice);
    const lineTax    = lineTotal * (Number(item.taxRate || 0) / 100);
    subtotal  += lineTotal;
    taxAmount += lineTax;
    return { ...item, amount: lineTotal + lineTax };
  });
  return { items: computed, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
};

const nextInvoiceNumber = async (orgId) => {
  const count = await Invoice.countDocuments({ organizationId: orgId });
  const year  = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
};

const listInvoices = async (req, res) => {
  const orgId = req.user.organizationId;
  const { status, page = 1, limit = 20 } = req.query;
  try {
    const filter = { organizationId: orgId };
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Invoice.countDocuments(filter),
    ]);
    return success(res, { invoices, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error(`listInvoices: ${err.message}`);
    throw err;
  }
};

const getInvoice = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: orgId }).lean();
    if (!invoice) return notFound(res, 'Invoice not found');
    return success(res, { invoice });
  } catch (err) {
    logger.error(`getInvoice: ${err.message}`);
    throw err;
  }
};

const createInvoice = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const { items = [], ...rest } = req.body;
    const { items: computed, subtotal, taxAmount, totalAmount } = calcTotals(items);
    const invoiceNumber = await nextInvoiceNumber(orgId);

    const invoice = await Invoice.create({
      ...rest,
      items: computed,
      subtotal, taxAmount, totalAmount,
      invoiceNumber,
      organizationId: orgId,
      createdBy: req.user._id,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'INVOICE_CREATED', entity: 'Invoice', entityId: invoice._id });
    emitToOrg(orgId.toString(), 'finance:invoice_created', { invoice });

    return created(res, { invoice }, 'Invoice created');
  } catch (err) {
    logger.error(`createInvoice: ${err.message}`);
    throw err;
  }
};

const updateInvoice = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const existing = await Invoice.findOne({ _id: req.params.id, organizationId: orgId });
    if (!existing) return notFound(res, 'Invoice not found');
    if (existing.status === 'PAID') return badRequest(res, 'Cannot edit a paid invoice');

    const { items, ...rest } = req.body;
    let updates = { ...rest };
    if (items) {
      const { items: computed, subtotal, taxAmount, totalAmount } = calcTotals(items);
      Object.assign(updates, { items: computed, subtotal, taxAmount, totalAmount });
    }

    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    await log({ userId: req.user._id, organizationId: orgId, action: 'INVOICE_UPDATED', entity: 'Invoice', entityId: invoice._id });
    emitToOrg(orgId.toString(), 'finance:invoice_updated', { invoice });

    return success(res, { invoice }, 'Invoice updated');
  } catch (err) {
    logger.error(`updateInvoice: ${err.message}`);
    throw err;
  }
};

const deductInvoiceInventory = async (invoice, orgId, userId) => {
  for (const item of invoice.items) {
    if (!item.productId) continue;
    const qty = Number(item.quantity);
    if (qty <= 0) continue;
    const product = await Product.findOne({ _id: item.productId, organizationId: orgId });
    if (!product) continue;
    const before = product.quantity;
    const after  = Math.max(0, before - qty);
    await Product.findByIdAndUpdate(product._id, { $set: { quantity: after } });
    await StockMovement.create({
      productId: product._id, organizationId: orgId,
      type: 'SALE', quantity: qty,
      quantityBefore: before, quantityAfter: after,
      note: `Invoice ${invoice.invoiceNumber}`,
      reference: invoice.invoiceNumber, referenceId: invoice._id,
      performedBy: userId,
    });
  }
};

const updateInvoiceStatus = async (req, res) => {
  const orgId = req.user.organizationId;
  const { status } = req.body;
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: orgId });
    if (!invoice) return notFound(res, 'Invoice not found');

    const updates = { status };
    if (status === 'PAID') updates.paidDate = new Date();

    // Deduct inventory once when invoice is first sent (goods dispatched)
    if (status === 'SENT' && !invoice.inventoryDeducted) {
      await deductInvoiceInventory(invoice, orgId, req.user._id);
      updates.inventoryDeducted = true;
      emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    }

    const updated = await Invoice.findByIdAndUpdate(
      req.params.id, { $set: updates }, { new: true }
    );

    await log({ userId: req.user._id, organizationId: orgId, action: 'INVOICE_STATUS_CHANGED', entity: 'Invoice', entityId: updated._id, meta: { status } });
    emitToOrg(orgId.toString(), 'finance:invoice_updated', { invoice: updated });

    return success(res, { invoice: updated }, `Invoice marked as ${status}`);
  } catch (err) {
    logger.error(`updateInvoiceStatus: ${err.message}`);
    throw err;
  }
};

const deleteInvoice = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
    if (!invoice) return notFound(res, 'Invoice not found');
    await log({ userId: req.user._id, organizationId: orgId, action: 'INVOICE_DELETED', entity: 'Invoice', entityId: invoice._id });
    emitToOrg(orgId.toString(), 'finance:invoice_deleted', { invoiceId: req.params.id });
    return success(res, {}, 'Invoice deleted');
  } catch (err) {
    logger.error(`deleteInvoice: ${err.message}`);
    throw err;
  }
};

const downloadInvoicePDF = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const [invoice, org] = await Promise.all([
      Invoice.findOne({ _id: req.params.id, organizationId: orgId }).lean(),
      Organization.findById(orgId).lean(),
    ]);
    if (!invoice) return notFound(res, 'Invoice not found');
    generateInvoicePDF(invoice, org, res);
  } catch (err) {
    logger.error(`downloadInvoicePDF: ${err.message}`);
    throw err;
  }
};

module.exports = {
  getSummary, getMonthlyData,
  listTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories,
  listInvoices, getInvoice, createInvoice, updateInvoice, updateInvoiceStatus, deleteInvoice, downloadInvoicePDF,
};
