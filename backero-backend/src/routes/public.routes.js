const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/public.controller');

router.get('/track/:token', ctrl.getOrderTracking);

module.exports = router;
