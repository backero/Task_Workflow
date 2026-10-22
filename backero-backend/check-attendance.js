const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');
const Employee = require('./src/models/Employee');
const AttendanceLog = require('./src/models/AttendanceLog');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOne({ email: 'backeroindia@gmail.com' });
    const employee = await Employee.findOne({ userId: user._id });

    // Check today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const logs = await AttendanceLog.find({
      employeeId: employee._id,
      createdAt: { $gte: today, $lt: tomorrow }
    });

    console.log('Attendance logs for today:', logs.length);
    logs.forEach((log, i) => {
      console.log(`\nLog ${i + 1}:`);
      console.log('  ID:', log._id);
      console.log('  Status:', log.currentPunchStatus);
      console.log('  Punches:', log.punches.length);
      log.punches.forEach(p => console.log(`    - ${p.punchType}`));
    });

    if (logs.length > 0) {
      console.log('\n--- Deleting today\'s logs to reset ---');
      await AttendanceLog.deleteMany({
        employeeId: employee._id,
        createdAt: { $gte: today, $lt: tomorrow }
      });
      console.log('✓ Deleted. Try punch-in again.');
    }

    process.exit(0);
  } catch(e) {
    console.error(e.message);
    process.exit(1);
  }
})();
