require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./src/models/User');
const Employee = require('./src/models/Employee');

async function findSuryaraj() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('=== SEARCHING FOR SURYARAJ ===\n');

    // Search for employee named Suryaraj
    const employee = await Employee.findOne({ fullName: /suryaraj/i });

    if (employee) {
      console.log('✅ Found Employee:');
      console.log('   Name:', employee.fullName);
      console.log('   Code:', employee.employeeCode);
      console.log('   UserId:', employee.userId);

      // Find the user account
      const user = await User.findById(employee.userId);
      if (user) {
        console.log('\n✅ Found User Account:');
        console.log('   Email:', user.email);
        console.log('   Role:', user.role);
        console.log('   Status:', user.status || 'active');
        console.log('\n📝 LOGIN CREDENTIALS:');
        console.log('   Email:', user.email);
        console.log('   Password: (needs reset or use: Test@1234)');
      }
    } else {
      console.log('❌ Suryaraj not found\n');
      console.log('Available employees:');
      const employees = await Employee.find().limit(10);
      employees.forEach(emp => {
        console.log('  -', emp.fullName);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

findSuryaraj();
