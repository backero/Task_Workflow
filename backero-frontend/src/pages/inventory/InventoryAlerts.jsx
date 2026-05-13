import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';

export default function InventoryAlerts() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'alerts'],
    queryFn: () => api.get('/inventory/alerts').then((r) => r.data),
    refetchInterval: 2 * 60 * 1000,
  });

  const alerts = data?.alerts || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Low Stock Alerts</h1>
          <p className="text-gray-500 text-sm">{alerts.length} products below minimum</p>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <div className="card p-12 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 dark:text-white">All stock levels are healthy!</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((product) => (
            <div key={product._id} className={`card p-4 border-l-4 ${product.currentStock === 0 ? 'border-l-red-500' : 'border-l-orange-500'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{product.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku} • {product.category}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${product.currentStock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {product.currentStock} {product.unit}
                  </p>
                  <p className="text-xs text-gray-400">Min: {product.minStockLevel} {product.unit}</p>
                  {product.currentStock === 0 && <span className="badge badge-red mt-1">Out of Stock</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
