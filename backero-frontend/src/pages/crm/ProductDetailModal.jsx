import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import QRCode from 'react-qr-code';
import api from '../../api/axios';
import RDPriceCalculator from '../production/RDPriceCalculator';
import {
  Package, Pencil, Trash2, X, Camera, Save, Clipboard, Ruler, IndianRupee, Calendar,
  Award, Calculator, QrCode, Printer, Video, Mic, FileText, Paperclip, Microscope, Factory,
  FileEdit, Square, Clock, ScrollText, Minimize2, Maximize2
} from 'lucide-react';

export const CATEGORIES = ['Hair Care', 'Skin Care', 'Face Care', 'Body Care', 'Oral Care', "Men's Care", 'Baby Care', 'Sun Care', 'Makeup', 'Fragrance', 'Wellness', 'Professional', 'Other'];
export const PRODUCT_TYPES = ['Shampoo', 'Conditioner', 'Hair Oil', 'Serum', 'Cream', 'Lotion', 'Face Wash', 'Mask', 'Scrub', 'Toner', 'Moisturizer', 'Cleanser', 'Soap', 'Body Wash', 'Sunscreen', 'Lip Balm', 'Deodorant', 'Perfume', 'Other'];
export const UNITS = ['ml', 'g', 'kg', 'L', 'pcs', 'oz'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const STATUSES = ['Active', 'Inactive', 'Draft', 'Archived'];
const TABS = ['Overview', 'Formulation & Procedure', 'R&D Price Calculator', 'R&D & Overheads', 'Costing', 'Marketplace', 'QR Code', 'Documents', 'History'];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function calcFormCost(p) {
  if (!p?.formulation?.rows?.length) return 0;
  const refWeight = Number(p.formulation.refWeight) || 100;
  return p.formulation.rows.reduce((sum, r) => {
    const costPrice = r.costPerKg || 0;
    const qty = refWeight * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
    if (costPrice === 0 || qty === 0) return sum;
    return sum + (costPrice * qty);
  }, 0);
}

function calcOverheadBreakdown(p) {
  const formCost = calcFormCost(p);
  const packCost = p.costing?.packagingCost || 0;
  const saAmount = formCost * ((p.standardAssumptions?.adminPct || 0) / 100);
  const overheadPerUnit = formCost * ((p.productionOverhead?.percentage || 0) / 100);
  const rndPerUnit = p.rnd?.costPerUnit || 0;
  return { formCost, packCost, saAmount, overheadPerUnit, rndPerUnit };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL MODAL - COMPLETE MIRROR OF PRODUCT CATALOG
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default function ProductDetailModal({ productId, onClose, refetchLead }) {
  const qc = useQueryClient();

  // Load product detail
  const { data: detailData, isLoading, refetch } = useQuery({
    queryKey: ['catalog-detail', productId],
    queryFn: () => api.get(`/catalog/products/${productId}`).then(r => r.data),
    enabled: !!productId,
  });
  const detail = detailData?.product;

  // UI state
  const [activeTab, setActiveTab] = useState('Overview');
  const [detailMaximized, setDetailMaximized] = useState(false);

  // Form state for editing
  const [form, setForm] = useState({
    rndDoc: { text: '' },
    procedure: { text: '' },
    productionOverhead: { percentage: 0 },
    rnd: { lifecycle: 1000 },
    marketplace: { platforms: [] },
  });

  // Sync form when product loads
  useEffect(() => {
    if (detail) {
      setForm({
        rndDoc: detail.rndDoc || { text: '' },
        procedure: detail.procedure || { text: '' },
        productionOverhead: detail.productionOverhead || { percentage: 0 },
        rnd: detail.rnd || { lifecycle: 1000 },
        marketplace: detail.marketplace || { platforms: [] },
      });
    }
  }, [detail?._id]);

  // Detect updates from ProductCatalogPage
  useEffect(() => {
    if (sessionStorage.getItem('productUpdated') === 'true') {
      refetch();
      if (refetchLead) refetchLead();
      sessionStorage.removeItem('productUpdated');
    }
  }, [refetch, refetchLead]);

  // ════ MUTATIONS ════
  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/catalog/products/${productId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      qc.invalidateQueries({ queryKey: ['catalog-detail', productId] });
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      sessionStorage.setItem('productUpdated', 'true');
      sessionStorage.setItem('updatedProductId', productId);
      toast.success('Saved');
      refetch();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/catalog/products/${productId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Deleted');
      onClose();
    },
    onError: () => toast.error('Failed to delete'),
  });

  if (isLoading) return null;
  if (!detail) return null;

  const b = calcOverheadBreakdown(detail);
  const totalCost = b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit + b.packCost;

  return createPortal(
    <div className={clsx('fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto', detailMaximized ? 'p-0' : 'p-4')}>
      <div className={clsx('bg-white shadow-2xl border border-slate-200 flex flex-col',
        detailMaximized ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'rounded-2xl w-full max-w-5xl my-4 max-h-[92vh]')}>

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex-1">
            <h2 className="font-bold text-slate-900 text-lg">{detail.name}</h2>
            <p className="text-xs text-slate-400">{detail.code} · {detail.category}{detail.type ? ` · ${detail.type}` : ''} · {detail.unit}</p>
          </div>
          <button onClick={() => { if (window.confirm('Delete ' + detail.name + '?')) deleteMutation.mutate(); }} className="px-3 py-1.5 rounded bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">Delete</button>
          <button onClick={() => setDetailMaximized(m => !m)} className="p-2 hover:bg-slate-100 rounded transition">{detailMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={clsx('px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'Overview' && <BasicInfoTab product={detail} />}

          {activeTab === 'Formulation & Procedure' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 mb-4 text-sm">Formulation ({detail.formulationVersions?.length || 1} versions)</h3>
                {detail.formulation?.rows?.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Ingredient</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">%</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Cost/kg</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.formulation.rows.map((r, i) => {
                          const qty = (detail.formulation.refWeight || 100) * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
                          const cost = (r.costPerKg || 0) * qty;
                          return (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="px-3 py-2">{r.name || r.ingredient}</td>
                              <td className="px-3 py-2">{Number(r.percentage || 0).toFixed(1)}%</td>
                              <td className="px-3 py-2">{qty.toFixed(2)}</td>
                              <td className="px-3 py-2">₹{(r.costPerKg || 0).toFixed(2)}</td>
                              <td className="px-3 py-2 font-bold text-emerald-600">₹{cost.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No ingredients added</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-2 block">Manufacturing Procedure</label>
                <textarea value={form.procedure?.text || ''} onChange={e => setForm(f => ({ ...f, procedure: { ...f.procedure, text: e.target.value } }))}
                  rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:border-slate-400"
                  placeholder="Step-by-step manufacturing procedure..." />
                <button onClick={() => updateMutation.mutate({ procedure: form.procedure })} disabled={updateMutation.isPending}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {updateMutation.isPending ? 'Saving...' : 'Save Procedure'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'R&D Price Calculator' && (
            <div className="-m-6"><RDPriceCalculator presetProduct={detail} /></div>
          )}

          {activeTab === 'R&D & Overheads' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block">Overhead %</label>
                  <input type="number" value={form.productionOverhead?.percentage || 0} onChange={e => setForm(f => ({ ...f, productionOverhead: { ...f.productionOverhead, percentage: parseFloat(e.target.value) || 0 } }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block">Lifecycle Units</label>
                  <input type="number" value={form.rnd?.lifecycle || 1000} onChange={e => setForm(f => ({ ...f, rnd: { ...f.rnd, lifecycle: parseInt(e.target.value) || 1000 } }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-2 block">R&D Documentation</label>
                <textarea value={form.rndDoc?.text || ''} onChange={e => setForm(f => ({ ...f, rndDoc: { ...f.rndDoc, text: e.target.value } }))}
                  rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:border-slate-400"
                  placeholder="R&D notes, testing details, research findings..." />
              </div>
              <button onClick={() => updateMutation.mutate({ rnd: form.rnd, productionOverhead: form.productionOverhead, rndDoc: form.rndDoc })}
                disabled={updateMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {updateMutation.isPending ? 'Saving...' : 'Save R&D Data'}
              </button>
            </div>
          )}

          {activeTab === 'Costing' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-emerald-700 font-semibold">Formulation Cost/Unit</p>
                <p className="text-3xl font-bold text-emerald-700 mt-2">₹{b.formCost.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700 font-semibold">Total Cost/Unit</p>
                <p className="text-3xl font-bold text-blue-700 mt-2">₹{totalCost.toFixed(2)}</p>
              </div>
            </div>
          )}

          {activeTab === 'Marketplace' && (
            <div className="space-y-4">
              {['flipkart', 'amazon', 'meesho', 'snapdeal'].map(platform => {
                const pm = form.marketplace?.platforms?.find(p => p.platform === platform);
                return (
                  <div key={platform} className="p-4 rounded-lg border border-slate-200">
                    <p className="font-bold text-slate-900 capitalize text-sm mb-3">{platform}</p>
                    <div className="space-y-2">
                      <input type="text" value={pm?.link || ''} placeholder={`${platform} listing URL`}
                        onChange={e => {
                          const updated = [...(form.marketplace?.platforms || [])];
                          const idx = updated.findIndex(p => p.platform === platform);
                          if (idx >= 0) updated[idx] = { ...updated[idx], link: e.target.value };
                          else updated.push({ platform, link: e.target.value, sku: '' });
                          setForm(f => ({ ...f, marketplace: { ...f.marketplace, platforms: updated } }));
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none" />
                      <input type="text" value={pm?.sku || ''} placeholder={`${platform} SKU`}
                        onChange={e => {
                          const updated = [...(form.marketplace?.platforms || [])];
                          const idx = updated.findIndex(p => p.platform === platform);
                          if (idx >= 0) updated[idx] = { ...updated[idx], sku: e.target.value };
                          else updated.push({ platform, link: '', sku: e.target.value });
                          setForm(f => ({ ...f, marketplace: { ...f.marketplace, platforms: updated } }));
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none" />
                    </div>
                  </div>
                );
              })}
              <button onClick={() => updateMutation.mutate({ marketplace: form.marketplace })} disabled={updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {updateMutation.isPending ? 'Saving...' : 'Save Marketplace Details'}
              </button>
            </div>
          )}

          {activeTab === 'QR Code' && (
            <div className="flex flex-col items-center">
              {detail.qrCode?.ean ? (
                <>
                  <p className="text-sm text-slate-600 mb-4">EAN: {detail.qrCode.ean}</p>
                  <QRCode value={detail.qrCode.ean} size={200} />
                </>
              ) : (
                <p className="text-slate-400 text-sm">No QR code generated</p>
              )}
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="space-y-3">
              {Object.entries(detail.documents || {}).map(([key, doc]) => (
                doc?.url && (
                  <div key={key} className="p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm capitalize">{key}</p>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{doc.name || 'Download'}</a>
                    </div>
                    <span className="text-xs text-slate-400">{fmtDate(doc.uploadedAt)}</span>
                  </div>
                )
              ))}
              {!Object.values(detail.documents || {}).some(d => d?.url) && (
                <p className="text-slate-400 text-sm text-center py-8">No documents uploaded</p>
              )}
            </div>
          )}

          {activeTab === 'History' && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold">Created</p>
                <p className="text-sm text-slate-900 mt-1">{fmtDate(detail.createdAt)}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold">Last Updated</p>
                <p className="text-sm text-slate-900 mt-1">{fmtDate(detail.updatedAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ════ BASIC INFO TAB ════
function BasicInfoTab({ product: p }) {
  const b = calcOverheadBreakdown(p);
  return (
    <div className="grid grid-cols-3 gap-6">
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Basic Information</p>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-slate-500">SKU/Code</span>
            <p className="font-mono font-bold text-slate-900">{p.code}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Category</span>
            <p className="text-slate-900">{p.category}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Sub-Category</span>
            <p className="text-slate-900">{p.subCategory || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Type</span>
            <p className="text-slate-900">{p.type || '—'}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Specifications</p>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-slate-500">Base Unit</span>
            <p className="text-slate-900">{p.unit}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Reference Weight</span>
            <p className="text-slate-900">{p.weight ? `${p.weight} ${p.unit}` : '—'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Shelf Life</span>
            <p className="text-slate-900">{p.shelfLife ? `${p.shelfLife} months` : '—'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">HSN Code</span>
            <p className="font-mono text-slate-900">{p.hsnCode || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">GST Rate</span>
            <p className="text-slate-900">{p.gstRate}%</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Barcode</span>
            <p className="font-mono text-slate-900">{p.barcode || '—'}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Costs & Status</p>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-slate-500">Formulation Cost</span>
            <p className="font-bold text-emerald-600 text-base">₹{b.formCost.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Status</span>
            <p className={clsx('px-3 py-1 rounded-full text-xs font-bold inline-block mt-1',
              p.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
              p.status === 'Draft' ? 'bg-amber-100 text-amber-700' :
              p.status === 'Archived' ? 'bg-gray-100 text-gray-700' :
              'bg-red-100 text-red-700'
            )}>{p.status}</p>
          </div>
          {p.description && (
            <div className="col-span-3">
              <span className="text-xs text-slate-500">Description</span>
              <p className="text-slate-900 text-sm mt-1">{p.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
