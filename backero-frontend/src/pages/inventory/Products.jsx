import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, QrCodeIcon, BeakerIcon, TrashIcon } from '@heroicons/react/24/outline';
import ImportButton from '../../components/common/ImportButton';
import api from '../../api/axios';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../store/useAuthStore';
import QRLabelModal from '../../components/inventory/QRLabelModal';
import QRScannerModal from '../../components/inventory/QRScannerModal';

const WEIGHT_UNITS = ['g', 'kg', 'ml', 'litre'];

function ProductForm({ onClose, onSuccess, initial, forceRawMaterial }) {
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      ...initial,
      isRawMaterial: forceRawMaterial ? true : (initial?.isRawMaterial ?? false),
      isFinishedGood: forceRawMaterial ? false : (initial?.isFinishedGood ?? true),
    },
  });
  const [loading, setLoading] = useState(false);
  const [purchaseAmt, setPurchaseAmt] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const watchedUnit = watch('unit', initial?.unit || 'pcs');
  const isWeightUnit = WEIGHT_UNITS.includes(watchedUnit);
  const calcPerUnit = purchaseAmt && purchaseQty && Number(purchaseQty) > 0
    ? (Number(purchaseAmt) / Number(purchaseQty))
    : null;

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (forceRawMaterial) {
        data.isRawMaterial = true;
        data.isFinishedGood = false;
      }
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
          <h3 className="font-bold text-gray-900 dark:text-white">
            {initial ? 'Edit' : 'Add'} {forceRawMaterial ? 'Raw Material' : 'Product'}
          </h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name *</label>
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
                {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'set', 'pair'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">HSN Code</label>
              <input {...register('hsnCode')} className="input" placeholder="e.g. 33049910" />
            </div>
            <div>
              <label className="label">Batch Number</label>
              <input {...register('batchNumber')} className="input" placeholder="e.g. BATCH-2026-01" />
            </div>
          </div>
          {isWeightUnit && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Purchase Price Calculator</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Total Amount Paid (₹)</label>
                  <input
                    type="number" min="0" className="input"
                    placeholder="e.g. 500"
                    value={purchaseAmt}
                    onChange={(e) => setPurchaseAmt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Total Quantity ({watchedUnit})</label>
                  <input
                    type="number" min="0" className="input"
                    placeholder="e.g. 1000"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                  />
                </div>
              </div>
              {calcPerUnit !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-blue-800 dark:text-blue-200">
                    = ₹{calcPerUnit.toFixed(4)} per {watchedUnit}
                  </span>
                  <button
                    type="button"
                    onClick={() => setValue('costPrice', parseFloat(calcPerUnit.toFixed(4)))}
                    className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Apply as Cost Price
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Cost Price {isWeightUnit ? `(₹ per ${watchedUnit})` : '(₹)'}</label>
              <input {...register('costPrice')} type="number" min="0" step="0.0001" className="input" />
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
              <label className="label">GST Rate (%)</label>
              <select {...register('gstRate')} className="input">
                {[0, 5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Min Stock Level</label>
              <input {...register('minStockLevel')} type="number" min="0" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Initial Stock</label>
            <input {...register('currentStock')} type="number" min="0" className="input" />
          </div>
          {!forceRawMaterial && (
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
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving...' : 'Save'}
            </button>
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
  const [batch, setBatch] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter valid quantity');
    setLoading(true);
    try {
      if (type === 'IN') {
        await api.post('/inventory/stock-in', { productId: product._id, quantity: Number(qty), notes, batch: batch || undefined });
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
        <h3 className="font-bold text-gray-900 dark:text-white">Stock Movement — {product.name}</h3>
        <p className="text-sm text-gray-500">
          Current stock: <span className="font-semibold text-gray-800 dark:text-white">{product.currentStock}</span> {product.unit}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setType('IN')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2', type === 'IN' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600')}>Stock In</button>
          <button onClick={() => setType('OUT')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2', type === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600')}>Stock Out</button>
        </div>
        <div>
          <label className="label">Quantity ({product.unit})</label>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="input" placeholder="Enter quantity" />
        </div>
        {type === 'IN' && (
          <div>
            <label className="label">Batch Number</label>
            <input type="text" value={batch} onChange={(e) => setBatch(e.target.value)} className="input" placeholder="e.g. BATCH-2026-01" />
          </div>
        )}
        <div>
          <label className="label">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Reason..." />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UseRawMaterialModal({ product, onClose, onSuccess }) {
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter valid quantity');
    if (Number(qty) > product.currentStock) return toast.error(`Only ${product.currentStock} ${product.unit} available`);
    setLoading(true);
    try {
      await api.post('/inventory/stock-out', {
        productId: product._id,
        quantity: Number(qty),
        type: 'PRODUCTION_USE',
        notes: notes || 'Production usage',
      });
      toast.success('Usage recorded — stock reduced');
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
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Record Production Usage</h3>
          <p className="text-sm text-gray-500 mt-0.5">{product.name}</p>
        </div>
        <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-orange-700 dark:text-orange-300">Available stock</span>
          <span className="font-bold text-orange-700 dark:text-orange-300">{product.currentStock} {product.unit}</span>
        </div>
        <div>
          <label className="label">Quantity Used ({product.unit})</label>
          <input
            type="number"
            min="1"
            max={product.currentStock}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input"
            placeholder="Enter quantity used"
          />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="e.g. Batch PO-2026-001"
          />
        </div>
        {qty && Number(qty) > 0 && Number(qty) <= product.currentStock && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
              Stock after usage: <span className="font-semibold text-gray-800 dark:text-white">{product.currentStock - Number(qty)} {product.unit}</span>
            </p>
            {product.costPrice > 0 && (
              <p className="text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-3 py-2 text-orange-700 dark:text-orange-300">
                Estimated material cost: <span className="font-bold">₹{(Number(qty) * product.costPrice).toFixed(2)}</span>
                <span className="ml-1 opacity-70">({Number(qty)} {product.unit} × ₹{product.costPrice} per {product.unit})</span>
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg flex-1 justify-center transition-colors">
            {loading ? 'Recording...' : 'Record Usage'}
          </button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(date) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function ProductTable({ products, canWrite, canDelete, onStock, onEdit, onQr, onUse, onDelete, isRawMaterial }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
          <tr>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Product</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">SKU</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">HSN Code</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Stock</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Min Level</th>
            <th className="text-right py-3 px-4 text-gray-500 font-medium">{isRawMaterial ? 'Cost / Unit' : 'Price & GST'}</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Last Stock In</th>
            {canWrite && <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>}
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
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{product.sku}</td>
                <td className="py-3 px-4 text-xs text-gray-500">{product.hsnCode || <span className="text-gray-300">—</span>}</td>
                <td className="py-3 px-4 text-center">
                  <span className={clsx('font-semibold', isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-gray-900 dark:text-white')}>
                    {product.currentStock}
                  </span>
                </td>
                <td className="py-3 px-4 text-center text-gray-500">
                  {product.minStockLevel}
                  <span className="text-xs text-gray-400 ml-1">{product.unit}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  {isRawMaterial ? (
                    product.costPrice > 0 ? (
                      <p className="font-semibold text-gray-900 dark:text-white">
                        ₹{product.costPrice % 1 === 0 ? product.costPrice.toLocaleString('en-IN') : product.costPrice.toFixed(4)}
                        <span className="text-xs text-gray-400 font-normal ml-1">/ {product.unit}</span>
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )
                  ) : (
                    <>
                      <p className="text-gray-900 dark:text-white">₹{product.sellingPrice?.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-400">
                        Cost: ₹{product.costPrice?.toLocaleString('en-IN')}
                        {product.gstRate != null && <span className="ml-1 text-blue-500">GST {product.gstRate}%</span>}
                      </p>
                    </>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {isOut
                    ? <span className="badge badge-red">Out of Stock</span>
                    : isLow
                    ? <span className="badge badge-orange">Low Stock</span>
                    : <span className="badge badge-green">In Stock</span>}
                </td>
                <td className="py-3 px-4 text-center">
                  {product.lastStockIn
                    ? <span className="text-xs text-gray-500">{timeAgo(product.lastStockIn)}</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                {canWrite && (
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      {isRawMaterial ? (
                        <>
                          <button
                            onClick={() => onStock(product)}
                            className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50"
                          >
                            Add Stock
                          </button>
                          <button
                            onClick={() => onUse(product)}
                            className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors font-medium"
                          >
                            Use
                          </button>
                        </>
                      ) : (
                        <button onClick={() => onStock(product)} className="btn-secondary text-xs px-2 py-1">Stock</button>
                      )}
                      <button onClick={() => onQr(product)} className="btn-ghost text-xs px-2 py-1" title="Print QR Label">
                        <QrCodeIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => onEdit(product)} className="btn-ghost text-xs px-2 py-1">Edit</button>
                      {canDelete && (
                        <button
                          onClick={() => onDelete(product)}
                          className="btn-ghost text-xs px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
                {!canWrite && <td />}
              </tr>
            );
          })}
        </tbody>
      </table>
      {products.length === 0 && (
        <div className="text-center py-12 text-gray-400">No products found</div>
      )}
    </div>
  );
}

export default function Products() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTab = pathname === '/inventory/rawmaterials' ? 'rawmaterials' : 'products';
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [useProduct, setUseProduct] = useState(null);
  const [qrProduct, setQrProduct] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { isManagerOrAbove, hasInventoryWrite } = useAuthStore();
  const qc = useQueryClient();

  const isRawTab = activeTab === 'rawmaterials';

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'products', activeTab, search, lowStockOnly],
    queryFn: () =>
      api.get('/inventory/products', {
        params: {
          search: search || undefined,
          isLowStock: lowStockOnly || undefined,
          isRawMaterial: isRawTab ? true : undefined,
          limit: 50,
        },
      }).then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const products = data?.data || [];
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStockLevel).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory'] });

  const handleDelete = async () => {
    if (!deleteProduct) return;
    setDeleting(true);
    try {
      await api.delete(`/inventory/products/${deleteProduct._id}`);
      toast.success(`${deleteProduct.name} deleted`);
      setDeleteProduct(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products & Inventory</h1>
          <p className="text-gray-500 text-sm">{data?.pagination?.total || 0} products • {lowStockCount} low stock</p>
        </div>
        {hasInventoryWrite() && (
          <div className="flex items-center gap-2">
            {!isRawTab && (
              <ImportButton
                templateUrl="/inventory/import/template"
                importUrl="/inventory/import"
                onSuccess={invalidate}
                label="Import"
              />
            )}
            <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
              <PlusIcon className="w-4 h-4" />
              {isRawTab ? 'Add Raw Material' : 'Add Product'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-[#0f1a2e] rounded-lg w-fit">
        <button
          onClick={() => { navigate('/inventory/products'); setSearch(''); setLowStockOnly(false); }}
          className={clsx(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            !isRawTab
              ? 'bg-white dark:bg-[#17263d] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          Finished Products
        </button>
        <button
          onClick={() => { navigate('/inventory/rawmaterials'); setSearch(''); setLowStockOnly(false); }}
          className={clsx(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2',
            isRawTab
              ? 'bg-white dark:bg-[#17263d] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          <BeakerIcon className="w-4 h-4" />
          Raw Materials
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={isRawTab ? 'Search raw materials...' : 'Search products, SKU...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <button
          onClick={() => setLowStockOnly((p) => !p)}
          className={clsx('btn-secondary gap-2', lowStockOnly && 'bg-red-50 text-red-600 border-red-200')}
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Low Stock Only
        </button>
      </div>

      {isRawTab && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-800 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          <strong>Raw Materials</strong> — Use <span className="font-semibold">Add Stock</span> when materials arrive. Use <span className="font-semibold">Use</span> to record production consumption (stock reduces automatically).
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ProductTable
          products={products}
          canWrite={hasInventoryWrite()}
          canDelete={isManagerOrAbove()}
          onStock={setStockProduct}
          onEdit={setEditProduct}
          onQr={setQrProduct}
          onUse={setUseProduct}
          onDelete={setDeleteProduct}
          isRawMaterial={isRawTab}
        />
      )}

      {(showForm || editProduct) && (
        <ProductForm
          initial={editProduct}
          forceRawMaterial={isRawTab && !editProduct}
          onClose={() => { setShowForm(false); setEditProduct(null); }}
          onSuccess={() => { setShowForm(false); setEditProduct(null); invalidate(); }}
        />
      )}

      {stockProduct && (
        <StockAdjustModal
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onSuccess={() => { setStockProduct(null); invalidate(); }}
        />
      )}

      {useProduct && (
        <UseRawMaterialModal
          product={useProduct}
          onClose={() => setUseProduct(null)}
          onSuccess={() => { setUseProduct(null); invalidate(); }}
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
          onSuccess={invalidate}
        />
      )}

      {hasInventoryWrite() && (
        <button
          onClick={() => setShowScanner(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-3 rounded-full shadow-lg transition-colors"
          title="Scan QR Code"
        >
          <QrCodeIcon className="w-5 h-5" />
          <span className="text-sm hidden sm:inline">Scan QR</span>
        </button>
      )}

      {deleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60" onClick={() => setDeleteProduct(null)} />
          <div className="relative card w-full max-w-sm shadow-modal p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Delete {isRawTab ? 'Raw Material' : 'Product'}?</h3>
                <p className="text-sm text-gray-500 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-[#0f1a2e] px-4 py-3">
              <p className="font-semibold text-gray-900 dark:text-white">{deleteProduct.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">SKU: {deleteProduct.sku} · Stock: {deleteProduct.currentStock} {deleteProduct.unit}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProduct(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 justify-center bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
