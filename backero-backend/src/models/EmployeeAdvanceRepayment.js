const mongoose = require('mongoose');

const employeeAdvanceRepaymentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  advanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeAdvance', required: true },
  payrollPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod', required: true },
  payrollRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRecord', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

employeeAdvanceRepaymentSchema.index({ advanceId: 1, payrollPeriodId: 1 }, { unique: true });
module.exports = mongoose.model('EmployeeAdvanceRepayment', employeeAdvanceRepaymentSchema);
