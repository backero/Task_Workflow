const { Server } = require('socket.io');
const { verifyAccessToken } = require('../services/jwt.service');
const logger = require('../utils/logger');

let io = null;
const onlineUsers = new Map(); // orgId → Set<userId>

const initSocket = (httpServer, frontendUrl) => {
  io = new Server(httpServer, {
    cors: {
      origin: [frontendUrl, 'http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.userId;
      socket.role = decoded.role;
      socket.organizationId = decoded.organizationId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} | user: ${socket.userId}`);

    // Auto-join personal room and org room
    socket.join(`user:${socket.userId}`);
    if (socket.organizationId) {
      socket.join(`org:${socket.organizationId}`);
      const orgKey = socket.organizationId.toString();
      if (!onlineUsers.has(orgKey)) onlineUsers.set(orgKey, new Set());
      onlineUsers.get(orgKey).add(socket.userId.toString());
      io.to(`org:${socket.organizationId}`).emit('user:online', { userId: socket.userId });
    }

    socket.on('join_project', (projectId) => {
      socket.join(`project:${projectId}`);
      logger.debug(`Socket ${socket.id} joined project:${projectId}`);
    });

    socket.on('leave_project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} | reason: ${reason}`);
      if (socket.organizationId) {
        const orgKey = socket.organizationId.toString();
        const set = onlineUsers.get(orgKey);
        if (set) {
          set.delete(socket.userId.toString());
          if (set.size === 0) onlineUsers.delete(orgKey);
        }
        io.to(`org:${socket.organizationId}`).emit('user:offline', { userId: socket.userId });
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// Helper emitters
const emitToOrg = (orgId, event, data) => {
  if (!io) return;
  io.to(`org:${orgId}`).emit(event, data);
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

const emitToProject = (projectId, event, data) => {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, data);
};

const getOnlineUsers = (orgId) => Array.from(onlineUsers.get(orgId?.toString()) || []);

module.exports = { initSocket, getIO, emitToOrg, emitToUser, emitToProject, getOnlineUsers };
