const Lead = require('../models/Lead');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

// GET /api/public/track/:token  — no auth required
exports.getOrderTracking = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const lead = await Lead.findOne({ trackingToken: token })
    .select('name company phone status isConverted convertedToTask followUps notes createdAt trackingToken')
    .populate('convertedToTask', 'title status completedAt dueDate priority progress activity createdAt');

  if (!lead) return sendError(res, 'Order not found. The link may be invalid or expired.', 404);

  const task = lead.convertedToTask;

  // Build client-visible timeline from follow-ups (only whatsapp type = client updates)
  const updates = (lead.followUps || [])
    .filter((fu) => fu.type === 'whatsapp' && fu.notes?.startsWith('Client update sent:'))
    .map((fu) => ({
      date: fu.scheduledAt || fu.createdAt,
      message: fu.notes.replace('Client update sent: "', '').replace(/"$/, ''),
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Determine overall stage label
  const taskStatus = task?.status || null;
  const leadStatus = lead.status;
  let stage = 'Order Confirmed';
  if (taskStatus === 'Completed') stage = 'Delivered';
  else if (['Ready to Dispatch', 'Dispatched'].includes(leadStatus)) stage = 'Ready';
  else if (taskStatus === 'In Progress') stage = 'In Production';
  else if (task) stage = 'Order Confirmed';

  sendSuccess(res, {
    order: {
      clientName: lead.name,
      company: lead.company || null,
      orderTitle: task?.title || `Order — ${lead.name}`,
      stage,
      taskStatus,
      dueDate: task?.dueDate || null,
      completedAt: task?.completedAt || null,
      progress: task?.progress || 0,
      isCompleted: taskStatus === 'Completed',
      createdAt: lead.createdAt,
      updates,
    },
  });
});
