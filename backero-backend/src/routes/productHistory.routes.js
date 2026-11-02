const express = require('express');
const router = express.Router();
const ProductHistory = require('../models/ProductHistory');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

// Get history for a product
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    const history = await ProductHistory.find({
      productId,
      organizationId: req.orgId
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('userId', 'name email')
      .lean();

    const total = await ProductHistory.countDocuments({
      productId,
      organizationId: req.orgId
    });

    res.status(200).json({
      success: true,
      history,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error fetching product history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch history',
      error: error.message
    });
  }
});

// Save a history entry
router.post('/', async (req, res) => {
  try {
    const {
      productId,
      tabName,
      fieldName,
      oldValue,
      newValue,
      changeDescription
    } = req.body;

    if (!productId || !tabName || !fieldName) {
      return res.status(400).json({
        success: false,
        message: 'productId, tabName, and fieldName are required'
      });
    }

    const historyEntry = new ProductHistory({
      productId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      tabName,
      fieldName,
      oldValue,
      newValue,
      changeDescription: changeDescription || `Changed ${fieldName}`,
      organizationId: req.orgId
    });

    const saved = await historyEntry.save();

    console.log('Product history saved:', saved._id);

    res.status(201).json({
      success: true,
      history: saved,
      message: 'History entry saved'
    });
  } catch (error) {
    console.error('Error saving product history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save history',
      error: error.message
    });
  }
});

module.exports = router;
