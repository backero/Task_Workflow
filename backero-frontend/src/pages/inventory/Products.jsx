import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExclamationTriangleIcon, MagnifyingGlassIcon, QrCodeIcon, TrashIcon } from '@heroicons/react/24/outline';
import ImportButton from '../../components/common/ImportButton';
import api from '../../api/axios';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../store/useAuthStore';
import QRLabelModal from '../../components/inventory/QRLabelModal';
import QRScannerModal from '../../components/inventory/QRScannerModal';

// ── Add / Edit Modal ───────────────────────────────────────────────────────

const FORM_TABS = [
  { id: 'basic',   label: 'Basic Info',  icon: '📋' },
  { id: 'pricing', label: 'Pricing',     icon: '💰' },
  { id: 'stock',   label: 'Stock',       icon: '📦' },
];

const CATEGORIES = [
  'Hair Care','Skin Care','Face Care','Body Care','Oral Care',
  "Men's Care",'Baby Care','Sun Care','Makeup','Fragrance',
  'Wellness','Professional','Electronics','Apparel','Other',
];

const PRODUCT_TYPES = [
  'Shampoo','Conditioner','Hair Oil','Serum','Cream','Lotion',
  'Face Wash','Mask','Scrub','Toner','Moisturizer','Cleanser',
  'Soap','Body Wash','Sunscreen','Lip Balm','Deodorant','Perfume',
  'Toothpaste','Hair Spray','Other',
];

function ProductFormModal({ onClose, onSuccess, initial }) {
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [purchaseAmt, setPurchaseAmt] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      name:              initial?.name || '',
      sku:               initial?.sku || '',
      category:          initial?.category || '',
      subCategory:       initial?.subCategory || '',
      productType:       initial?.productType || '',
      unit:              initial?.unit || 'pcs',
      description:       initial?.description || '',
      hsnCode:           initial?.hsnCode || '',
      batchNumber:       initial?.batchNumber || '',
      gstRate:           initial?.gstRate ?? 18,
      costPrice:         initial?.costPrice || '',
      sellingPrice:      initial?.sellingPrice || '',
      mrp:               initial?.mrp || '',
      minStockLevel:     initial?.minStockLevel || 0,
      currentStock:      initial?.currentStock || 0,
      warehouseLocation: initial?.warehouseLocation || '',
      certifications:    initial?.certifications || '',
      storageConditions: initial?.storageConditions || '',
      barcode:           initial?.barcode || '',
      shelfLife:         initial?.shelfLife || '',
      imageUrl:          initial?.images?.[0] || '',
    },
  });

  const watchedUnit = watch('unit');
  const watchedImageUrl = watch('imageUrl');
  const isWeightUnit = ['g','kg','ml','litre','L'].includes(watchedUnit);
  const calcPerUnit = purchaseAmt && purchaseQty && Number(purchaseQty) > 0
    ? Number(purchaseAmt) / Number(purchaseQty) : null;

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const { imageUrl, ...rest } = data;
      const payload = { ...rest, isRawMaterial: false, isFinishedGood: true, isSellable: true, images: imageUrl ? [imageUrl] : (initial?.images || []) };
      if (initial?._id) {
        await api.put(`/inventory/products/${initial._id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/inventory/products', payload);
        toast.success('Product added');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-xl card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">
            {initial ? `Edit — ${initial.name}` : 'Add New Product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6">
          {FORM_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">

            {/* Tab: Basic Info */}
            {activeTab === 'basic' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Product Name <span className="text-red-400">*</span></label>
                    <input {...register('name', { required: true })} className="input" placeholder="e.g. Turmeric Shampoo" />
                  </div>
                  {!initial && (
                    <div>
                      <label className="label">SKU <span className="text-red-400">*</span></label>
                      <input {...register('sku', { required: true })} className="input" placeholder="e.g. FG-HC-001" />
                    </div>
                  )}
                  {initial && (
                    <div>
                      <label className="label">SKU</label>
                      <input value={initial.sku} readOnly className="input opacity-50 cursor-not-allowed" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Category <span className="text-red-400">*</span></label>
                    <select {...register('category', { required: true })} className="input">
                      <option value="">Select</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sub-Category</label>
                    <input {...register('subCategory')} className="input" placeholder="e.g. Shampoo" />
                  </div>
                  <div>
                    <label className="label">Product Type</label>
                    <select {...register('productType')} className="input">
                      <option value="">Select</option>
                      {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Unit <span className="text-red-400">*</span></label>
                    <select {...register('unit', { required: true })} className="input">
                      {['pcs','kg','g','litre','ml','L','box','pack','set','pair'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Shelf Life (months)</label>
                    <input {...register('shelfLife')} type="number" min="0" className="input" placeholder="e.g. 36" />
                  </div>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea {...register('description')} className="input resize-none" rows={2} placeholder="Key claims, benefits..." />
                </div>
                <div>
                  <label className="label">Product Image URL</label>
                  <input {...register('imageUrl')} className="input" placeholder="https://example.com/product.jpg" />
                  {watchedImageUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden bg-gray-700/20 h-32 flex items-center justify-center">
                      <img src={watchedImageUrl} alt="Preview" className="max-h-full max-w-full object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tab: Pricing */}
            {activeTab === 'pricing' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">HSN Code</label>
                    <input {...register('hsnCode')} className="input" placeholder="e.g. 33049910" />
                  </div>
                  <div>
                    <label className="label">GST Rate (%)</label>
                    <select {...register('gstRate')} className="input">
                      {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>

                {/* Purchase Price Calculator */}
                {isWeightUnit && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Purchase Price Calculator</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">Total Amount Paid (₹)</label>
                        <input type="number" min="0" className="input" placeholder="e.g. 500" value={purchaseAmt} onChange={e => setPurchaseAmt(e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">Total Quantity ({watchedUnit})</label>
                        <input type="number" min="0" className="input" placeholder="e.g. 1000" value={purchaseQty} onChange={e => setPurchaseQty(e.target.value)} />
                      </div>
                    </div>
                    {calcPerUnit !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-blue-300">= ₹{calcPerUnit.toFixed(4)} per {watchedUnit}</span>
                        <button type="button" onClick={() => setValue('costPrice', parseFloat(calcPerUnit.toFixed(4)))} className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">Apply as Cost Price</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Cost Price (₹)</label>
                    <input {...register('costPrice')} type="number" min="0" step="0.0001" className="input" />
                  </div>
                  <div>
                    <label className="label">Selling Price (₹)</label>
                    <input {...register('sellingPrice')} type="number" min="0" step="0.01" className="input" />
                  </div>
                  <div>
                    <label className="label">MRP (₹)</label>
                    <input {...register('mrp')} type="number" min="0" step="0.01" className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Barcode</label>
                  <input {...register('barcode')} className="input" placeholder="e.g. 8901234567890" />
                </div>
              </>
            )}

            {/* Tab: Stock */}
            {activeTab === 'stock' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Min Stock Level</label>
                    <input {...register('minStockLevel')} type="number" min="0" className="input" />
                  </div>
                  {!initial && (
                    <div>
                      <label className="label">Opening Stock</label>
                      <input {...register('currentStock')} type="number" min="0" className="input" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Warehouse Location</label>
                  <input {...register('warehouseLocation')} className="input" placeholder="e.g. Shelf A-3" />
                </div>
                <div>
                  <label className="label">Batch Number</label>
                  <input {...register('batchNumber')} className="input" placeholder="e.g. BATCH-2026-01" />
                </div>
                <div>
                  <label className="label">Certifications</label>
                  <input {...register('certifications')} className="input" placeholder="e.g. Organic, GMP, Cruelty-Free" />
                </div>
                <div>
                  <label className="label">Storage Conditions</label>
                  <input {...register('storageConditions')} className="input" placeholder="e.g. Store in cool, dry place" />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <div className="flex gap-1">
              {FORM_TABS.map(t => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`w-2 h-2 rounded-full transition-colors ${activeTab === t.id ? 'bg-indigo-500' : 'bg-gray-600 hover:bg-gray-500'}`} />
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              {activeTab !== 'stock' ? (
                <button type="button" onClick={() => {
                  const idx = FORM_TABS.findIndex(t => t.id === activeTab);
                  setActiveTab(FORM_TABS[idx + 1].id);
                }} className="btn btn-primary">Next →</button>
              ) : (
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? 'Saving…' : initial ? 'Update Product' : 'Add Product'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Stock Adjust Modal ─────────────────────────────────────────────────────

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative card w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Stock Movement</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">&times;</button>
        </div>
        <p className="text-sm text-gray-400">{product.name} · <span className="font-semibold text-gray-800 dark:text-gray-200">{product.currentStock} {product.unit}</span> current</p>
        <div className="flex gap-2">
          <button onClick={() => setType('IN')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors', type === 'IN' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-600 text-gray-400 hover:border-gray-500')}>Stock In</button>
          <button onClick={() => setType('OUT')} className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors', type === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'border-gray-600 text-gray-400 hover:border-gray-500')}>Stock Out</button>
        </div>
        <div>
          <label className="label">Quantity ({product.unit})</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="input" placeholder="Enter quantity" />
        </div>
        {type === 'IN' && (
          <div>
            <label className="label">Batch Number</label>
            <input type="text" value={batch} onChange={e => setBatch(e.target.value)} className="input" placeholder="e.g. BATCH-2026-01" />
          </div>
        )}
        <div>
          <label className="label">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Reason..." />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn btn-ghost flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn btn-primary flex-1">{loading ? 'Processing…' : 'Confirm'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' });
}

// ── Product Table ──────────────────────────────────────────────────────────

function ProductTable({ products, canWrite, canDelete, onStock, onEdit, onQr, onDelete }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
          <tr>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Product</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">SKU</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Category</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Stock</th>
            <th className="text-right py-3 px-4 text-gray-500 font-medium">Price & GST</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
            <th className="text-center py-3 px-4 text-gray-500 font-medium">Last Stock In</th>
            {canWrite && <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
          {products.map(product => {
            const isLow = product.currentStock <= product.minStockLevel;
            const isOut = product.currentStock === 0;
            return (
              <tr key={product._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700/60" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center text-lg flex-shrink-0">🧴</div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.productType || product.subCategory || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{product.sku}</td>
                <td className="py-3 px-4">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded-full">{product.category}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={clsx('font-semibold', isOut ? 'text-red-500' : isLow ? 'text-orange-500' : 'text-gray-900 dark:text-white')}>
                    {product.currentStock}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">{product.unit}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  {product.mrp > 0 && <p className="text-gray-900 dark:text-white font-medium">MRP ₹{product.mrp?.toLocaleString('en-IN')}</p>}
                  <p className="text-xs text-gray-400">
                    SP: ₹{product.sellingPrice?.toLocaleString('en-IN') || '—'}
                    {product.gstRate != null && <span className="ml-1 text-blue-500">GST {product.gstRate}%</span>}
                  </p>
                </td>
                <td className="py-3 px-4 text-center">
                  {isOut
                    ? <span className="badge badge-red">Out of Stock</span>
                    : isLow
                    ? <span className="badge badge-orange">Low Stock</span>
                    : <span className="badge badge-green">In Stock</span>}
                </td>
                <td className="py-3 px-4 text-center text-xs text-gray-500">
                  {product.lastStockIn ? timeAgo(product.lastStockIn) : <span className="text-gray-300">—</span>}
                </td>
                {canWrite && (
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => onStock(product)} className="btn-secondary text-xs px-2 py-1">Stock</button>
                      <button onClick={() => onQr(product)} className="btn-ghost text-xs px-2 py-1" title="QR Label"><QrCodeIcon className="w-4 h-4" /></button>
                      <button onClick={() => onEdit(product)} className="btn-ghost text-xs px-2 py-1">Edit</button>
                      {canDelete && (
                        <button onClick={() => onDelete(product)} className="btn-ghost text-xs px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
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

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Products() {
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [qrProduct, setQrProduct] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const { isManagerOrAbove, hasInventoryWrite } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'products', 'finished', search, lowStockOnly],
    queryFn: () =>
      api.get('/inventory/products', {
        params: {
          search: search || undefined,
          isLowStock: lowStockOnly || undefined,
          isRawMaterial: false,
          limit: 100,
        },
      }).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const allProducts = (data?.data?.products || data?.data || []).filter(p => !p.isRawMaterial);

  const products = useMemo(() => {
    let list = allProducts;
    if (filterCat) list = list.filter(p => p.category === filterCat);
    return list;
  }, [allProducts, filterCat]);

  const categories = useMemo(() => [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort(), [allProducts]);

  const stats = useMemo(() => ({
    total:    allProducts.length,
    inStock:  allProducts.filter(p => p.currentStock > (p.minStockLevel || 0)).length,
    lowStock: allProducts.filter(p => p.currentStock > 0 && p.currentStock <= (p.minStockLevel || 0)).length,
    outStock: allProducts.filter(p => p.currentStock === 0).length,
    value:    allProducts.reduce((s, p) => s + ((p.currentStock || 0) * (p.costPrice || 0)), 0),
  }), [allProducts]);

  const lowStockCount = stats.lowStock + stats.outStock;

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
          <h1 className="page-title">Products</h1>
          <p className="text-gray-500 text-sm">{products.length} products · {lowStockCount} low stock</p>
        </div>
        {hasInventoryWrite() && (
          <div className="flex items-center gap-2">
            <ImportButton
              templateUrl="/inventory/import/template"
              importUrl="/inventory/import"
              onSuccess={invalidate}
              label="Import"
            />
            <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
              + Add Product
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-xl flex-shrink-0">📦</div>
          <div><p className="text-xs text-gray-400 font-medium">Total</p><p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-xl flex-shrink-0">✅</div>
          <div><p className="text-xs text-gray-400 font-medium">In Stock</p><p className="text-xl font-bold text-emerald-600">{stats.inStock}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
          <div><p className="text-xs text-gray-400 font-medium">Low Stock</p><p className="text-xl font-bold text-orange-500">{stats.lowStock}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center text-xl flex-shrink-0">🔴</div>
          <div><p className="text-xs text-gray-400 font-medium">Out of Stock</p><p className="text-xl font-bold text-red-500">{stats.outStock}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-xl flex-shrink-0">₹</div>
          <div><p className="text-xs text-gray-400 font-medium">Inventory Value</p><p className="text-lg font-bold text-indigo-500">₹{stats.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products, SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input w-44 text-sm">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setLowStockOnly(p => !p)}
          className={clsx('btn-secondary gap-2', lowStockOnly && 'bg-red-50 text-red-600 border-red-200')}
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Low Stock Only
        </button>
      </div>

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
          onDelete={setDeleteProduct}
        />
      )}

      {/* Modals */}
      {(showForm || editProduct) && (
        <ProductFormModal
          initial={editProduct}
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

      <button
        onClick={() => setShowScanner(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-3 rounded-full shadow-lg transition-colors"
        title="Scan QR Code"
      >
        <QrCodeIcon className="w-5 h-5" />
        <span className="text-sm hidden sm:inline">Scan QR</span>
      </button>

      {deleteProduct && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={() => setDeleteProduct(null)}>
          <div className="relative card w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Delete Product?</h3>
                <p className="text-sm text-gray-500 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-[#0f1a2e] px-4 py-3">
              <p className="font-semibold text-gray-900 dark:text-white">{deleteProduct.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">SKU: {deleteProduct.sku} · Stock: {deleteProduct.currentStock} {deleteProduct.unit}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProduct(null)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
