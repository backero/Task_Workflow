const logger = require('../utils/logger');

const GRAPH_VERSION = 'v20.0';
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://task-workflow-liart.vercel.app';
const PRIORITY_EMOJI = { critical: '🔴', urgent: '🟠', high: '🟡', medium: '🔵', low: '⚪' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';

function isConfigured() {
  return !!(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
}

function toWhatsAppId(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

// Generic Meta-approved template sender. `components` follows the Cloud API
// message payload shape (body/button parameters) — see callers below for examples.
async function sendTemplate(phone, templateName, components) {
  if (!isConfigured()) {
    logger.warn(`[WhatsApp Cloud] Not configured — skipping ${templateName} send`);
    return false;
  }
  const to = toWhatsAppId(phone);
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: 'en' }, components },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      logger.error(`[WhatsApp Cloud] ${templateName} send failed for +${to}: ${JSON.stringify(json.error || json)}`);
      return false;
    }
    logger.info(`[WhatsApp Cloud] ✅ ${templateName} sent to +${to} (message id: ${json.messages?.[0]?.id})`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp Cloud] ${templateName} send error for +${to}: ${err.message}`);
    return false;
  }
}

// Sends the approved AUTHENTICATION template (body {{1}} + Copy Code button {{1}}).
async function sendOTP(phone, otp) {
  const templateName = process.env.WHATSAPP_CLOUD_OTP_TEMPLATE || 'temp1';
  return sendTemplate(phone, templateName, [
    { type: 'body', parameters: [{ type: 'text', text: String(otp) }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(otp) }] },
  ]);
}

// Sends the approved UTILITY template "task_assigned":
// body {{1}} title, {{2}} assignedByName, {{3}} priority (emoji+label), {{4}} department, {{5}} due date
// button: dynamic URL suffix {{1}} = taskId
async function sendTaskAssigned(phone, { title, assignedByName, priority, department, dueDate, taskId }) {
  const priorityText = `${PRIORITY_EMOJI[priority] || '🔵'} Priority: ${(priority || 'medium').toUpperCase()}`;
  return sendTemplate(phone, 'task_assigned', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title || 'Untitled task' },
        { type: 'text', text: assignedByName || '—' },
        { type: 'text', text: priorityText },
        { type: 'text', text: department || '—' },
        { type: 'text', text: fmtDate(dueDate) },
      ],
    },
    {
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: taskId ? String(taskId) : '' }],
    },
  ]);
}

// UTILITY template "task_overdue_employee": {{1}} title, {{2}} was-due date, {{3}} assignedByName
// button: dynamic URL suffix {{1}} = taskId
async function sendTaskOverdueEmployee(phone, { title, assignedByName, dueDate, taskId }) {
  return sendTemplate(phone, 'task_overdue_employee', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title || 'Untitled task' },
        { type: 'text', text: fmtDate(dueDate) },
        { type: 'text', text: assignedByName || '—' },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: taskId ? String(taskId) : '' }] },
  ]);
}

// UTILITY template "task_overdue_manager": {{1}} title, {{2}} employeeName, {{3}} department, {{4}} priority text, {{5}} was-due date
// button: dynamic URL suffix {{1}} = taskId
async function sendTaskOverdueManager(phone, { title, employeeName, department, priority, dueDate, taskId }) {
  const priorityText = `${PRIORITY_EMOJI[priority] || '🔵'} Priority: ${(priority || 'medium').toUpperCase()}`;
  return sendTemplate(phone, 'task_overdue_manager', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title || 'Untitled task' },
        { type: 'text', text: employeeName || '—' },
        { type: 'text', text: department || '—' },
        { type: 'text', text: priorityText },
        { type: 'text', text: fmtDate(dueDate) },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: taskId ? String(taskId) : '' }] },
  ]);
}

// UTILITY template "lead_in_progress_update": {{1}} name, {{2}} latest update text
async function sendInProgressLeadUpdate(phone, { name, lastUpdate }) {
  return sendTemplate(phone, 'lead_in_progress_update', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: lastUpdate ? `Latest update: ${lastUpdate}` : "We'll share updates as they happen." },
      ],
    },
  ]);
}

const STAGE_INFO = {
  'Sample':            { emoji: '🔬', label: 'Sample Preparation',  detail: 'Your sample is currently being prepared by our team.' },
  'In Progress':       { emoji: '⚙️', label: 'In Progress',         detail: 'Your order is actively in progress with our team.' },
  'Ready to Dispatch': { emoji: '📦', label: 'Ready to Dispatch',   detail: 'Great news! Your order is ready and will be dispatched shortly.' },
  'Payment Pending':   { emoji: '💳', label: 'Payment Pending',     detail: "Your order is ready. We're awaiting payment confirmation to proceed with dispatch." },
};

// UTILITY template "client_stage_update": {{1}} name, {{2}} emoji+status label, {{3}} detail, {{4}} latest update text
async function sendActiveClientStageUpdate(phone, { name, stage, lastUpdate }) {
  const info = STAGE_INFO[stage] || { emoji: '📋', label: stage, detail: 'Your order is being processed.' };
  return sendTemplate(phone, 'client_stage_update', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: `${info.emoji} Order Status: ${info.label}` },
        { type: 'text', text: info.detail },
        { type: 'text', text: lastUpdate ? `Latest update: ${lastUpdate}` : "We'll notify you of any further updates." },
      ],
    },
  ]);
}

// UTILITY template "sample_dispatched": {{1}} name, {{2}} product, {{3}} quantity, {{4}} courier, {{5}} dispatched date
async function sendSampleDispatchedToClient(phone, { name, product, quantity, courier, sentDate }) {
  const dateStr = sentDate ? new Date(sentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'today';
  return sendTemplate(phone, 'sample_dispatched', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: product || '—' },
        { type: 'text', text: quantity ? String(quantity) : '—' },
        { type: 'text', text: courier || '—' },
        { type: 'text', text: dateStr },
      ],
    },
  ]);
}

// UTILITY template "dispatch_feedback_request": {{1}} name, {{2}} product
async function sendDispatchedFeedbackRequest(phone, { name, product }) {
  return sendTemplate(phone, 'dispatch_feedback_request', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: product || 'your order' },
      ],
    },
  ]);
}

// UTILITY template "followup_overdue_rep_alert": {{1}} daysOverdue, {{2}} leadName, {{3}} leadPhone
async function sendOverdueFollowUpRepAlert(phone, { leadName, leadPhone, daysOverdue }) {
  return sendTemplate(phone, 'followup_overdue_rep_alert', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(daysOverdue ?? '—') },
        { type: 'text', text: leadName || '—' },
        { type: 'text', text: leadPhone || '—' },
      ],
    },
  ]);
}

// UTILITY template "stale_lead_manager_alert": {{1}} reminderCount, {{2}} leadName, {{3}} repName, {{4}} daysStale
async function sendStaleLeadManagerAlert(phone, { leadName, repName, daysStale, reminderCount }) {
  return sendTemplate(phone, 'stale_lead_manager_alert', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(reminderCount ?? '—') },
        { type: 'text', text: leadName || '—' },
        { type: 'text', text: repName || '—' },
        { type: 'text', text: String(daysStale ?? '—') },
      ],
    },
  ]);
}

// UTILITY template "tasks_due_today_summary": {{1}} department, {{2}} task count. Static "View My Tasks" button.
async function sendTasksDueTodaySummary(phone, { department, count }) {
  return sendTemplate(phone, 'tasks_due_today_summary', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: department || '—' },
        { type: 'text', text: String(count ?? 0) },
      ],
    },
  ]);
}

// UTILITY template "new_lead_alert_dm": {{1}} name, {{2}} phone, {{3}} company, {{4}} priority label, {{5}} createdByName
async function sendNewLeadAlertDM(phone, { name, phone: leadPhone, company, priority, createdByName }) {
  const PRIORITY_LABEL = { critical: '🔴 CRITICAL', high: '🟡 HIGH', medium: '🔵 MEDIUM', low: '⚪ LOW' };
  return sendTemplate(phone, 'new_lead_alert_dm', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || '—' },
        { type: 'text', text: leadPhone || '—' },
        { type: 'text', text: company || '—' },
        { type: 'text', text: PRIORITY_LABEL[priority] || priority || '—' },
        { type: 'text', text: createdByName || '—' },
      ],
    },
  ]);
}

// UTILITY template "team_task_overdue_alert": {{1}} department, {{2}} title, {{3}} employeeName, {{4}} priority text, {{5}} was-due date
async function sendTeamTaskOverdueAlert(phone, { department, title, employeeName, priority, dueDate }) {
  const priorityText = `${PRIORITY_EMOJI[priority] || '🔵'} Priority: ${(priority || 'medium').toUpperCase()}`;
  return sendTemplate(phone, 'team_task_overdue_alert', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: department || '—' },
        { type: 'text', text: title || 'Untitled task' },
        { type: 'text', text: employeeName || '—' },
        { type: 'text', text: priorityText },
        { type: 'text', text: fmtDate(dueDate) },
      ],
    },
  ]);
}

module.exports = {
  isConfigured,
  sendOTP,
  sendTaskAssigned,
  sendTaskOverdueEmployee,
  sendTaskOverdueManager,
  sendInProgressLeadUpdate,
  sendActiveClientStageUpdate,
  sendSampleDispatchedToClient,
  sendDispatchedFeedbackRequest,
  sendOverdueFollowUpRepAlert,
  sendStaleLeadManagerAlert,
  sendTasksDueTodaySummary,
  sendNewLeadAlertDM,
  sendTeamTaskOverdueAlert,
};
