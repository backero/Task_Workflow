/**
 * WhatsApp notification service
 *
 * Provider options (set WHATSAPP_PROVIDER in .env):
 *
 *   local   — FREE. Uses whatsapp-web.js (your own WhatsApp number via QR scan).
 *             Scan once, session is saved. Real messages, zero cost.
 *
 *   wati    — PAID. Uses WATI Business API (requires account + templates).
 *
 *   console — DEV fallback. Just logs to terminal, no messages sent.
 */

const axios  = require('axios');
const logger = require('../utils/logger');
const { WHATSAPP_PROVIDER, WATI_API_URL, WATI_ACCESS_TOKEN } = require('../config/env');

/* ─── Transport: local (whatsapp-web.js) ───────────────────────────────────── */

let waClient = null;

const getLocalClient = () => {
  if (WHATSAPP_PROVIDER !== 'local') return null;
  if (!waClient) waClient = require('./wa-client');
  return waClient;
};

const sendViaLocal = async (phone, message) => {
  const client = getLocalClient();
  if (!client) return { success: false, error: 'local client not loaded' };
  return client.send(phone, message);
};

/* ─── Transport: WATI ───────────────────────────────────────────────────────── */

const sendViaWati = async (phone, templateName, params = []) => {
  const number = phone.replace('+', '').replace(/\s/g, '');
  try {
    const { data } = await axios.post(
      `${WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${number}`,
      { template_name: templateName, broadcast_name: templateName, parameters: params },
      { headers: { Authorization: `Bearer ${WATI_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    logger.info(`[WA:WATI] Sent "${templateName}" to ${phone}`);
    return { success: true, data };
  } catch (err) {
    logger.error(`[WA:WATI] Failed to send to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/* ─── Transport: console (dev) ─────────────────────────────────────────────── */

const sendViaConsole = (phone, message) => {
  logger.info(`[WA:CONSOLE] → ${phone}: ${message}`);
  return { success: true };
};

/* ─── Dispatcher ────────────────────────────────────────────────────────────── */

/**
 * dispatch(phone, templateName, templateParams, plainTextMessage)
 *
 * - local  → sends plainTextMessage directly (no template needed)
 * - wati   → sends via WATI template
 * - console → logs plainTextMessage
 */
const dispatch = (phone, templateName, params, message) => {
  if (!phone) return Promise.resolve({ success: false, error: 'no_phone' });

  if (WHATSAPP_PROVIDER === 'local')   return sendViaLocal(phone, message);
  if (WHATSAPP_PROVIDER === 'wati')    return sendViaWati(phone, templateName, params);
  return Promise.resolve(sendViaConsole(phone, message));
};

/* ─── Task notifications ────────────────────────────────────────────────────── */

const sendTaskAssigned = (phone, assigneeName, taskTitle, projectName, dueDate) => {
  const name    = assigneeName || 'there';
  const project = projectName  || 'your project';
  const due     = dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'Not set';
  return dispatch(
    phone,
    'task_assigned',
    [
      { name: 'assignee_name', value: name    },
      { name: 'task_title',    value: taskTitle },
      { name: 'project_name', value: project  },
      { name: 'due_date',     value: due       },
    ],
    `Hi ${name} 👋\n\nYou have a new task assigned:\n📋 *${taskTitle}*\n📁 Project: ${project}\n📅 Due: ${due}\n\n— Backero`
  );
};

const sendTaskStatusUpdate = (phone, recipientName, taskTitle, status) => {
  const name  = recipientName || 'there';
  const label = status.replace(/_/g, ' ');
  return dispatch(
    phone,
    'task_status_update',
    [
      { name: 'recipient_name', value: name   },
      { name: 'task_title',     value: taskTitle },
      { name: 'status',         value: label  },
    ],
    `Hi ${name},\n\nTask update 🔄\n📋 *${taskTitle}*\nStatus changed to: *${label}*\n\n— Backero`
  );
};

const sendTaskOverdue = (phone, assigneeName, taskTitle, dueDate) => {
  const name = assigneeName || 'there';
  const due  = dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'N/A';
  return dispatch(
    phone,
    'task_overdue',
    [
      { name: 'assignee_name', value: name     },
      { name: 'task_title',    value: taskTitle },
      { name: 'due_date',      value: due       },
    ],
    `Hi ${name} ⚠️\n\nOverdue task reminder:\n📋 *${taskTitle}*\n📅 Was due: ${due}\n\nPlease update the status ASAP.\n\n— Backero`
  );
};

/* ─── Finance / Invoice notifications ──────────────────────────────────────── */

const sendInvoiceSent = (phone, customerName, invoiceNumber, amount) => {
  const name = customerName || 'Customer';
  const amt  = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  return dispatch(
    phone,
    'invoice_sent',
    [
      { name: 'customer_name',  value: name          },
      { name: 'invoice_number', value: invoiceNumber  },
      { name: 'amount',         value: amt            },
    ],
    `Dear ${name},\n\nInvoice sent 🧾\n📄 Invoice No: *${invoiceNumber}*\n💰 Amount: *${amt}*\n\nPlease review and make payment at your earliest convenience.\n\n— Backero`
  );
};

const sendInvoicePaid = (phone, customerName, invoiceNumber, amount) => {
  const name = customerName || 'Customer';
  const amt  = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  return dispatch(
    phone,
    'invoice_paid',
    [
      { name: 'customer_name',  value: name         },
      { name: 'invoice_number', value: invoiceNumber },
      { name: 'amount',         value: amt           },
    ],
    `Dear ${name},\n\nPayment confirmed ✅\n📄 Invoice No: *${invoiceNumber}*\n💰 Amount: *${amt}*\n\nThank you for your payment!\n\n— Backero`
  );
};

const sendInvoiceOverdue = (phone, customerName, invoiceNumber, amount, dueDate) => {
  const name = customerName || 'Customer';
  const amt  = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  const due  = dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'N/A';
  return dispatch(
    phone,
    'invoice_overdue',
    [
      { name: 'customer_name',  value: name         },
      { name: 'invoice_number', value: invoiceNumber },
      { name: 'amount',         value: amt           },
      { name: 'due_date',       value: due           },
    ],
    `Dear ${name},\n\nPayment reminder ⏰\n📄 Invoice No: *${invoiceNumber}*\n💰 Amount due: *${amt}*\n📅 Due date: ${due}\n\nKindly clear the payment to avoid any interruption.\n\n— Backero`
  );
};

/* ─── Inventory notifications ───────────────────────────────────────────────── */

const sendLowStockAlert = (phone, managerName, productName, currentStock, threshold) => {
  const name = managerName || 'Manager';
  return dispatch(
    phone,
    'low_stock_alert',
    [
      { name: 'manager_name',  value: name              },
      { name: 'product_name',  value: productName       },
      { name: 'current_stock', value: String(currentStock) },
      { name: 'threshold',     value: String(threshold)    },
    ],
    `Hi ${name},\n\n🔴 *Low Stock Alert*\n📦 Product: *${productName}*\n📉 Current stock: ${currentStock}\n⚠️ Minimum threshold: ${threshold}\n\nPlease reorder soon.\n\n— Backero`
  );
};

const sendStockReceived = (phone, managerName, productName, quantity, newTotal) => {
  const name = managerName || 'Manager';
  return dispatch(
    phone,
    'stock_received',
    [
      { name: 'manager_name', value: name              },
      { name: 'product_name', value: productName       },
      { name: 'quantity',     value: String(quantity)  },
      { name: 'new_total',    value: String(newTotal)  },
    ],
    `Hi ${name},\n\n✅ *Stock Received*\n📦 Product: *${productName}*\n➕ Added: ${quantity} units\n📊 New total: ${newTotal} units\n\n— Backero`
  );
};

/* ─── Production notifications ──────────────────────────────────────────────── */

const sendProductionStarted = (phone, managerName, orderName, orderNumber) => {
  const name = managerName || 'Manager';
  return dispatch(
    phone,
    'production_started',
    [
      { name: 'manager_name',  value: name        },
      { name: 'order_name',    value: orderName   },
      { name: 'order_number',  value: orderNumber },
    ],
    `Hi ${name},\n\n🏭 *Production Started*\n📋 Order: *${orderName}*\n🔢 Order No: ${orderNumber}\n\nRaw materials have been deducted from inventory.\n\n— Backero`
  );
};

const sendProductionCompleted = (phone, managerName, orderName, orderNumber, quantity, unit) => {
  const name = managerName || 'Manager';
  return dispatch(
    phone,
    'production_completed',
    [
      { name: 'manager_name',  value: name                  },
      { name: 'order_name',    value: orderName             },
      { name: 'order_number',  value: orderNumber           },
      { name: 'quantity',      value: `${quantity} ${unit}` },
    ],
    `Hi ${name},\n\n✅ *Production Completed*\n📋 Order: *${orderName}*\n🔢 Order No: ${orderNumber}\n📦 Output: *${quantity} ${unit}* added to inventory\n\n— Backero`
  );
};

/* ─── Employee / HR notifications ───────────────────────────────────────────── */

const sendWelcomeEmployee = (phone, employeeName, orgName, role) => {
  const name = employeeName || 'there';
  return dispatch(
    phone,
    'employee_welcome',
    [
      { name: 'employee_name', value: name    },
      { name: 'org_name',      value: orgName },
      { name: 'role',          value: role    },
    ],
    `Welcome to *${orgName}*, ${name}! 🎉\n\nYour account has been created.\n👤 Role: *${role}*\n\nLog in to the Backero app to get started.\n\n— Team ${orgName}`
  );
};

module.exports = {
  sendTaskAssigned,
  sendTaskStatusUpdate,
  sendTaskOverdue,
  sendInvoiceSent,
  sendInvoicePaid,
  sendInvoiceOverdue,
  sendLowStockAlert,
  sendStockReceived,
  sendProductionStarted,
  sendProductionCompleted,
  sendWelcomeEmployee,
};
