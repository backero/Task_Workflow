const mongoose = require('mongoose');
const logger = require('../utils/logger');

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 12; // 1 minute total

const connectDB = async (attempt = 1) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
    });
  } catch (error) {
    logger.error(`MongoDB connection failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

    if (error.message.includes('whitelist') || error.message.includes('IP')) {
      logger.error('⚠️  FIX: Go to MongoDB Atlas → Network Access → Add Current IP Address');
      logger.error('    Or temporarily allow all IPs: 0.0.0.0/0 for development');
    }

    if (attempt < MAX_RETRIES) {
      logger.info(`Retrying MongoDB connection in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => connectDB(attempt + 1), RETRY_DELAY_MS);
    } else {
      logger.error('MongoDB connection failed after all retries. Server will run without database.');
    }
  }
};

module.exports = connectDB;
