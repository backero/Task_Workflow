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

// Uploads a document buffer to Meta so it can be referenced (by media id) as a
// template's dynamic document header. Required before sending daily-report PDFs.
async function uploadMedia(buffer, filename, mimetype) {
  if (!isConfigured()) {
    logger.warn('[WhatsApp Cloud] Not configured — skipping media upload');
    return null;
  }
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mimetype }), filename);

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_ACCESS_TOKEN}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok || !json.id) {
      logger.error(`[WhatsApp Cloud] Media upload failed: ${JSON.stringify(json.error || json)}`);
      return null;
    }
    return json.id;
  } catch (err) {
    logger.error(`[WhatsApp Cloud] Media upload error: ${err.message}`);
    return null;
  }
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
  'Dispatched':        { emoji: '🚚', label: 'Dispatched',          detail: 'Your order is on its way to you!' },
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

// UTILITY templates "dispatch_photo_update" / "dispatch_video_update" — NOT YET SUBMITTED
// to Meta as of this writing (need an app ID for the example-media resumable-upload step,
// which isn't configured in this project). Calls will fail/no-op until a human submits
// and Meta approves them via the WhatsApp Manager dashboard — see the template text this
// function expects in the code comment below. Header: IMAGE or VIDEO, dynamic per send via
// an uploaded media_id (same upload mechanism as sendDailyReportPDF).
// Body: {{1}} name, {{2}} product, {{3}} tracking/carrier line, {{4}} note
async function sendDispatchedWithMedia(phone, { name, product, trackingLine, note, mediaId, mediaType }) {
  const templateName = mediaType === 'video' ? 'dispatch_video_update' : 'dispatch_photo_update';
  const headerFormat = mediaType === 'video' ? 'video' : 'image';
  return sendTemplate(phone, templateName, [
    {
      type: 'header',
      parameters: [{ type: headerFormat, [headerFormat]: { id: mediaId } }],
    },
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: product || 'your order' },
        { type: 'text', text: trackingLine || 'On its way to you' },
        { type: 'text', text: note || 'Thank you for choosing Backero!' },
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

// UTILITY template "backero_alert" — generic fallback used by notification.service.js
// for any createNotification({ channels: { whatsapp: true } }) call across the app
// (task status changes, approvals, workflow triggers, CRM assignments, low stock, etc.)
// {{1}} title, {{2}} message (truncated to keep template body within Meta's length limit)
// button: dynamic URL suffix {{1}} = actionUrl path (e.g. "/tasks/abc123")
async function sendGenericAlert(phone, { title, message, actionUrl }) {
  const truncated = (message || '').length > 300 ? `${message.slice(0, 297)}...` : (message || '');
  const urlSuffix = (actionUrl || '').replace(/^\/+/, ''); // template's button URL already ends in "/{{1}}"
  return sendTemplate(phone, 'backero_alert', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title || 'Backero Alert' },
        { type: 'text', text: truncated || 'Open the app for details.' },
      ],
    },
    {
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: urlSuffix || '' }],
    },
  ]);
}

// UTILITY template "daily_report_summary": {{1}} orgName, {{2}} date,
// {{3}} completed, {{4}} inProgress, {{5}} overdue, {{6}} pendingApproval,
// {{7}} newLeads, {{8}} leadsWon, {{9}} activeLeads,
// {{10}} income, {{11}} expense, {{12}} lowStock, {{13}} activeProductionOrders, {{14}} topPerformer
// Department/employee-activity breakdowns are unbounded-length lists, so they can't be
// safe template params — that detail lives in the attached PDF (sendDailyReportPDF) instead.
async function sendDailyReportSummary(phone, {
  orgName, date, tasksCompleted, tasksInProgress, tasksOverdue, tasksPendingApproval,
  newLeadsToday, leadsWonToday, activeLeads,
  incomeToday, expenseToday, lowStockCount, activeProductionOrders, topPerformerName,
}) {
  const fmt = (n) => (n || 0).toLocaleString('en-IN');
  return sendTemplate(phone, 'daily_report_summary', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: orgName || '—' },
        { type: 'text', text: date || '—' },
        { type: 'text', text: String(tasksCompleted ?? 0) },
        { type: 'text', text: String(tasksInProgress ?? 0) },
        { type: 'text', text: String(tasksOverdue ?? 0) },
        { type: 'text', text: String(tasksPendingApproval ?? 0) },
        { type: 'text', text: String(newLeadsToday ?? 0) },
        { type: 'text', text: String(leadsWonToday ?? 0) },
        { type: 'text', text: String(activeLeads ?? 0) },
        { type: 'text', text: fmt(incomeToday) },
        { type: 'text', text: fmt(expenseToday) },
        { type: 'text', text: String(lowStockCount ?? 0) },
        { type: 'text', text: String(activeProductionOrders ?? 0) },
        { type: 'text', text: topPerformerName || '—' },
      ],
    },
  ]);
}

// UTILITY template "daily_report_marketplace": {{1}} date, {{2}} totalSales, {{3}} adSpend,
// {{4}} adRevenue, {{5}} ctr, {{6}} cvr, {{7}} returns, {{8}} per-platform plan progress.
// {{8}} is one pre-formatted line (platforms joined by " · ") — Meta template parameters
// can't contain newlines, so the per-platform breakdown must stay single-line, unlike the PDF.
async function sendDailyReportMarketplace(phone, {
  date, totalSales, adSpend, adRevenue, ctr, cvr, returns, platformSummaryLine,
}) {
  const fmt = (n) => (n || 0).toLocaleString('en-IN');
  return sendTemplate(phone, 'daily_report_marketplace', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: date || '—' },
        { type: 'text', text: fmt(totalSales) },
        { type: 'text', text: fmt(adSpend) },
        { type: 'text', text: fmt(adRevenue) },
        { type: 'text', text: (ctr || 0).toFixed(1) },
        { type: 'text', text: (cvr || 0).toFixed(1) },
        { type: 'text', text: fmt(returns) },
        { type: 'text', text: platformSummaryLine || 'No active marketplace plans.' },
      ],
    },
  ]);
}

// UTILITY template "daily_report_pdf" — HEADER: dynamic document, BODY: {{1}} date.
// Uploads the PDF to Meta first (required for a per-send document header), then sends.
async function sendDailyReportPDF(phone, pdfBuffer, fileName, date) {
  if (!pdfBuffer) return false;
  const mediaId = await uploadMedia(pdfBuffer, fileName || 'daily-report.pdf', 'application/pdf');
  if (!mediaId) return false;
  return sendTemplate(phone, 'daily_report_pdf', [
    {
      type: 'header',
      parameters: [{ type: 'document', document: { id: mediaId, filename: fileName || 'daily-report.pdf' } }],
    },
    {
      type: 'body',
      parameters: [{ type: 'text', text: date || '—' }],
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
  sendGenericAlert,
  sendDailyReportSummary,
  sendDailyReportMarketplace,
  sendDailyReportPDF,
  sendDispatchedWithMedia,
  uploadMedia,
};
