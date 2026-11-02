const express = require('express');
const router = express.Router();
const Remainder = require('../models/Remainder');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

// Get all reminders for organization (admin only)
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;

    // Only admins can view reminders
    if (!['admin', 'super_admin', 'founder', 'chairman'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const query = { organizationId: req.orgId };
    if (status) query.status = status;

    const reminders = await Remainder.find(query)
      .sort({ dueDate: 1, priority: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name email')
      .populate('completedBy', 'name email')
      .lean();

    const total = await Remainder.countDocuments(query);

    res.status(200).json({ success: true, reminders, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reminders', error: error.message });
  }
});

// Create a new remainder
router.post('/', async (req, res) => {
  try {
    const { title, description, type, dueDate, priority, notes } = req.body;

    // Only admins can create reminders
    if (!['admin', 'super_admin', 'founder', 'chairman'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!title || !dueDate) {
      return res.status(400).json({ success: false, message: 'Title and dueDate are required' });
    }

    const remainder = new Remainder({
      organizationId: req.orgId,
      createdBy: req.user._id,
      title,
      description,
      type: type || 'Custom',
      dueDate: new Date(dueDate),
      priority: priority || 'Medium',
      notes
    });

    const saved = await remainder.save();
    console.log('Remainder created:', saved._id);

    // Send immediate WhatsApp notification to the creator
    const { sendMessage } = require('../services/whatsapp.service');
    const creatorPhone = req.user.whatsapp || req.user.phone;
    if (creatorPhone) {
      const daysUntil = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      const message = `✅ *Reminder Created*\n\n📋 *${title}*\nType: ${type || 'Custom'}\nPriority: ${priority || 'Medium'}\nDue: ${new Date(dueDate).toLocaleDateString('en-IN')}\n⏳ ${daysUntil} days remaining`;
      sendMessage(creatorPhone, message).catch(err => console.error('Failed to send WhatsApp:', err.message));
    }

    res.status(201).json({ success: true, remainder: saved, message: 'Remainder created' });
  } catch (error) {
    console.error('Error creating remainder:', error);
    res.status(500).json({ success: false, message: 'Failed to create remainder', error: error.message });
  }
});

// Update remainder
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, dueDate, priority, notes, status, completedAt } = req.body;

    // Only admins can update reminders
    if (!['admin', 'super_admin', 'founder', 'chairman'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'Done') {
        updateData.completedAt = new Date();
        updateData.completedBy = req.user._id;
      }
    }

    const remainder = await Remainder.findByIdAndUpdate(id, updateData, { new: true })
      .populate('createdBy', 'name email')
      .populate('completedBy', 'name email');

    if (!remainder) {
      return res.status(404).json({ success: false, message: 'Remainder not found' });
    }

    res.status(200).json({ success: true, remainder, message: 'Remainder updated' });
  } catch (error) {
    console.error('Error updating remainder:', error);
    res.status(500).json({ success: false, message: 'Failed to update remainder', error: error.message });
  }
});

// Delete remainder
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Only admins can delete reminders
    if (!['admin', 'super_admin', 'founder', 'chairman'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const remainder = await Remainder.findByIdAndDelete(id);

    if (!remainder) {
      return res.status(404).json({ success: false, message: 'Remainder not found' });
    }

    res.status(200).json({ success: true, message: 'Remainder deleted' });
  } catch (error) {
    console.error('Error deleting remainder:', error);
    res.status(500).json({ success: false, message: 'Failed to delete remainder', error: error.message });
  }
});

module.exports = router;
