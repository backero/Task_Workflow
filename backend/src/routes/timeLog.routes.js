const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { logTime, getTaskTimeLogs, getMyTimeLogs, deleteTimeLog } = require('../controllers/timeLog.controller')

router.use(authenticate)

router.post('/',                    logTime)
router.get('/my',                   getMyTimeLogs)
router.get('/task/:taskId',         getTaskTimeLogs)
router.delete('/:id',               deleteTimeLog)

module.exports = router
