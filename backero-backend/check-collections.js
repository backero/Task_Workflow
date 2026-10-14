const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();
  collections.forEach(c => console.log(c.name));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
