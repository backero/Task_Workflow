// Holiday — organization-wide holiday calendar entry. Consumed by
// attendanceProcessor.service.js#deriveDefaultStatus to auto-set an
// employee's Attendance status to HOLIDAY on a day with zero punches,
// instead of requiring HR to mark every employee's calendar by hand.
const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  // When true, this holiday recurs every year on the same month+day (e.g.
  // Independence Day) — deriveDefaultStatus matches on month/day only, not
  // the stored year. When false, it's a one-off date (e.g. a festival whose
  // date shifts each year).
  isRecurringAnnually: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

holidaySchema.index({ organizationId: 1, date: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
