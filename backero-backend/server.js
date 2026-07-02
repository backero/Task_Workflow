require('dotenv').config();

// Fail fast if critical secrets are missing — JWT would silently sign with 'undefined'
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}. Server will not start.`);
  process.exit(1);
}

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
const chatRoutes      = require('./src/routes/chat.routes');
const publicRoutes    = require('./src/routes/public.routes');

const app = express();
const server = http.createServer(app);

// Trust Render's load balancer so req.ip = real client IP, not proxy IP
// Without this, ALL users share the same rate-limit bucket (Render's proxy IP)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Connect to database
connectDB();

// Initialize Socket.io
const io = initSocket(server);
app.set('io', io);

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// Passport (stateless — no session)
const passport = require('passport');
app.use(passport.initialize());

// CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'https://resplendent-shortbread-91ee46.netlify.app',
  'https://backero-worktaskflow.netlify.app',
  'https://task-workflow-liart.vercel.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    // Allow Netlify preview deploys
    if (/^https:\/\/[a-z0-9-]+--(resplendent-shortbread-91ee46|backero-worktaskflow)\.netlify\.app$/.test(origin)) {
      return callback(null, true);
    }
    // Allow all Vercel deployments for this project (preview + production)
    if (/^https:\/\/task-workflow[a-z0-9-]*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting — only applied to unauthenticated auth routes (login/register)
// Authenticated API requests are NOT rate-limited at app level; JWT already
// ensures only valid users reach those endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 60,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!req.headers.authorization || process.env.NODE_ENV !== 'production',
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
    jwt_secret: process.env.JWT_SECRET ? 'set' : 'MISSING',
    jwt_refresh: process.env.JWT_REFRESH_SECRET ? 'set' : 'MISSING',
    version: 'v2-sample-fix',
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

// Public routes (no auth required)
app.use('/api/public', publicRoutes);

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
app.use('/api/help',    chatRoutes);

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
  // Skip WhatsApp on local when WHATSAPP_ENABLED=false — prevents local from fighting
  // with Render over the same MongoDB session (causes 440 disconnect loop on both)
  if (process.env.WHATSAPP_ENABLED !== 'false') {
    initWhatsApp(io);
  } else {
    logger.info('[WhatsApp] Disabled via WHATSAPP_ENABLED=false — skipping init');
  }
  setSocketIO(io);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Backero server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = { app, server };
