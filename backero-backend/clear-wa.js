const mongoose = require('/var/www/Task_Workflow/backero-backend/node_modules/mongoose');
require('dotenv').config({ path: '/var/www/Task_Workflow/backero-backend/.env' });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const result = await mongoose.connection.db.collection('wa_sessions').deleteMany({});
  console.log('Deleted:', result.deletedCount);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
