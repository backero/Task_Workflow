const TimeLog = require('../models/TimeLog');
const Task = require('../models/Task');
const { success, created, notFound, badRequest } = require('../utils/response');
const logger = require('../utils/logger');

const logTime = async (req, res) => {
  try {
    const { taskId, minutes, note, date } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: req.user.organizationId });
    if (!task) return notFound(res, 'Task not found');

    const entry = await TimeLog.create({
      taskId,
      projectId: task.projectId,
      organizationId: req.user.organizationId,
      userId: req.user._id,
      minutes,
      note,
      date: date ? new Date(date) : new Date(),
    });

    return created(res, { entry }, 'Time logged');
  } catch (err) {
    logger.error(`logTime: ${err.message}`);
    throw err;
  }
};

const getTaskTimeLogs = async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, organizationId: req.user.organizationId });
    if (!task) return notFound(res, 'Task not found');

    const logs = await TimeLog.find({ taskId: req.params.taskId })
      .populate('userId', 'name phone avatar')
      .sort({ date: -1 })
      .lean();

    const totalMinutes = logs.reduce((sum, l) => sum + l.minutes, 0);
    return success(res, { logs, totalMinutes });
  } catch (err) {
    logger.error(`getTaskTimeLogs: ${err.message}`);
    throw err;
  }
};

const getMyTimeLogs = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { organizationId: req.user.organizationId, userId: req.user._id };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to)   filter.date.$lte = new Date(to);
    }

    const logs = await TimeLog.find(filter)
      .populate('taskId', 'title status')
      .populate('projectId', 'title color')
      .sort({ date: -1 })
      .lean();

    const totalMinutes = logs.reduce((sum, l) => sum + l.minutes, 0);
    return success(res, { logs, totalMinutes });
  } catch (err) {
    logger.error(`getMyTimeLogs: ${err.message}`);
    throw err;
  }
};

const deleteTimeLog = async (req, res) => {
  try {
    const entry = await TimeLog.findOneAndDelete({ _id: req.params.id, userId: req.user._id, organizationId: req.user.organizationId });
    if (!entry) return notFound(res, 'Time log not found');
    return success(res, {}, 'Deleted');
  } catch (err) {
    logger.error(`deleteTimeLog: ${err.message}`);
    throw err;
  }
};

module.exports = { logTime, getTaskTimeLogs, getMyTimeLogs, deleteTimeLog };
