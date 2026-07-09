const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  const allowedSocketOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://task-workflow-liart.vercel.app',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedSocketOrigins.includes(origin)) return callback(null, true);
        if (/^https:\/\/task-workflow[a-z0-9-]*\.vercel\.app$/.test(origin)) return callback(null, true);
        callback(new Error(`Socket CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.orgId = decoded.organizationId;
      socket.role = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} | User: ${socket.userId}`);

    // Auto-join rooms
    socket.join(`user:${socket.userId}`);
    socket.join(`org:${socket.orgId}`);

    socket.on('join:department', (deptId) => {
      socket.join(`department:${deptId}`);
    });

    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('join:task', (taskId) => {
      socket.join(`task:${taskId}`);
    });

    socket.on('leave:task', (taskId) => {
      socket.leave(`task:${taskId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
