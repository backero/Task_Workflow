const Label = require('../models/Label');
const { success, created, notFound, badRequest } = require('../utils/response');
const logger = require('../utils/logger');

const getLabels = async (req, res) => {
  try {
    const labels = await Label.find({ organizationId: req.user.organizationId }).sort({ name: 1 }).lean();
    return success(res, { labels });
  } catch (err) {
    logger.error(`getLabels: ${err.message}`);
    throw err;
  }
};

const createLabel = async (req, res) => {
  try {
    const { name, color } = req.body;
    const label = await Label.create({
      name,
      color: color || '#6366f1',
      organizationId: req.user.organizationId,
      createdBy: req.user._id,
    });
    return created(res, { label }, 'Label created');
  } catch (err) {
    if (err.code === 11000) return badRequest(res, 'A label with this name already exists');
    logger.error(`createLabel: ${err.message}`);
    throw err;
  }
};

const updateLabel = async (req, res) => {
  try {
    const label = await Label.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!label) return notFound(res, 'Label not found');
    return success(res, { label }, 'Label updated');
  } catch (err) {
    if (err.code === 11000) return badRequest(res, 'A label with this name already exists');
    logger.error(`updateLabel: ${err.message}`);
    throw err;
  }
};

const deleteLabel = async (req, res) => {
  try {
    const label = await Label.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!label) return notFound(res, 'Label not found');
    return success(res, {}, 'Label deleted');
  } catch (err) {
    logger.error(`deleteLabel: ${err.message}`);
    throw err;
  }
};

module.exports = { getLabels, createLabel, updateLabel, deleteLabel };
