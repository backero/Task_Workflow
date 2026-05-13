require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const connectDB = require('./src/config/database');
const { initSocket } = require('./src/config/socket');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler.middleware');

// Route imports
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const taskRoutes = require('./src/routes/task.routes');
const approvalRoutes = require('./src/routes/approval.routes');
const crmRoutes = require('./src/routes/crm.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const productionRoutes = require('./src/routes/production.routes');
const financeRoutes = require('./src/routes/finance.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const reportRoutes = require('./src/routes/report.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const departmentRoutes = require('./src/routes/department.routes');
const organizationRoutes = require('./src/routes/organization.routes');
const marketingRoutes = require('./src/routes/marketing.routes');
const marketplaceRoutes = require('./src/routes/marketplace.routes');
const whatsappRoutes  = require('./src/routes/whatsapp.routes');
const workflowRoutes  = require('./src/routes/workflow.routes');

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Initialize Socket.io
const io = initSocket(server);
app.set('io', io);

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// CORS
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts.' },
});
app.use('/api/auth/', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check
const mongoose = require('mongoose');
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// DB availability check for API routes
app.use('/api/', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database not connected. Please whitelist your IP in MongoDB Atlas → Network Access.',
    });
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/whatsapp',  whatsappRoutes);
app.use('/api/workflow', workflowRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use(errorHandler);

// Start automation + WhatsApp
if (process.env.NODE_ENV !== 'test') {
  const { startAutomationEngine } = require('./src/services/automation.service');
  const { initWhatsApp } = require('./src/services/whatsapp.service');
  const { setSocketIO } = require('./src/services/workflowEngine.service');
  startAutomationEngine(io);
  initWhatsApp(io);
  setSocketIO(io);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Backero server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = { app, server };
