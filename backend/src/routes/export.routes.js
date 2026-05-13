const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { exportTasks } = require('../controllers/export.controller')

router.use(authenticate)
router.get('/tasks', exportTasks)

module.exports = router
