import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../store/useAuthStore';

const STATUS_COLORS = {
  'Planned': 'badge-gray', 'Material Allocated': 'badge-blue', 'In Production': 'badge-yellow',
  'Quality Check': 'badge-purple', 'Packaging': 'badge-orange', 'Completed': 'badge-green', 'Cancelled': 'badge-red',
};
const STATUS_FLOW = ['Planned', 'Material Allocated', 'In Production', 'Quality Check', 'Packaging', 'Completed'];

function CreateOrderModal({ onClose, onSuccess }) {
  const { register, handleSubmit } = useForm();
  const [loading, setLoading] = useState(false);

  const { data: productsData } = useQuery({
    queryKey: ['inventory', 'products'],
    queryFn: () => api.get('/inventory/products?limit=100').then((r) => r.data),
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.post('/production', data);
      toast.success('Production order created');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60" onClick={onClose} />
      <div className="relative card w-full max-w-lg shadow-modal p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">Create Production Order</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Finished Product *</label>
            <select {...register('finishedProduct', { required: true })} className="input">
              <option value="">Select product</option>
              {(productsData?.data || []).map((p) => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Planned Quantity *</label>
              <input {...register('plannedQuantity', { required: true })} type="number" min="1" className="input" />
            </div>
            <div>
              <label className="label">Priority</label>
              <select {...register('priority')} className="input">
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Planned Start</label>
              <input {...register('plannedStartDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Planned End</label>
              <input {...register('plannedEndDate')} type="date" className="input" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">{loading ? 'Creating...' : 'Create Order'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductionOrders() {
  const [showForm, setShowForm] = useState(false);
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['production', 'orders'],
    queryFn: () => api.get('/production').then((r) => r.data),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/production/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['production'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const orders = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Orders</h1>
          <p className="text-gray-500 text-sm">{orders.length} orders</p>
        </div>
        {isManagerOrAbove() && (
          <button onClick={() => setShowForm(true)} className="btn-primary"><PlusIcon className="w-4 h-4" /> New Order</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const currentStep = STATUS_FLOW.indexOf(order.status);
            return (
              <div key={order._id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-gray-400">{order.orderNumber}</span>
                      <span className={`badge ${STATUS_COLORS[order.status] || 'badge-gray'}`}>{order.status}</span>
                      <span className="badge badge-blue">{order.priority}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{order.finishedProduct?.name}</h3>
                    <div className="flex gap-4 text-sm text-gray-500 mt-1">
                      <span>Batch: {order.batch}</span>
                      <span>Qty: {order.completedQuantity}/{order.plannedQuantity} {order.unit}</span>
                    </div>
                    {/* Progress steps */}
                    <div className="flex items-center gap-1 mt-3">
                      {STATUS_FLOW.map((step, i) => (
                        <React.Fragment key={step}>
                          <div className={clsx('w-2 h-2 rounded-full', i <= currentStep ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700')} />
                          {i < STATUS_FLOW.length - 1 && <div className={clsx('flex-1 h-0.5 max-w-8', i < currentStep ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700')} />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  {isManagerOrAbove() && order.status !== 'Completed' && order.status !== 'Cancelled' && (
                    <div className="flex-shrink-0">
                      <select
                        value={order.status}
                        onChange={(e) => updateStatusMutation.mutate({ id: order._id, status: e.target.value })}
                        className="input text-xs"
                      >
                        {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div className="card p-12 text-center text-gray-400">No production orders</div>}
        </div>
      )}

      {showForm && <CreateOrderModal onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['production'] }); }} />}
    </div>
  );
}
