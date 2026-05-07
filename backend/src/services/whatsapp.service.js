const axios  = require('axios');
const logger = require('../utils/logger');
const { WHATSAPP_PROVIDER, WATI_API_URL, WATI_ACCESS_TOKEN } = require('../config/env');

const sendViaConsole = (phone, message) => {
  logger.info(`[WA:CONSOLE] → ${phone}: ${message}`);
  return { success: true };
};

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

// High-level helpers used by controllers
const sendTaskAssigned = async (phone, assigneeName, taskTitle, projectName, dueDate) => {
  const message = `Hi ${assigneeName || 'there'}, you have a new task: "${taskTitle}" in project "${projectName}".${dueDate ? ` Due: ${new Date(dueDate).toLocaleDateString('en-IN')}.` : ''} — Backero`;
  if (WHATSAPP_PROVIDER === 'wati') {
    return sendViaWati(phone, 'task_assigned', [
      { name: 'assignee_name', value: assigneeName || 'there' },
      { name: 'task_title',    value: taskTitle },
      { name: 'project_name', value: projectName },
      { name: 'due_date',     value: dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'Not set' },
    ]);
  }
  return sendViaConsole(phone, message);
};

const sendTaskStatusUpdate = async (phone, recipientName, taskTitle, status) => {
  const message = `Hi ${recipientName || 'there'}, the task "${taskTitle}" has been moved to ${status.replace('_', ' ')}. — Backero`;
  if (WHATSAPP_PROVIDER === 'wati') {
    return sendViaWati(phone, 'task_status_update', [
      { name: 'recipient_name', value: recipientName || 'there' },
      { name: 'task_title',     value: taskTitle },
      { name: 'status',         value: status.replace('_', ' ') },
    ]);
  }
  return sendViaConsole(phone, message);
};

const sendInvoiceSent = async (phone, customerName, invoiceNumber, amount) => {
  const message = `Dear ${customerName}, Invoice ${invoiceNumber} for ₹${amount.toLocaleString('en-IN')} has been sent to you. — Backero`;
  if (WHATSAPP_PROVIDER === 'wati') {
    return sendViaWati(phone, 'invoice_sent', [
      { name: 'customer_name',    value: customerName },
      { name: 'invoice_number',   value: invoiceNumber },
      { name: 'amount',           value: `₹${amount.toLocaleString('en-IN')}` },
    ]);
  }
  return sendViaConsole(phone, message);
};

module.exports = { sendTaskAssigned, sendTaskStatusUpdate, sendInvoiceSent };
