import { create } from 'zustand';
import api from '../api/axios';

export const useWorkflowStore = create((set, get) => ({
  graph: { nodes: [], edges: [] },
  tree: null,
  rootTask: null,
  selectedNode: null,
  showDetailPanel: false,
  templates: [],
  isLoading: false,
  error: null,

  fetchWorkflowGraph: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get(`/workflow/${taskId}/graph`);
      set({
        graph: data.data.graph,
        tree: data.data.tree,
        rootTask: data.data.task,
        isLoading: false,
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load workflow', isLoading: false });
    }
  },

  refreshGraph: async () => {
    const { rootTask } = get();
    if (rootTask?._id) await get().fetchWorkflowGraph(rootTask._id);
  },

  addSubtask: async (parentTaskId, payload) => {
    const { data } = await api.post(`/workflow/${parentTaskId}/subtask`, payload);
    await get().refreshGraph();
    return data.data;
  },

  addDependency: async (fromTaskId, toTaskId, type = 'finish_to_start') => {
    const { data } = await api.post('/workflow/dependency', { fromTaskId, toTaskId, type });
    await get().refreshGraph();
    return data.data;
  },

  removeDependency: async (depId) => {
    await api.delete(`/workflow/dependency/${depId}`);
    await get().refreshGraph();
  },

  updateNodePositions: async (positions) => {
    await api.put('/workflow/nodes/positions', { positions });
  },

  updateProgress: async (taskId, progress, hoursWorked) => {
    const { data } = await api.put(`/workflow/${taskId}/progress`, { progress, hoursWorked });
    await get().refreshGraph();
    return data.data;
  },

  startTask: async (taskId) => {
    const { data } = await api.post(`/workflow/${taskId}/start`);
    await get().refreshGraph();
    return data.data;
  },

  addUpdate: async (taskId, payload) => {
    const { data } = await api.post(`/workflow/${taskId}/update`, payload);
    await get().refreshGraph();
    return data.data;
  },

  requestCompletion: async (taskId, notes) => {
    const { data } = await api.post(`/workflow/${taskId}/request-completion`, { notes });
    await get().refreshGraph();
    return data;
  },

  completeTask: async (taskId, approvalId, notes) => {
    const { data } = await api.post(`/workflow/${taskId}/complete`, { approvalId, notes });
    await get().refreshGraph();
    return data;
  },

  rejectTask: async (taskId, approvalId, reason) => {
    const { data } = await api.post(`/workflow/${taskId}/reject`, { approvalId, reason });
    await get().refreshGraph();
    return data;
  },

  reopenTask: async (taskId, reason) => {
    const { data } = await api.post(`/workflow/${taskId}/reopen`, { reason });
    await get().refreshGraph();
    return data;
  },

  checkCompletion: async (taskId) => {
    const { data } = await api.get(`/workflow/${taskId}/completion-check`);
    return data.data;
  },

  fetchTemplates: async () => {
    const { data } = await api.get('/workflow/templates');
    set({ templates: data.data });
  },

  saveTemplate: async (taskId, name, description, category) => {
    const { data } = await api.post('/workflow/templates', { taskId, name, description, category });
    await get().fetchTemplates();
    return data.data;
  },

  applyTemplate: async (taskId, templateId) => {
    const { data } = await api.post(`/workflow/${taskId}/apply-template`, { templateId });
    await get().refreshGraph();
    return data;
  },

  deleteTask: async (taskId) => {
    await api.delete(`/tasks/${taskId}`);
    await get().refreshGraph();
  },

  selectNode: (nodeData) => set({ selectedNode: nodeData, showDetailPanel: !!nodeData }),
  closeDetailPanel: () => set({ selectedNode: null, showDetailPanel: false }),

  setGraph: (graph) => set({ graph }),
}));
