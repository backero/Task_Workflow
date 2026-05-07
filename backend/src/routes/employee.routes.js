const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createEmployeeSchema, updateEmployeeSchema } = require('../validators/employee.validator');
const {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, toggleEmployeeStatus, deleteEmployee, getDepartments,
} = require('../controllers/employee.controller');

router.use(authenticate);

// Read — any authenticated org member
router.get('/',              listEmployees);
router.get('/departments',   getDepartments);
router.get('/:id',           getEmployee);

// Write — HR and above
router.post('/',             requireMinRole('HR'), validate(createEmployeeSchema), createEmployee);
router.patch('/:id',         requireMinRole('HR'), validate(updateEmployeeSchema), updateEmployee);
router.patch('/:id/status',  requireMinRole('HR'),                                 toggleEmployeeStatus);

// Delete — ADMIN and above
router.delete('/:id',        requireMinRole('ADMIN'),                              deleteEmployee);

module.exports = router;
