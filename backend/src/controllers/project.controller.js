const Project = require('../models/Project');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { success, created, notFound, badRequest } = require('../utils/response');
const { emitToOrg, emitToProject } = require('../sockets/index');
const { log } = require('../services/activityLog.service');
const logger = require('../utils/logger');

const createProject = async (req, res) => {
  try {
    const project = await Project.create({
      ...req.body,
      organizationId: req.user.organizationId,
      createdBy: req.user._id,
      members: [req.user._id],
    });

    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'PROJECT_CREATED', entity: 'Project', entityId: project._id });
    emitToOrg(req.user.organizationId.toString(), 'project:created', { project });

    return created(res, { project }, 'Project created');
  } catch (err) {
    logger.error(`createProject: ${err.message}`);
    throw err;
  }
};

const getProjects = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (status) filter.status = status;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('createdBy', 'name phone')
        .lean(),
      Project.countDocuments(filter),
    ]);

    return success(res, { projects, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error(`getProjects: ${err.message}`);
    throw err;
  }
};

const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
      .populate('createdBy', 'name phone')
      .populate('members', 'name phone avatar')
      .lean();
    if (!project) return notFound(res, 'Project not found');

    const taskStats = await Task.aggregate([
      { $match: { projectId: project._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const stats = taskStats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

    return success(res, { project, stats });
  } catch (err) {
    logger.error(`getProject: ${err.message}`);
    throw err;
  }
};

const updateProject = async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!project) return notFound(res, 'Project not found');
    emitToProject(req.params.id, 'project:updated', { project });
    return success(res, { project }, 'Project updated');
  } catch (err) {
    logger.error(`updateProject: ${err.message}`);
    throw err;
  }
};

const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!project) return notFound(res, 'Project not found');
    // Cascade delete tasks
    await Task.deleteMany({ projectId: req.params.id });
    emitToOrg(req.user.organizationId.toString(), 'project:deleted', { projectId: req.params.id });
    return success(res, {}, 'Project deleted');
  } catch (err) {
    logger.error(`deleteProject: ${err.message}`);
    throw err;
  }
};

module.exports = { createProject, getProjects, getProject, updateProject, deleteProject };
