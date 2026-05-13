import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { format } from 'date-fns';
import { clsx } from 'clsx';

const TYPE_COLORS = { IN: 'badge-green', OUT: 'badge-red', ADJUSTMENT: 'badge-blue', SALE: 'badge-purple', PRODUCTION_USE: 'badge-orange', PRODUCTION_OUTPUT: 'badge-green', QUALITY_TEST: 'badge-gray' };

export default function StockMovements() {
  const [type, setType] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', type],
    queryFn: () => api.get('/inventory/movements', { params: { limit: 50, type: type || undefined } }).then((r) => r.data),
  });

  const movements = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Stock Movements</h1>
      </div>
      <div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="input w-auto">
          {['', 'IN', 'OUT', 'ADJUSTMENT', 'SALE', 'PRODUCTION_USE', 'PRODUCTION_OUTPUT'].map((t) => (
            <option key={t} value={t}>{t || 'All Types'}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Product</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Type</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Quantity</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Before → After</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">By</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {movements.map((m) => (
                <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900 dark:text-white">{m.product?.name}</p>
                    <p className="text-xs text-gray-400">{m.product?.sku}</p>
                  </td>
                  <td className="py-3 px-4 text-center"><span className={`badge ${TYPE_COLORS[m.type] || 'badge-gray'}`}>{m.type}</span></td>
                  <td className={clsx('py-3 px-4 text-center font-semibold', m.quantity > 0 ? 'text-green-600' : 'text-red-600')}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity} {m.product?.unit}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500 text-xs">{m.previousStock} → {m.newStock}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{m.createdBy?.firstName} {m.createdBy?.lastName}</td>
                  <td className="py-3 px-4 text-right text-gray-400 text-xs">{format(new Date(m.createdAt), 'dd MMM yy, HH:mm')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 && <div className="text-center py-12 text-gray-400">No movements found</div>}
        </div>
      )}
    </div>
  );
}
