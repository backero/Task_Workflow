import api from './axios';

const documentsApi = {
  list: () => api.get('/documents').then((r) => r.data.documents),
  getOne: (id) => api.get(`/documents/${id}`).then((r) => r.data.document),
  create: (payload) => api.post('/documents', payload).then((r) => r.data.document),
  update: (id, payload) => api.put(`/documents/${id}`, payload).then((r) => r.data.document),
  softDelete: (id) => api.delete(`/documents/${id}`).then((r) => r.data),

  getCategories: () => api.get('/documents/categories').then((r) => r.data.categories),
  addCategory: (name) => api.post('/documents/categories', { name }).then((r) => r.data.categories),
  deleteCategory: (catId) => api.delete(`/documents/categories/${catId}`).then((r) => r.data.categories),

  listTrash: () => api.get('/documents/trash').then((r) => r.data.trash),
  restoreTrash: (trashId) => api.post(`/documents/trash/${trashId}/restore`).then((r) => r.data),
  purgeTrash: (trashId) => api.delete(`/documents/trash/${trashId}`).then((r) => r.data),
  emptyTrash: () => api.delete('/documents/trash').then((r) => r.data),

  uploadFile: (docId, file, onUploadProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/documents/${docId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }).then((r) => r.data);
  },
  addVersion: (docId, payload) => api.post(`/documents/${docId}/versions`, payload).then((r) => r.data.document),
  deleteVersion: (docId, versionId) => api.delete(`/documents/${docId}/versions/${versionId}`).then((r) => r.data),
  deleteVersionFile: (docId, versionId, fileId) =>
    api.delete(`/documents/${docId}/versions/${versionId}/files/${fileId}`).then((r) => r.data.document),

  fetchFileBlob: (driveId) =>
    api.get(`/documents/files/${driveId}/content`, { responseType: 'blob' }).then((r) => r.data),

  remindersPreview: (days) => api.get('/documents/reminders/preview', { params: { days } }).then((r) => r.data),
  remindersSendNow: () => api.post('/documents/reminders/send-now').then((r) => r.data),

  driveStatus: () => api.get('/documents/drive/status').then((r) => r.data),
  driveConnectUrl: () => api.get('/documents/drive/connect-url').then((r) => r.data.url),
};

export default documentsApi;
