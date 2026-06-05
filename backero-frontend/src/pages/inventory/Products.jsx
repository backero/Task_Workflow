import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, QrCodeIcon } from '@heroicons/react/24/outline';
import ImportButton from '../../components/common/ImportButton';
import api from '../../api/axios';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../store/useAuthStore';
import QRLabelModal from '../../components/inventory/QRLabelModal';
import QRScannerModal from '../../components/inventory/QRScannerModal';

function ProductForm({ onClose, onSuccess, initial }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: initial });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (initial?._id) {
        await api.put(`/inventory/products/${initial._id}`, data);
        toast.success('Product updated');
      } else {
        await api.post('/inventory/products', data);
        toast.success('Product created');
      }
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
      <div className="relative card w-full max-w-xl shadow-modal max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h3 className="font-bold text-gray-900 dark:text-white">{initial ? 'Edit Product' : 'Add Product'}</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Product Name *</label>
              <input {...register('name', { required: true })} className="input" placeholder="Product name" />
            </div>
            <div>
              <label className="label">SKU *</label>
              <input {...register('sku', { required: true })} className="input" placeholder="SKU-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category *</label>
              <input {...register('category', { required: true })} className="input" placeholder="Electronics" />
            </div>
            <div>
              <label className="label">Unit *</label>
              <select {...register('unit', { required: true })} className="input">
                {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'set', 'pair'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Cost Price (₹)</label>
              <input {...register('costPrice')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Selling Price (₹)</label>
              <input {...register('sellingPrice')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">MRP (₹)</label>
              <input {...register('mrp')} type="number" min="0" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min Stock Level</label>
              <input {...register('minStockLevel')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Initial Stock</label>
              <input {...register('currentStock')} type="number" min="0" className="input" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register('isRawMaterial')} type="checkbox" className="rounded" />
              <span className="text-sm">Raw Material</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register('isFinishedGood')} type="checkbox" className="rounded" defaultChecked />
              <span className="text-sm">Finished Good</span>
            </label>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">{loading ? 'Saving...' : 'Save Product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockAdjustModal({ product, onClose, onSuccess }) {
  const [qty, setQty] = useState('');
  const [type, setType] = useState('IN');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter valid quantity');
    setLoading(true);
    try {
      if (type === 'IN') {
        await api.post('/inventory/stock-in', { productId: product._id, quantity: Number(qty), notes });
      } else {
        await api.post('/inventory/stock-out', { productId: product._id, quantity: Number(qty), notes });
      }
      toast.success(`Stock ${type === 'IN' ? 'added' : 'deducted'}`);
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
      <div className="relative card w-full max-w-sm shadow-modal p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">Stock Movement - {product.name}</h3>
        <p className="text-sm text-gray-500">Current: {product.currentStock} {product.unit}</p>
        <div className="flex gap-2">
          <button onClick={() => setType('IN')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2', type === 'IN' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600')}>Stock In</button>
          <button onClick={() => setType('OUT')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2', type === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600')}>Stock Out</button>
        </div>
        <div>
          <label className="label">Quantity ({product.unit})</label>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="input" placeholder="Enter quantity" />
        </div>
        <div>
          <label className="label">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Reason..." />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 justify-center">{loading ? 'Processing...' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [qrProduct, setQrProduct] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'products', search, lowStockOnly],
    queryFn: () => api.get('/inventory/products', { params: { search: search || undefined, isLowStock: lowStockOnly || undefined, limit: 50 } }).then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const products = data?.data || [];
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStockLevel).length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products & Inventory</h1>
          <p className="text-gray-500 text-sm">{data?.pagination?.total || 0} products • {lowStockCount} low stock</p>
        </div>
        {isManagerOrAbove() && (
          <div className="flex items-center gap-2">
            <ImportButton
              templateUrl="/inventory/import/template"
              importUrl="/inventory/import"
              onSuccess={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
              label="Import"
            />
            <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
              <PlusIcon className="w-4 h-4" /> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search products, SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
        </div>
        <button
          onClick={() => setLowStockOnly((p) => !p)}
          className={clsx('btn-secondary gap-2', lowStockOnly && 'bg-red-50 text-red-600 border-red-200')}
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Low Stock Only
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
              <tr>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Product</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">SKU</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Stock</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Min Level</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Price</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
                {isManagerOrAbove() && <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
              {products.map((product) => {
                const isLow = product.currentStock <= product.minStockLevel;
                const isOut = product.currentStock === 0;
                return (
                  <tr key={product._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.category}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-500 font-mono text-xs">{product.sku}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={clsx('font-semibold', isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-gray-900 dark:text-white')}>
                        {product.currentStock} {product.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500">{product.minStockLevel} {product.unit}</td>
                    <td className="py-3 px-4 text-right">
                      <p className="text-gray-900 dark:text-white">₹{product.sellingPrice?.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-400">Cost: ₹{product.costPrice?.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isOut ? <span className="badge badge-red">Out of Stock</span>
                        : isLow ? <span className="badge badge-orange">Low Stock</span>
                        : <span className="badge badge-green">In Stock</span>}
                    </td>
                    {isManagerOrAbove() && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setStockProduct(product)} className="btn-secondary text-xs px-2 py-1">Stock</button>
                          <button onClick={() => setQrProduct(product)} className="btn-ghost text-xs px-2 py-1" title="Print QR Label">
                            <QrCodeIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditProduct(product)} className="btn-ghost text-xs px-2 py-1">Edit</button>
                        </div>
                      </td>
                    )}
                    {!isManagerOrAbove() && <td />}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="text-center py-12 text-gray-400">No products found</div>
          )}
        </div>
      )}

      {(showForm || editProduct) && (
        <ProductForm
          initial={editProduct}
          onClose={() => { setShowForm(false); setEditProduct(null); }}
          onSuccess={() => { setShowForm(false); setEditProduct(null); qc.invalidateQueries({ queryKey: ['inventory'] }); }}
        />
      )}

      {stockProduct && (
        <StockAdjustModal
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onSuccess={() => { setStockProduct(null); qc.invalidateQueries({ queryKey: ['inventory'] }); }}
        />
      )}

      {qrProduct && (
        <QRLabelModal
          products={[qrProduct]}
          onClose={() => setQrProduct(null)}
        />
      )}

      {showScanner && (
        <QRScannerModal
          onClose={() => setShowScanner(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
        />
      )}

      {/* Floating Scan FAB */}
      {isManagerOrAbove() && (
        <button
          onClick={() => setShowScanner(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-3 rounded-full shadow-lg transition-colors"
          title="Scan QR Code"
        >
          <QrCodeIcon className="w-5 h-5" />
          <span className="text-sm hidden sm:inline">Scan QR</span>
        </button>
      )}
    </div>
  );
}
