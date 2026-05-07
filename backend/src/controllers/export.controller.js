const Task = require('../models/Task');
const logger = require('../utils/logger');

const exportTasks = async (req, res) => {
  try {
    const { projectId, status } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (projectId) filter.projectId = projectId;
    if (status)    filter.status    = status;

    const tasks = await Task.find(filter)
      .populate('assigneeId', 'name phone')
      .populate('projectId',  'title')
      .populate('labelIds',   'name')
      .sort({ createdAt: -1 })
      .lean();

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const headers = ['ID', 'Title', 'Status', 'Priority', 'Project', 'Assignee', 'Due Date', 'Tags', 'Labels', 'Est. Minutes', 'Created At'];
    const rows = tasks.map((t) => [
      t._id,
      t.title,
      t.status,
      t.priority,
      t.projectId?.title || '',
      t.assigneeId?.name || t.assigneeId?.phone || '',
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
      (t.tags || []).join('; '),
      (t.labelIds || []).map((l) => l.name).join('; '),
      t.estimatedMinutes || '',
      new Date(t.createdAt).toISOString().slice(0, 10),
    ].map(escape).join(','))

    const csv = [headers.join(','), ...rows].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"')
    res.send('﻿' + csv) // BOM for Excel UTF-8
  } catch (err) {
    logger.error(`exportTasks: ${err.message}`);
    throw err;
  }
};

module.exports = { exportTasks };
