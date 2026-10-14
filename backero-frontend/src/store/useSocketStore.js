import { create } from 'zustand';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useNotificationStore } from './useNotificationStore';

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,

  connect: (token) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('notification', (notification) => {
      useNotificationStore.getState().addNotification(notification);
      const icon = notification.priority === 'critical' ? '🚨' : notification.priority === 'high' ? '⚠️' : '🔔';
      toast(`${icon} ${notification.title}: ${notification.message}`, {
        duration: notification.priority === 'critical' ? 8000 : 5000,
        icon: null,
      });
    });

    socket.on('task_created', () => {
      // Handled by React Query invalidation
    });

    socket.on('task_updated', () => {
      // Handled by React Query invalidation
    });

    socket.on('task_approved', ({ taskId }) => {
      toast.success('Task approved!', { icon: '✅' });
    });

    socket.on('task_rejected', ({ taskId, reason }) => {
      toast.error(`Task returned: ${reason}`, { duration: 6000 });
    });

    socket.on('inventory_low', ({ product }) => {
      toast(`📦 Low stock: ${product.name} (${product.currentStock} ${product.unit} remaining)`, {
        duration: 6000,
        style: { background: '#fff7ed', color: '#c2410c' },
      });
    });

    socket.on('overdue_alert', ({ taskId, title }) => {
      toast(`⏰ Task overdue: ${title}`, { duration: 6000, style: { background: '#fef2f2', color: '#991b1b' } });
    });

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  joinRoom: (room) => {
    get().socket?.emit(`join:${room.split(':')[0]}`, room.split(':')[1]);
  },

  leaveRoom: (room) => {
    get().socket?.emit(`leave:${room.split(':')[0]}`, room.split(':')[1]);
  },
}));
