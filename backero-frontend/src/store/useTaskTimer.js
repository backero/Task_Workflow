import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import toast from 'react-hot-toast';

export function useTaskTimer(taskId) {
  const qc = useQueryClient();

  const { data: active, isLoading } = useQuery({
    queryKey: ['timer', 'active'],
    queryFn: () => api.get('/tasks/timer/active').then(r => r.data.activeTimer),
    refetchInterval: 60_000,
    staleTime: 10_000,
  });

  const isRunning = !!(taskId && active?.taskId?.toString() === taskId?.toString());

  const startMutation = useMutation({
    mutationFn: (id) => api.post(`/tasks/${id || taskId}/timer/start`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['timer', 'active'] });
      qc.invalidateQueries({ queryKey: ['task-detail', id || taskId] });
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to start timer'),
  });

  const stopMutation = useMutation({
    mutationFn: ({ id, note } = {}) => api.post(`/tasks/${id || taskId}/timer/stop`, { note }),
    onSuccess: (_, { id } = {}) => {
      qc.invalidateQueries({ queryKey: ['timer', 'active'] });
      qc.invalidateQueries({ queryKey: ['task-detail', id || taskId] });
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to stop timer'),
  });

  return {
    active,
    isRunning,
    isLoading,
    startTimer: (id) => startMutation.mutate(id),
    stopTimer: (opts) => stopMutation.mutate(opts || {}),
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}
