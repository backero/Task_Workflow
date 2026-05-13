import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { clsx } from 'clsx';

const QC_COLORS = { pass: 'badge-green', fail: 'badge-red', conditional: 'badge-yellow' };

export default function QualityControl() {
  const { data } = useQuery({
    queryKey: ['production', 'qc'],
    queryFn: () => api.get('/production?status=Quality Check').then((r) => r.data),
  });

  const orders = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Quality Control</h1></div>
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order._id} className="card p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-gray-400 font-mono">{order.orderNumber}</p>
                <h3 className="font-semibold text-gray-900 dark:text-white mt-1">{order.finishedProduct?.name}</h3>
                <p className="text-sm text-gray-500">Batch: {order.batch} • Qty: {order.plannedQuantity}</p>
              </div>
              <span className="badge badge-purple">Quality Check</span>
            </div>
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quality Checks</h4>
              {order.qualityChecks?.length ? (
                <div className="space-y-1">
                  {order.qualityChecks.map((qc, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{qc.checkType || `Check ${i + 1}`}</span>
                      <span className={`badge ${QC_COLORS[qc.result] || 'badge-gray'}`}>{qc.result}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No quality checks recorded yet</p>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="card p-12 text-center text-gray-400">No orders in Quality Check stage</div>}
      </div>
    </div>
  );
}
