import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Trash2, Plus, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function RemainderPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('Pending');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Custom',
    dueDate: '',
    priority: 'Medium',
    notes: ''
  });

  // Fetch reminders
  const { data: remindersData, isLoading } = useQuery({
    queryKey: ['reminders', filterStatus],
    queryFn: async () => {
      const res = await api.get('/remainders', {
        params: { status: filterStatus === 'All' ? undefined : filterStatus }
      });
      return res.data;
    }
  });

  const reminders = remindersData?.reminders || [];

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingId) {
        return api.put(`/remainders/${editingId}`, data);
      } else {
        return api.post('/remainders', data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(editingId ? 'Remainder updated' : 'Remainder created');
      setShowForm(false);
      setEditingId(null);
      setFormData({
        title: '',
        description: '',
        type: 'Custom',
        dueDate: '',
        priority: 'Medium',
        notes: ''
      });
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || 'Failed to save reminder');
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/remainders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Remainder deleted');
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || 'Failed to delete reminder');
    }
  });

  // Mark complete mutation
  const completeMutation = useMutation({
    mutationFn: (id) => api.put(`/remainders/${id}`, { status: 'Done' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Marked as done');
    }
  });

  const handleEdit = (reminder) => {
    setFormData({
      title: reminder.title,
      description: reminder.description || '',
      type: reminder.type,
      dueDate: new Date(reminder.dueDate).toISOString().split('T')[0],
      priority: reminder.priority,
      notes: reminder.notes || ''
    });
    setEditingId(reminder._id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formData.title || !formData.dueDate) {
      toast.error('Title and Due Date are required');
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      title: '',
      description: '',
      type: 'Custom',
      dueDate: '',
      priority: 'Medium',
      notes: ''
    });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDaysLeft = (dueDate) => {
    const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Done':
        return <CheckCircle size={18} className="text-green-600" />;
      case 'Overdue':
        return <AlertCircle size={18} className="text-red-600" />;
      default:
        return <Clock size={18} className="text-blue-600" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-700';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'Low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📋 Reminders</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={18} /> New Reminder
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['Pending', 'Done', 'Overdue', 'All'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              filterStatus === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">{editingId ? 'Edit' : 'New'} Reminder</h2>

          <div>
            <label className="block text-sm font-semibold mb-2">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter reminder title"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option>Follow-up</option>
                <option>Approval</option>
                <option>Payment</option>
                <option>Document</option>
                <option>Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Due Date *</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Additional notes"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reminders List */}
      {isLoading ? (
        <p className="text-center text-gray-500">Loading reminders...</p>
      ) : reminders.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No reminders found</p>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <div
              key={reminder._id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:shadow-md transition"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {getStatusIcon(reminder.status)}
                  <h3 className="font-semibold text-gray-900">{reminder.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(reminder.priority)}`}>
                    {reminder.priority}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    {reminder.type}
                  </span>
                </div>

                {reminder.description && (
                  <p className="text-sm text-gray-600 mb-2">{reminder.description}</p>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>📅 Due: {formatDate(reminder.dueDate)}</span>
                  <span>
                    {getDaysLeft(reminder.dueDate) < 0
                      ? `⏰ ${Math.abs(getDaysLeft(reminder.dueDate))} days overdue`
                      : `⏳ ${getDaysLeft(reminder.dueDate)} days left`}
                  </span>
                  <span className={`font-semibold ${
                    reminder.status === 'Done' ? 'text-green-600' :
                    reminder.status === 'Overdue' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {reminder.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {reminder.status === 'Pending' && (
                  <button
                    onClick={() => completeMutation.mutate(reminder._id)}
                    disabled={completeMutation.isPending}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                    title="Mark as done"
                  >
                    <CheckCircle size={20} />
                  </button>
                )}
                {reminder.status === 'Pending' && (
                  <button
                    onClick={() => handleEdit(reminder)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Edit"
                  >
                    ✏️
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm('Delete this reminder?')) {
                      deleteMutation.mutate(reminder._id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
