import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { format } from 'date-fns';

export default function BatchHistory() {
  const { data } = useQuery({
    queryKey: ['production', 'completed'],
    queryFn: () => api.get('/production?status=Completed&limit=30').then((r) => r.data),
  });

  const orders = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Batch History</h1></div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Order #</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Product</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Batch</th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium">Qty</th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium">QC</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {orders.map((order) => (
              <tr key={order._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{order.orderNumber}</td>
                <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{order.finishedProduct?.name}</td>
                <td className="py-3 px-4 text-gray-500 text-xs">{order.batch}</td>
                <td className="py-3 px-4 text-center text-gray-900 dark:text-white">{order.completedQuantity}/{order.plannedQuantity}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`badge ${order.qualityStatus === 'passed' ? 'badge-green' : order.qualityStatus === 'failed' ? 'badge-red' : 'badge-gray'}`}>
                    {order.qualityStatus}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-gray-400 text-xs">
                  {order.actualEndDate ? format(new Date(order.actualEndDate), 'dd MMM yy') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="text-center py-12 text-gray-400">No completed batches</div>}
      </div>
    </div>
  );
}
