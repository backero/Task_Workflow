const Task = require('../models/Task');
const Project = require('../models/Project');
const { success, badRequest } = require('../utils/response');
const logger = require('../utils/logger');

const search = async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return badRequest(res, 'Search query must be at least 2 characters');

  const orgId = req.user.organizationId;
  const regex = new RegExp(q.trim(), 'i');

  try {
    const [tasks, projects] = await Promise.all([
      Task.find({
        organizationId: orgId,
        $or: [{ title: regex }, { description: regex }, { tags: regex }],
      })
        .limit(10)
        .select('title description status priority dueDate projectId assigneeId')
        .populate('assigneeId', 'name phone')
        .populate('projectId', 'title color')
        .lean(),

      Project.find({
        organizationId: orgId,
        $or: [{ title: regex }, { description: regex }],
      })
        .limit(5)
        .select('title description color status taskCount')
        .lean(),
    ]);

    return success(res, {
      tasks,
      projects,
      total: tasks.length + projects.length,
      query: q.trim(),
    });
  } catch (err) {
    logger.error(`search: ${err.message}`);
    throw err;
  }
};

module.exports = { search };
