const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');
const Employee = require('./src/models/Employee');
const AttendanceLog = require('./src/models/AttendanceLog');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: 'backeroindia@gmail.com' });
  const employee = await Employee.findOne({ userId: user._id });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await AttendanceLog.deleteMany({
    employeeId: employee._id,
    createdAt: { $gte: today, $lt: tomorrow }
  });

  console.log(`✓ Deleted ${result.deletedCount} attendance records for today`);
  process.exit(0);
})();
