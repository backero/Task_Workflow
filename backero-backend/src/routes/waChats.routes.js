const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const WaChatMessage = require('../models/WaChatMessage');
const WaChatContact = require('../models/WaChatContact');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { ROLE_HIERARCHY } = require('../utils/constants');
const { sendError } = require('../utils/helpers');

// WhatsApp chat mirror. Bounce Guard receives Meta's WhatsApp webhooks (including the
// CRO's WhatsApp Business app chats via "coexistence"), normalises them and posts them
// here; managers and anyone with the whatsapp_chats:read permission read them.

const READ_PERMISSION = 'whatsapp_chats:read';
const STATUS_LOCKED = ['edited', 'deleted'];
const digits = (v) => String(v ?? '').replace(/\D/g, '');

const canReadChats = (user) =>
  (ROLE_HIERARCHY[user?.role] || 0) >= ROLE_HIERARCHY.manager || (user?.permissions || []).includes(READ_PERMISSION);

// ---- Machine-to-machine: Bounce Guard -> here ----
// Header x-bounce-guard-secret must equal BOUNCE_GUARD_SECRET; chats are filed under
// WA_CHATS_ORG_ID (the organisation that owns the WhatsApp numbers).
const authenticateBounceGuard = (req, res, next) => {
  const expected = process.env.BOUNCE_GUARD_SECRET || '';
  const orgId = process.env.WA_CHATS_ORG_ID || '';
  if (expected.length < 24 || !mongoose.isValidObjectId(orgId)) {
    return sendError(res, 'WhatsApp chat ingest is not configured.', 503);
  }
  const given = Buffer.from(String(req.headers['x-bounce-guard-secret'] || ''));
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return sendError(res, 'Invalid secret.', 401);
  }
  req.orgId = orgId;
  next();
};

// Body: { ops: [ { op: 'message' | 'status' | 'edit' | 'revoke' | 'contact', ... } ] }
router.post('/ingest', authenticateBounceGuard, async (req, res, next) => {
  try {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 1000) : [];
    const organizationId = req.orgId;
    let applied = 0;
    for (const o of ops) {
      if (o.op === 'message' && o.id && digits(o.business) && digits(o.contact)) {
        const r = await WaChatMessage.updateOne(
          { organizationId, waMessageId: String(o.id) },
          {
            $setOnInsert: {
              business: digits(o.business),
              contact: digits(o.contact),
              direction: o.direction === 'out' ? 'out' : 'in',
              type: String(o.type || 'text').slice(0, 40),
              body: String(o.body ?? '').slice(0, 10000),
              mediaId: o.mediaId ? String(o.mediaId) : undefined,
              sentAt: new Date((Number(o.ts) || Date.now() / 1000) * 1000),
              status: o.status ? String(o.status) : undefined,
              source: ['live', 'app', 'history'].includes(o.source) ? o.source : 'live',
            },
          },
          { upsert: true }
        );
        applied += r.upsertedCount;
      } else if (o.op === 'status' && o.id && o.status) {
        const r = await WaChatMessage.updateOne(
          { organizationId, waMessageId: String(o.id), status: { $nin: STATUS_LOCKED } },
          { $set: { status: String(o.status) } }
        );
        applied += r.modifiedCount;
      } else if (o.op === 'edit' && o.id) {
        const r = await WaChatMessage.updateOne(
          { organizationId, waMessageId: String(o.id) },
          { $set: { body: String(o.body ?? '').slice(0, 10000), status: 'edited' } }
        );
        applied += r.modifiedCount;
      } else if (o.op === 'revoke' && o.id) {
        const r = await WaChatMessage.updateOne(
          { organizationId, waMessageId: String(o.id) },
          { $set: { body: '[deleted]', status: 'deleted' } }
        );
        applied += r.modifiedCount;
      } else if (o.op === 'contact' && digits(o.business) && digits(o.contact) && o.name) {
        await WaChatContact.updateOne(
          { organizationId, business: digits(o.business), contact: digits(o.contact) },
          { $set: { name: String(o.name).slice(0, 120) } },
          { upsert: true }
        );
        applied++;
      }
    }
    res.json({ success: true, received: ops.length, applied });
  } catch (error) {
    next(error);
  }
});

// ---- Dashboard (logged-in users) ----
router.use(authenticate, orgIsolation, (req, res, next) =>
  canReadChats(req.user) ? next() : sendError(res, 'Access denied. WhatsApp chats permission required.', 403)
);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/wa-chats/threads?business=918903790400&q=priya
router.get('/threads', async (req, res, next) => {
  try {
    const organizationId = new mongoose.Types.ObjectId(req.orgId);
    const business = digits(req.query.business);
    const q = String(req.query.q || '').trim().slice(0, 60);

    const match = { organizationId };
    if (business) match.business = business;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const named = await WaChatContact.find({ organizationId, name: rx }).select('contact').lean();
      match.$or = [{ contact: rx }, { body: rx }, { contact: { $in: named.map((c) => c.contact) } }];
    }

    const threads = await WaChatMessage.aggregate([
      { $match: match },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: { business: '$business', contact: '$contact' },
          messages: { $sum: 1 },
          lastAt: { $first: '$sentAt' },
          lastBody: { $first: '$body' },
          lastDirection: { $first: '$direction' },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 300 },
      {
        $lookup: {
          from: WaChatContact.collection.name,
          let: { b: '$_id.business', c: '$_id.contact' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$organizationId', organizationId] },
              { $eq: ['$business', '$$b'] },
              { $eq: ['$contact', '$$c'] },
            ] } } },
            { $project: { name: 1 } },
          ],
          as: 'who',
        },
      },
      {
        $project: {
          _id: 0, business: '$_id.business', contact: '$_id.contact',
          name: { $first: '$who.name' }, messages: 1, lastAt: 1, lastBody: 1, lastDirection: 1,
        },
      },
    ]);

    const businesses = await WaChatMessage.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$business', messages: { $sum: 1 } } },
      { $sort: { messages: -1 } },
      { $project: { _id: 0, business: '$_id', messages: 1 } },
    ]);

    res.json({ success: true, businesses, threads });
  } catch (error) {
    next(error);
  }
});

// GET /api/wa-chats/threads/:business/:contact
router.get('/threads/:business/:contact', async (req, res, next) => {
  try {
    const business = digits(req.params.business);
    const contact = digits(req.params.contact);
    if (!business || !contact) return sendError(res, 'Invalid chat.', 400);
    const [messages, who] = await Promise.all([
      WaChatMessage.find({ organizationId: req.orgId, business, contact })
        .sort({ sentAt: 1, _id: 1 })
        .limit(2000)
        .select('waMessageId direction type body mediaId sentAt status source')
        .lean(),
      WaChatContact.findOne({ organizationId: req.orgId, business, contact }).select('name').lean(),
    ]);
    res.json({ success: true, business, contact, name: who?.name || null, messages });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
