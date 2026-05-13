const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { requireMinRole } = require('../middleware/role.middleware')
const { getLabels, createLabel, updateLabel, deleteLabel } = require('../controllers/label.controller')

router.use(authenticate)

router.get('/',         getLabels)
router.post('/',        requireMinRole('MANAGER'), createLabel)
router.patch('/:id',   requireMinRole('MANAGER'), updateLabel)
router.delete('/:id',  requireMinRole('ADMIN'),   deleteLabel)

module.exports = router
