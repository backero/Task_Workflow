const express = require('express');
const router = express.Router();
const SavedQuotes = require('../models/SavedQuotes');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

// Get all quotes for a product
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const quotes = await SavedQuotes.find({ productId, organizationId: req.orgId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      quotes: quotes || []
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes',
      error: error.message
    });
  }
});

// Get a specific quote
router.get('/:productId/:quoteId', async (req, res) => {
  try {
    const { productId, quoteId } = req.params;

    const quote = await SavedQuotes.findOne({
      _id: quoteId,
      productId,
      organizationId: req.orgId
    }).lean();

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    res.status(200).json({
      success: true,
      quote
    });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote',
      error: error.message
    });
  }
});

// Save a new quote
router.post('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, date, data, total } = req.body;

    if (!name || !data) {
      return res.status(400).json({
        success: false,
        message: 'Name and data are required'
      });
    }

    const newQuote = new SavedQuotes({
      productId,
      name,
      date: date || new Date().toLocaleDateString('en-IN'),
      data,
      total: total || 0,
      organizationId: req.orgId,
      createdBy: req.user._id
    });

    const savedQuote = await newQuote.save();

    console.log('Quote saved:', savedQuote._id);

    res.status(201).json({
      success: true,
      quote: savedQuote,
      message: 'Quote saved successfully'
    });
  } catch (error) {
    console.error('Error saving quote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save quote',
      error: error.message
    });
  }
});

// Delete a quote
router.delete('/:productId/:quoteId', async (req, res) => {
  try {
    const { productId, quoteId } = req.params;

    const deletedQuote = await SavedQuotes.findOneAndDelete({
      _id: quoteId,
      productId,
      organizationId: req.orgId
    });

    if (!deletedQuote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    console.log('Quote deleted:', quoteId);

    res.status(200).json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting quote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quote',
      error: error.message
    });
  }
});

module.exports = router;
