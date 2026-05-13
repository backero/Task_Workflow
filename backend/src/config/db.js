const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { MONGO_URI } = require('./env');

const MAX_RETRIES = 5;
let retries = 0;

const connect = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB connected successfully');
    retries = 0;
  } catch (err) {
    retries += 1;
    logger.error(`MongoDB connection failed (attempt ${retries}/${MAX_RETRIES}): ${err.message}`);
    if (retries >= MAX_RETRIES) {
      logger.error('Max DB connection retries reached. Exiting.');
      process.exit(1);
    }
    setTimeout(connect, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting reconnect...');
  connect();
});

module.exports = connect;
