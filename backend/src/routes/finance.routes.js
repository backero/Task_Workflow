const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const {
  getSummary, getMonthlyData,
  listTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories,
  listInvoices, getInvoice, createInvoice, updateInvoice, updateInvoiceStatus, deleteInvoice, downloadInvoicePDF,
} = require('../controllers/finance.controller');

router.use(authenticate);

// Summary & analytics — all org members
router.get('/summary',                     getSummary);
router.get('/monthly',                     getMonthlyData);
router.get('/categories',                  getCategories);

// Transactions — MANAGER+ write
router.get('/transactions',                listTransactions);
router.post('/transactions',               requireMinRole('MANAGER'), createTransaction);
router.patch('/transactions/:id',          requireMinRole('MANAGER'), updateTransaction);
router.delete('/transactions/:id',         requireMinRole('ADMIN'),   deleteTransaction);

// Invoices — MANAGER+ write
router.get('/invoices',                    listInvoices);
router.get('/invoices/:id',                getInvoice);
router.get('/invoices/:id/pdf',            downloadInvoicePDF);
router.post('/invoices',                   requireMinRole('MANAGER'), createInvoice);
router.patch('/invoices/:id',              requireMinRole('MANAGER'), updateInvoice);
router.patch('/invoices/:id/status',       requireMinRole('MANAGER'), updateInvoiceStatus);
router.delete('/invoices/:id',             requireMinRole('ADMIN'),   deleteInvoice);

module.exports = router;
