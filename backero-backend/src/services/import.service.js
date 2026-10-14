const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Product = require('../models/Product');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRAND = 'FF4F46E5';
const WHITE = 'FFFFFFFF';
const LIGHT = 'FFF0F0FF';
const GRAY = 'FF6B7280';

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND } } };
  });
}

function styleExample(sheet, rowNum) {
  const row = sheet.getRow(rowNum);
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.font = { color: { argb: GRAY }, italic: true, size: 9 };
    cell.alignment = { vertical: 'middle' };
  });
}

function addInstructionSheet(wb, rows) {
  const s = wb.addWorksheet('Instructions');
  s.columns = [
    { header: 'Column', key: 'col', width: 30 },
    { header: 'Required', key: 'req', width: 12 },
    { header: 'Allowed Values', key: 'vals', width: 55 },
    { header: 'Example', key: 'ex', width: 20 },
  ];
  styleHeader(s);
  rows.forEach((r) => s.addRow(r));
  s.getColumn(1).font = { bold: true };
}

// ─── Team Template ─────────────────────────────────────────────────────────────

async function buildTeamTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Backero';

  const s = wb.addWorksheet('Team Members');
  s.columns = [
    { header: 'First Name *', key: 'firstName', width: 18 },
    { header: 'Last Name *', key: 'lastName', width: 18 },
    { header: 'Phone * (10 digits)', key: 'phone', width: 22 },
    { header: 'Role', key: 'role', width: 20 },
    { header: 'Department', key: 'department', width: 28 },
    { header: 'Designation', key: 'designation', width: 24 },
  ];
  styleHeader(s);

  // Sample rows
  s.addRow(['Ravi', 'Kumar', '9876543210', 'member', 'Sales', 'Sales Executive']);
  s.addRow(['Priya', 'Sharma', '8765432109', 'manager', 'Marketing', 'Marketing Manager']);
  s.addRow(['Arjun', 'Singh', '7654321098', 'team_lead', 'Operations', 'Ops Lead']);
  styleExample(s, 2);
  styleExample(s, 3);
  styleExample(s, 4);

  s.getRow(1).height = 30;

  addInstructionSheet(wb, [
    ['First Name', 'YES', 'Any text', 'Ravi'],
    ['Last Name', 'YES', 'Any text', 'Kumar'],
    ['Phone', 'YES', '10-digit number only (no spaces, no +91)', '9876543210'],
    ['Role', 'No (default: member)', 'member | team_lead | manager | admin', 'member'],
    ['Department', 'No', 'Marketing | Marketplace | Sales | Production | R&D | Operations | Accounts & Finance', 'Sales'],
    ['Designation', 'No', 'Free text', 'Sales Executive'],
  ]);

  return wb;
}

// ─── Product Template ──────────────────────────────────────────────────────────

async function buildProductTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Backero';

  const s = wb.addWorksheet('Products');
  s.columns = [
    { header: 'Name *', key: 'name', width: 28 },
    { header: 'SKU *', key: 'sku', width: 16 },
    { header: 'Category *', key: 'category', width: 20 },
    { header: 'Unit *', key: 'unit', width: 10 },
    { header: 'Cost Price (₹)', key: 'costPrice', width: 16 },
    { header: 'Selling Price (₹)', key: 'sellingPrice', width: 18 },
    { header: 'MRP (₹)', key: 'mrp', width: 12 },
    { header: 'GST Rate (%)', key: 'gstRate', width: 14 },
    { header: 'HSN Code', key: 'hsnCode', width: 14 },
    { header: 'Current Stock', key: 'currentStock', width: 16 },
    { header: 'Min Stock Level', key: 'minStockLevel', width: 18 },
    { header: 'Reorder Point', key: 'reorderPoint', width: 16 },
    { header: 'Is Raw Material (yes/no)', key: 'isRawMaterial', width: 24 },
    { header: 'Is Finished Good (yes/no)', key: 'isFinishedGood', width: 25 },
    { header: 'Description', key: 'description', width: 30 },
  ];
  styleHeader(s);

  s.addRow(['Premium Widget A', 'WGT-001', 'Widgets', 'pcs', 150, 299, 349, 18, '8473', 100, 20, 30, 'no', 'yes', 'High quality widget']);
  s.addRow(['Raw Steel Sheet', 'RSS-001', 'Raw Materials', 'kg', 80, 0, 0, 5, '7208', 500, 100, 150, 'yes', 'no', 'Cold rolled steel']);
  styleExample(s, 2);
  styleExample(s, 3);

  addInstructionSheet(wb, [
    ['Name', 'YES', 'Any text', 'Premium Widget A'],
    ['SKU', 'YES', 'Unique alphanumeric code (auto-uppercased)', 'WGT-001'],
    ['Category', 'YES', 'Any text category name', 'Widgets'],
    ['Unit', 'YES', 'pcs | kg | g | litre | ml | box | pack | set | pair', 'pcs'],
    ['Cost Price', 'No', 'Number (without ₹ symbol)', '150'],
    ['Selling Price', 'No', 'Number', '299'],
    ['MRP', 'No', 'Number', '349'],
    ['GST Rate', 'No (default: 18)', '0 | 5 | 12 | 18 | 28', '18'],
    ['HSN Code', 'No', '4-8 digit HSN code', '8473'],
    ['Current Stock', 'No (default: 0)', 'Number', '100'],
    ['Min Stock Level', 'No (default: 0)', 'Number — triggers low stock alert', '20'],
    ['Reorder Point', 'No (default: 0)', 'Number', '30'],
    ['Is Raw Material', 'No (default: no)', 'yes | no', 'no'],
    ['Is Finished Good', 'No (default: yes)', 'yes | no', 'yes'],
    ['Description', 'No', 'Free text', 'Any description'],
  ]);

  return wb;
}

// ─── Parse Excel buffer ────────────────────────────────────────────────────────

async function parseExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  const rows = [];
  const headers = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell) => headers.push(String(cell.value || '').toLowerCase().trim()));
    } else {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row.getCell(i + 1).value; });
      rows.push({ _rowNum: rowNum, ...obj });
    }
  });
  return rows;
}

function norm(val) {
  return val === null || val === undefined ? '' : String(val).trim();
}

function toBool(val) {
  return ['yes', 'true', '1', 'y'].includes(String(val || '').toLowerCase().trim());
}

// ─── Import Teams ──────────────────────────────────────────────────────────────

async function importTeam(buffer, organizationId) {
  const rawRows = await parseExcel(buffer);
  const results = { imported: 0, skipped: 0, errors: [] };
  const VALID_ROLES = ['member', 'team_lead', 'manager', 'admin'];

  for (const row of rawRows) {
    const firstName = norm(row['first name *'] || row['first name'] || row['firstname']);
    const lastName = norm(row['last name *'] || row['last name'] || row['lastname']);
    const phone = norm(row['phone * (10 digits)'] || row['phone'] || row['mobile']).replace(/\D/g, '').slice(-10);
    const role = norm(row['role']).toLowerCase() || 'member';
    const department = norm(row['department']);
    const designation = norm(row['designation']);

    if (!firstName || !lastName) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: First Name and Last Name are required` });
      results.skipped++;
      continue;
    }
    if (!phone || phone.length !== 10) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Invalid phone number "${norm(row['phone * (10 digits)'] || row['phone'])}"` });
      results.skipped++;
      continue;
    }
    if (role && !VALID_ROLES.includes(role)) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Invalid role "${role}". Use: ${VALID_ROLES.join(', ')}` });
      results.skipped++;
      continue;
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Phone ${phone} already exists` });
      results.skipped++;
      continue;
    }

    const email = `${phone}@backero.internal`;
    const password = crypto.randomBytes(16).toString('hex');

    await User.create({
      organizationId,
      firstName, lastName, email, phone, password,
      role: VALID_ROLES.includes(role) ? role : 'member',
      department: department || undefined,
      designation: designation || undefined,
      isVerified: true,
      isActive: true,
    });
    results.imported++;
  }

  return results;
}

// ─── Import Products ───────────────────────────────────────────────────────────

async function importProducts(buffer, organizationId, createdBy) {
  const rawRows = await parseExcel(buffer);
  const results = { imported: 0, skipped: 0, errors: [] };
  const VALID_UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'set', 'pair'];

  for (const row of rawRows) {
    const name = norm(row['name *'] || row['name']);
    const sku = norm(row['sku *'] || row['sku']).toUpperCase();
    const category = norm(row['category *'] || row['category']);
    const unit = norm(row['unit *'] || row['unit']).toLowerCase() || 'pcs';

    if (!name) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Product Name is required` });
      results.skipped++; continue;
    }
    if (!sku) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: SKU is required` });
      results.skipped++; continue;
    }
    if (!category) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Category is required` });
      results.skipped++; continue;
    }
    if (!VALID_UNITS.includes(unit)) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: Invalid unit "${unit}". Use: ${VALID_UNITS.join(', ')}` });
      results.skipped++; continue;
    }

    const existingSku = await Product.findOne({ organizationId, sku });
    if (existingSku) {
      results.errors.push({ row: row._rowNum, message: `Row ${row._rowNum}: SKU "${sku}" already exists` });
      results.skipped++; continue;
    }

    const numOf = (key, fallback = 0) => {
      const keys = [key + ' *', key + ' (₹)', key + ' (%)', key];
      for (const k of keys) {
        for (const h of Object.keys(row)) {
          if (h.startsWith(key.toLowerCase())) {
            const v = parseFloat(row[h]);
            return isNaN(v) ? fallback : v;
          }
        }
      }
      return fallback;
    };

    await Product.create({
      organizationId,
      name, sku, category, unit,
      costPrice: numOf('cost price'),
      sellingPrice: numOf('selling price'),
      mrp: numOf('mrp'),
      gstRate: numOf('gst rate', 18),
      hsnCode: norm(row['hsn code'] || row['hsn']),
      currentStock: numOf('current stock'),
      minStockLevel: numOf('min stock level'),
      reorderPoint: numOf('reorder point'),
      isRawMaterial: toBool(row['is raw material (yes/no)'] || row['is raw material']),
      isFinishedGood: row['is finished good (yes/no)'] !== undefined
        ? toBool(row['is finished good (yes/no)'] || row['is finished good'])
        : true,
      description: norm(row['description']),
      createdBy,
      isActive: true,
    });
    results.imported++;
  }

  return results;
}

module.exports = { buildTeamTemplate, buildProductTemplate, importTeam, importProducts };
