const User = require('../models/User');
const { processImageUpload } = require('../middleware/upload.middleware');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = await processImageUpload(req.file, 'backero/avatars');
    await User.findByIdAndUpdate(req.user._id, { avatar: url });
    return success(res, { url }, 'Avatar updated');
  } catch (err) {
    logger.error(`uploadAvatar: ${err.message}`);
    throw err;
  }
};

module.exports = { uploadAvatar };
