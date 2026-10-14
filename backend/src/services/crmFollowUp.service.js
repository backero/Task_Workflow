const FollowUpQueue = require('../models/FollowUpQueue');
const LeadActivity  = require('../models/LeadActivity');
const Lead          = require('../models/Lead');
const User          = require('../models/User');
const { sendCrmMessage } = require('./whatsapp.service');
const logger = require('../utils/logger');

const firstName = (name) => (name || 'there').split(' ')[0];

/* ── Follow-up message sequences per stage ─────────────────────────────────── */
const SEQUENCES = {
  New: [
    {
      tag: 'New_day0',
      daysAfter: 0,
      msg: (l) => `Hi ${firstName(l.name)} 👋\n\nThank you for your enquiry! We've received your details and will get back to you shortly.\n\nFeel free to reply with any questions.\n\n— Backero`,
    },
    {
      tag: 'New_day2',
      daysAfter: 2,
      msg: (l) => `Hi ${firstName(l.name)}, just following up on your enquiry 🙏\n\nWould you like to know more about our products or pricing? We'd love to help!\n\n— Backero`,
    },
    {
      tag: 'New_day5',
      daysAfter: 5,
      msg: (l) => `Hi ${firstName(l.name)} 😊\n\nWe have some exciting offers this week. Are you still looking?\n\nReply "YES" and we'll share the details right away!\n\n— Backero`,
    },
    {
      tag: 'New_day10',
      daysAfter: 10,
      msg: (l) => `Hi ${firstName(l.name)},\n\nThis is our last follow-up from our side 🙏 We'd love the opportunity to work with you.\n\nWhenever you're ready, we're just a message away!\n\n— Backero`,
    },
  ],
  Lost: [
    {
      tag: 'Lost_day30',
      daysAfter: 30,
      msg: (l) => `Hi ${firstName(l.name)} 👋\n\nHope you're doing well! We wanted to check back in — we have new products and special offers that might interest you.\n\nWould love to reconnect! 😊\n\n— Backero`,
    },
    {
      tag: 'Lost_day60',
      daysAfter: 60,
      msg: (l) => `Hi ${firstName(l.name)},\n\nIt's been a while! Any new requirements? We're always here to help with the best prices and quality 🙏\n\n— Backero`,
    },
    {
      tag: 'Lost_day90',
      daysAfter: 90,
      msg: (l) => `Hi ${firstName(l.name)} 😊\n\nJust a friendly check-in. Hope your business is thriving!\n\nIf you ever need us, we're just a message away.\n\n— Backero`,
    },
  ],
};

/* ── Schedule follow-up sequence for a lead ────────────────────────────────── */
const scheduleFollowUps = async (lead, stage, skipDay0 = false) => {
  const sequence = SEQUENCES[stage];
  if (!sequence) return;

  await cancelFollowUps(lead._id);

  const now = new Date();
  const docs = sequence
    .filter(s => !(skipDay0 && s.daysAfter === 0))
    .map(({ tag, daysAfter, msg }) => ({
      leadId:         lead._id,
      organizationId: lead.organizationId,
      phone:          lead.phone,
      leadName:       lead.name,
      message:        msg(lead),
      sendAt:         new Date(now.getTime() + daysAfter * 24 * 60 * 60 * 1000),
      sequenceTag:    tag,
      status:         'pending',
    }));

  if (docs.length) await FollowUpQueue.insertMany(docs);
};

/* ── Cancel all pending follow-ups for a lead ──────────────────────────────── */
const cancelFollowUps = async (leadId) => {
  await FollowUpQueue.updateMany({ leadId, status: 'pending' }, { $set: { status: 'cancelled' } });
};

/* ── Process due follow-ups (called by cron every 15 min) ──────────────────── */
const processPendingFollowUps = async () => {
  const now     = new Date();
  const pending = await FollowUpQueue.find({ status: 'pending', sendAt: { $lte: now } }).limit(30).lean();
  if (!pending.length) return;

  logger.info(`[FollowUp] Processing ${pending.length} pending messages`);

  for (const item of pending) {
    // Verify lead still exists and is not Won
    const lead = await Lead.findById(item.leadId).lean();
    if (!lead || lead.stage === 'Won') {
      await FollowUpQueue.findByIdAndUpdate(item._id, { status: 'cancelled' });
      continue;
    }

    try {
      await sendCrmMessage(item.phone, item.message);

      await FollowUpQueue.findByIdAndUpdate(item._id, { status: 'sent', attempt: item.attempt + 1 });
      await Lead.findByIdAndUpdate(item.leadId, { lastContactedAt: now });
      await LeadActivity.create({
        leadId:         item.leadId,
        organizationId: item.organizationId,
        type:           'followup_sent',
        description:    `Auto follow-up sent (${item.sequenceTag || 'sequence'})`,
        meta:           { message: item.message, sequenceTag: item.sequenceTag },
      });
    } catch (err) {
      const nextAttempt = item.attempt + 1;
      await FollowUpQueue.findByIdAndUpdate(item._id, {
        attempt: nextAttempt,
        status:  nextAttempt >= 3 ? 'failed' : 'pending',
        sendAt:  new Date(now.getTime() + 30 * 60 * 1000), // retry in 30 min
      });
      logger.error(`[FollowUp] Failed for lead ${item.leadId}: ${err.message}`);
    }

    // Rate limit: 3 seconds between messages
    await new Promise(r => setTimeout(r, 3000));
  }
};

/* ── Stale lead alerts (called by daily cron) ──────────────────────────────── */
const runStaleLeadAlerts = async () => {
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
  const activeStages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation'];

  const staleLeads = await Lead.find({
    stage: { $in: activeStages },
    $or: [
      { lastContactedAt: { $lt: cutoff } },
      { lastContactedAt: null, createdAt: { $lt: cutoff } },
    ],
  }).populate('assignedTo', 'name phone').lean();

  if (!staleLeads.length) return;
  logger.info(`[StaleAlert] Found ${staleLeads.length} stale leads`);

  // Group by assignee
  const byAssignee = {};
  for (const lead of staleLeads) {
    const key = lead.assignedTo?._id?.toString() || `org_${lead.organizationId}`;
    if (!byAssignee[key]) byAssignee[key] = { assignee: lead.assignedTo, orgId: lead.organizationId, leads: [] };
    byAssignee[key].leads.push(lead);
  }

  for (const { assignee, orgId, leads } of Object.values(byAssignee)) {
    let phone = assignee?.phone;
    if (!phone) {
      // Fallback to org admin
      const admin = await User.findOne({ organizationId: orgId, role: { $in: ['ADMIN', 'OWNER'] } }).select('phone').lean();
      phone = admin?.phone;
    }
    if (!phone) continue;

    const list = leads.slice(0, 5).map(l => `• ${l.name} (${l.stage})`).join('\n');
    const more = leads.length > 5 ? `\n...and ${leads.length - 5} more` : '';
    const msg = `Hi ${assignee?.name?.split(' ')[0] || 'there'} ⚠️\n\n*Stale Leads Alert*\nThe following leads haven't been contacted in 5+ days:\n\n${list}${more}\n\nPlease follow up soon!\n\n— Backero CRM`;

    await sendCrmMessage(phone, msg).catch(err =>
      logger.error(`[StaleAlert] Failed to notify: ${err.message}`)
    );
    await new Promise(r => setTimeout(r, 3000));
  }
};

module.exports = { scheduleFollowUps, cancelFollowUps, processPendingFollowUps, runStaleLeadAlerts };
