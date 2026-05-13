const ExcelJS    = require('exceljs');
const User        = require('../models/User');
const Product     = require('../models/Product');
const Transaction = require('../models/Transaction');
const { success } = require('../utils/response');
const logger      = require('../utils/logger');

// ─── CSV row parser ───────────────────────────────────────────────────────────
const parseCSV = (buffer) => {
  const text  = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const cells = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] || '').replace(/^"|"$/g, '').trim();
    });
    return row;
  });
  return { headers, rows };
};

// ─── Excel parser ─────────────────────────────────────────────────────────────
const parseExcel = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const headers = [];
  sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || '').trim()));
  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      obj[h] = cell.value == null ? '' : String(cell.value).trim();
    });
    if (Object.values(obj).some(v => v !== '')) rows.push(obj);
  });
  return { headers, rows };
};

const parseFile = async (file) => {
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (ext === 'csv') return parseCSV(file.buffer);
  return parseExcel(file.buffer);
};

// ─── Normalise header names ───────────────────────────────────────────────────
const norm = (headers, candidates) =>
  headers.find(h => candidates.some(c => h.toLowerCase().includes(c.toLowerCase()))) || null;

// ─── Import Employees ─────────────────────────────────────────────────────────
const importEmployees = async (req, res) => {
  const orgId = req.user.organizationId;
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const { headers, rows } = await parseFile(req.file);

    const col = {
      name:        norm(headers, ['name', 'full name', 'employee name']),
      phone:       norm(headers, ['phone', 'mobile', 'contact']),
      email:       norm(headers, ['email', 'mail']),
      department:  norm(headers, ['department', 'dept']),
      designation: norm(headers, ['designation', 'title', 'position']),
      role:        norm(headers, ['role']),
    };

    const VALID_ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'];
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const phone = col.phone ? row[col.phone]?.replace(/\s/g, '') : null;
      if (!phone) { results.skipped++; continue; }
      const fullPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;

      try {
        const role = VALID_ROLES.includes(row[col.role]?.toUpperCase()) ? row[col.role].toUpperCase() : 'EMPLOYEE';
        const update = {
          organizationId: orgId,
          isActive: true,
          ...(col.name        && row[col.name]        && { name:        row[col.name] }),
          ...(col.email       && row[col.email]       && { email:       row[col.email] }),
          ...(col.department  && row[col.department]  && { department:  row[col.department] }),
          ...(col.designation && row[col.designation] && { designation: row[col.designation] }),
          role,
        };
        const existing = await User.findOne({ phone: fullPhone });
        if (existing) {
          if (existing.organizationId && existing.organizationId.toString() !== orgId.toString()) {
            results.errors.push(`${fullPhone}: already belongs to another org`);
            continue;
          }
          await User.findByIdAndUpdate(existing._id, { $set: update });
          results.updated++;
        } else {
          await User.create({ phone: fullPhone, ...update });
          results.created++;
        }
      } catch (err) {
        results.errors.push(`${phone}: ${err.message}`);
      }
    }

    return success(res, { results, total: rows.length }, 'Employee import complete');
  } catch (err) {
    logger.error(`importEmployees: ${err.message}`);
    throw err;
  }
};

// ─── Import Inventory ─────────────────────────────────────────────────────────
const importInventory = async (req, res) => {
  const orgId = req.user.organizationId;
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const { headers, rows } = await parseFile(req.file);

    const col = {
      name:         norm(headers, ['name', 'product name', 'item']),
      sku:          norm(headers, ['sku', 'code', 'item code']),
      category:     norm(headers, ['category', 'type']),
      quantity:     norm(headers, ['quantity', 'qty', 'stock']),
      unitPrice:    norm(headers, ['unit price', 'price', 'cost', 'unitprice']),
      minThreshold: norm(headers, ['min', 'threshold', 'min stock', 'minstockthreshold', 'reorder']),
      supplier:     norm(headers, ['supplier', 'vendor']),
      description:  norm(headers, ['description', 'desc', 'notes']),
    };

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const name = col.name ? row[col.name] : null;
      const sku  = col.sku  ? row[col.sku]?.toUpperCase()  : null;
      if (!name || !sku) { results.skipped++; continue; }

      try {
        const data = {
          name,
          sku,
          organizationId: orgId,
          ...(col.category     && row[col.category]     && { category:           row[col.category] }),
          ...(col.quantity     && row[col.quantity]     && { quantity:            Math.max(0, parseInt(row[col.quantity]) || 0) }),
          ...(col.unitPrice    && row[col.unitPrice]    && { unitPrice:           parseFloat(row[col.unitPrice]) || 0 }),
          ...(col.minThreshold && row[col.minThreshold] && { minStockThreshold:   parseInt(row[col.minThreshold]) || 0 }),
          ...(col.supplier     && row[col.supplier]     && { supplier:            row[col.supplier] }),
          ...(col.description  && row[col.description]  && { description:         row[col.description] }),
        };
        const existing = await Product.findOne({ sku, organizationId: orgId });
        if (existing) {
          await Product.findByIdAndUpdate(existing._id, { $set: data });
          results.updated++;
        } else {
          await Product.create({ ...data, createdBy: req.user._id });
          results.created++;
        }
      } catch (err) {
        results.errors.push(`${sku}: ${err.message}`);
      }
    }

    return success(res, { results, total: rows.length }, 'Inventory import complete');
  } catch (err) {
    logger.error(`importInventory: ${err.message}`);
    throw err;
  }
};

// ─── Import Transactions ──────────────────────────────────────────────────────
const importTransactions = async (req, res) => {
  const orgId = req.user.organizationId;
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const { headers, rows } = await parseFile(req.file);

    const col = {
      date:        norm(headers, ['date']),
      description: norm(headers, ['description', 'desc', 'narration', 'particulars']),
      type:        norm(headers, ['type', 'transaction type']),
      amount:      norm(headers, ['amount', 'value']),
      category:    norm(headers, ['category']),
      method:      norm(headers, ['payment method', 'method', 'mode']),
      reference:   norm(headers, ['reference', 'ref', 'ref no']),
    };

    const VALID_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER'];
    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const amount = col.amount ? parseFloat(row[col.amount]) : 0;
      const type   = col.type   ? row[col.type]?.toUpperCase() : null;
      const desc   = col.description ? row[col.description] : null;
      if (!amount || !['INCOME', 'EXPENSE'].includes(type) || !desc) { results.skipped++; continue; }

      try {
        const method = VALID_METHODS.includes(row[col.method]?.toUpperCase().replace(' ', '_'))
          ? row[col.method].toUpperCase().replace(' ', '_') : 'CASH';
        await Transaction.create({
          organizationId: orgId,
          type,
          amount,
          description: desc,
          date: col.date && row[col.date] ? new Date(row[col.date]) : new Date(),
          category:      col.category  && row[col.category]  ? row[col.category]  : null,
          paymentMethod: method,
          reference:     col.reference && row[col.reference] ? row[col.reference] : null,
          createdBy: req.user._id,
        });
        results.created++;
      } catch (err) {
        results.errors.push(`Row: ${err.message}`);
      }
    }

    return success(res, { results, total: rows.length }, 'Transaction import complete');
  } catch (err) {
    logger.error(`importTransactions: ${err.message}`);
    throw err;
  }
};

// ─── Template download ────────────────────────────────────────────────────────
const downloadTemplate = async (req, res) => {
  const { type } = req.params;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Backero';

  const BRAND = '4F46E5';
  const hFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  const hFont = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
  const styleRow = (row) => { row.height = 20; row.eachCell(c => { c.fill = hFill; c.font = hFont; c.alignment = { vertical: 'middle', horizontal: 'center' }; }); };

  if (type === 'employees') {
    const sheet = wb.addWorksheet('Employees');
    sheet.columns = [
      { header: 'Name',        key: 'name',        width: 25 },
      { header: 'Phone',       key: 'phone',        width: 18 },
      { header: 'Email',       key: 'email',        width: 28 },
      { header: 'Department',  key: 'department',   width: 20 },
      { header: 'Designation', key: 'designation',  width: 22 },
      { header: 'Role',        key: 'role',         width: 14 },
    ];
    styleRow(sheet.getRow(1));
    sheet.addRow({ name: 'John Doe', phone: '+919876543210', email: 'john@example.com', department: 'Sales', designation: 'Executive', role: 'EMPLOYEE' });
  } else if (type === 'inventory') {
    const sheet = wb.addWorksheet('Inventory');
    sheet.columns = [
      { header: 'Name',              key: 'name',         width: 30 },
      { header: 'SKU',               key: 'sku',          width: 18 },
      { header: 'Category',          key: 'category',     width: 18 },
      { header: 'Quantity',          key: 'quantity',     width: 12 },
      { header: 'Unit Price',        key: 'unitPrice',    width: 14 },
      { header: 'Min Stock Threshold', key: 'minThreshold', width: 20 },
      { header: 'Supplier',          key: 'supplier',     width: 22 },
      { header: 'Description',       key: 'description',  width: 30 },
    ];
    styleRow(sheet.getRow(1));
    sheet.addRow({ name: 'Sample Product', sku: 'PROD-001', category: 'Electronics', quantity: 100, unitPrice: 499, minThreshold: 10, supplier: 'ABC Pvt Ltd', description: '' });
  } else if (type === 'transactions') {
    const sheet = wb.addWorksheet('Transactions');
    sheet.columns = [
      { header: 'Date',           key: 'date',        width: 15 },
      { header: 'Description',    key: 'description', width: 35 },
      { header: 'Type',           key: 'type',        width: 12 },
      { header: 'Amount',         key: 'amount',      width: 14 },
      { header: 'Category',       key: 'category',    width: 20 },
      { header: 'Payment Method', key: 'method',      width: 18 },
      { header: 'Reference',      key: 'reference',   width: 20 },
    ];
    styleRow(sheet.getRow(1));
    sheet.addRow({ date: new Date().toLocaleDateString('en-IN'), description: 'Sample Income', type: 'INCOME', amount: 10000, category: 'Sales', method: 'UPI', reference: 'REF001' });
  } else {
    return res.status(400).json({ success: false, message: 'Invalid template type' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-import-template.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};

module.exports = { importEmployees, importInventory, importTransactions, downloadTemplate };
