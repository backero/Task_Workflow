const AttendanceLog = require('../models/AttendanceLog');
const Employee = require('../models/Employee');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

exports.checkIn = asyncHandler(async (req, res) => {
  const { latitude, longitude, address } = req.body;
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  // Find employee by userId
  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found for your account', 404);
  }

  // Check if already checked in today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existingCheckIn = await AttendanceLog.findOne({
    employeeId: employee._id,
    checkInTime: { $gte: today, $lt: tomorrow },
    checkOutTime: null
  });

  if (existingCheckIn) {
    return sendError(res, 'You are already checked in. Please check out first.', 400);
  }

  // Create new check-in record
  const attendanceLog = await AttendanceLog.create({
    organizationId,
    employeeId: employee._id,
    userId,
    checkInTime: new Date(),
    checkInLocation: {
      type: 'Point',
      coordinates: [longitude, latitude]
    },
    checkInAddress: address,
    status: 'present'
  });

  sendSuccess(res, {
    checkIn: attendanceLog,
    message: `Checked in at ${attendanceLog.checkInTime.toLocaleTimeString()}`
  }, 'Check-in successful', 201);
});

exports.checkOut = asyncHandler(async (req, res) => {
  const { latitude, longitude, address } = req.body;
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  // Find employee by userId
  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found for your account', 404);
  }

  // Find today's check-in record
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const attendanceLog = await AttendanceLog.findOne({
    employeeId: employee._id,
    checkInTime: { $gte: today, $lt: tomorrow },
    checkOutTime: null
  });

  if (!attendanceLog) {
    return sendError(res, 'No active check-in found. Please check in first.', 400);
  }

  // Calculate hours worked
  const checkOutTime = new Date();
  const hoursWorked = (checkOutTime - attendanceLog.checkInTime) / (1000 * 60 * 60);

  // Update check-out
  attendanceLog.checkOutTime = checkOutTime;
  attendanceLog.checkOutLocation = {
    type: 'Point',
    coordinates: [longitude, latitude]
  };
  attendanceLog.checkOutAddress = address;
  attendanceLog.hoursWorked = Math.round(hoursWorked * 100) / 100;

  await attendanceLog.save();

  sendSuccess(res, {
    checkOut: attendanceLog,
    message: `Checked out at ${attendanceLog.checkOutTime.toLocaleTimeString()}. Hours worked: ${attendanceLog.hoursWorked}`
  }, 'Check-out successful');
});

exports.getTodayStatus = asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  // Find employee
  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  // Find today's record
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const attendanceLog = await AttendanceLog.findOne({
    employeeId: employee._id,
    checkInTime: { $gte: today, $lt: tomorrow }
  });

  if (!attendanceLog) {
    return sendSuccess(res, {
      status: 'not-checked-in',
      message: 'You have not checked in yet today'
    });
  }

  const status = attendanceLog.checkOutTime ? 'checked-out' : 'checked-in';
  const hoursWorked = attendanceLog.hoursWorked ||
    ((new Date() - attendanceLog.checkInTime) / (1000 * 60 * 60)).toFixed(2);

  sendSuccess(res, {
    status,
    checkInTime: attendanceLog.checkInTime,
    checkOutTime: attendanceLog.checkOutTime,
    hoursWorked,
    attendanceLog
  });
});

exports.getAttendanceHistory = asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  // Convert days to integer and set default
  const days = parseInt(req.query.days || '30', 10);

  if (isNaN(days) || days < 1) {
    return sendError(res, 'Invalid days parameter. Must be a positive number.', 400);
  }

  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const logs = await AttendanceLog.find({
    employeeId: employee._id,
    checkInTime: { $gte: startDate }
  }).sort({ checkInTime: -1 });

  sendSuccess(res, { logs, count: logs.length });
});

exports.getAttendanceAnalytics = asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  const userId = req.user._id;
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;

  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const logs = await AttendanceLog.find({
    employeeId: employee._id,
    checkInTime: { $gte: startDate, $lte: endDate }
  });

  const analytics = {
    totalDays: logs.length,
    presentDays: logs.filter(l => l.status === 'present').length,
    lateDays: logs.filter(l => l.status === 'late').length,
    earlyLeaveDays: logs.filter(l => l.status === 'early-leave').length,
    absentDays: logs.filter(l => l.status === 'absent').length,
    totalHours: logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0),
    averageHours: logs.length > 0 ? (logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0) / logs.length).toFixed(2) : 0,
    logs
  };

  sendSuccess(res, analytics);
});
