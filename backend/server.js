require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { PORT, FRONTEND_URL, WHATSAPP_PROVIDER } = require('./src/config/env');
const { initSocket } = require('./src/sockets/index');
const { startReminderJobs } = require('./src/jobs/reminderJob');
const logger = require('./src/utils/logger');

const start = async () => {
  await connectDB();

  // Start WhatsApp client when provider is 'local' (free, Baileys QR-based)
  if (WHATSAPP_PROVIDER === 'local') {
    const waClient = require('./src/services/wa-client');
    waClient.init().catch(err => logger.error(`[WhatsApp] Startup error: ${err.message}`));
    logger.info('[WhatsApp] Local client initializing — check terminal for QR code if first run');
  }

  const httpServer = http.createServer(app);

  initSocket(httpServer, FRONTEND_URL);
  logger.info('Socket.io initialized');

  startReminderJobs();

  httpServer.listen(PORT, () => {
    logger.info(`Backero API server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
    logger.info(`Socket.io: ws://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
