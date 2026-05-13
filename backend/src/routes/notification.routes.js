const express = require('express');
const router = express.Router();
const { getNotifications, markRead, markOneRead } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', getNotifications);
router.patch('/read-all', markRead);
router.patch('/:id/read', markOneRead);

module.exports = router;
