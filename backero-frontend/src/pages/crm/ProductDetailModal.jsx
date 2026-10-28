import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import QRCode from 'react-qr-code';
import api from '../../api/axios';
import RDPriceCalculator from '../production/RDPriceCalculator';
import {
  ShoppingCart, Package, Tag, Circle, Search, Download, Upload as UploadIcon, Plus, CircleCheck, Pencil, Trash2, X, Camera, Save, Image as ImageIcon, Clipboard, Ruler,
  IndianRupee, Calendar, Award, FlaskConical, BarChart3, Scale, Lock, Archive, Minimize2, Maximize2, Calculator, QrCode, Printer, Video, Mic, FileText, Paperclip, Microscope, Factory,
  FileEdit, TriangleAlert, Square, Clock, ScrollText, RefreshCw
} from 'lucide-react';

export const CATEGORIES = ['Hair Care', 'Skin Care', 'Face Care', 'Body Care', 'Oral Care', "Men's Care", 'Baby Care', 'Sun Care', 'Makeup', 'Fragrance', 'Wellness', 'Professional', 'Other'];
export const PRODUCT_TYPES = ['Shampoo', 'Conditioner', 'Hair Oil', 'Serum', 'Cream', 'Lotion', 'Face Wash', 'Mask', 'Scrub', 'Toner', 'Moisturizer', 'Cleanser', 'Soap', 'Body Wash', 'Sunscreen', 'Lip Balm', 'Deodorant', 'Perfume', 'Other'];
export const UNITS = ['ml', 'g', 'kg', 'L', 'pcs', 'oz'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const STATUSES = ['Active', 'Inactive', 'Draft', 'Archived'];
const TABS = ['Overview', 'Formulation & Procedure', 'R&D Price Calculator', 'R&D & Overheads', 'Costing', 'Marketplace', 'QR Code', 'Documents', 'History'];
const PLATFORMS = ['flipkart', 'amazon', 'meesho', 'snapdeal'];
const PLATFORM_ICONS = { flipkart: <ShoppingCart size={14} />, amazon: <Package size={14} />, meesho: <Tag size={14} />, snapdeal: <Circle size={14} /> };

const ASSUMPTION_FIELDS = [
  { key: 'equipmentPct', label: 'Equipment (Mold/Tools)', max: 20, hint: '3-5% recommended' },
  { key: 'consumablesPct', label: 'Consumables (Small/MSME)', max: 10, hint: '1-2% recommended' },
  { key: 'storagePct', label: 'Storage (Warehouse)', max: 10, hint: '2-4% recommended' },
  { key: 'housekeepingPct', label: 'Housekeeping (Sanitization)', max: 10, hint: '1-2% recommended' },
  { key: 'adminPct', label: 'Admin (Admin STD)', max: 20, hint: '5-8% recommended' },
  { key: 'wastagePct', label: 'Wastage (Production)', max: 10, hint: '2-5% recommended' },
];

const FORM_VERSION_STATUS = {
  draft: { label: 'Draft', cls: 'bg-amber-100 text-amber-700' },
  testing: { label: 'In Testing', cls: 'bg-blue-100 text-blue-700' },
  locked: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-500' },
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

function withComputedQuantity(rows, refWeight) {
  const rw = Number(refWeight) || 100;
  return (rows || []).map(r => ({
    ...r,
    quantity: rw * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1),
  }));
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

function calcOverheadBreakdown(product) {
  const refW = (product?.formulation?.refWeight) || product?.weight || 100;
  const formCost = refW > 0 ? calcFormCost(product) / refW : 0;
  const sa = product?.standardAssumptions || {};
  const saPct = (sa.equipmentPct || 0) + (sa.consumablesPct || 0) + (sa.storagePct || 0) +
    (sa.housekeepingPct || 0) + (sa.adminPct || 0) + (sa.wastagePct || 0);
  const saAmount = formCost * saPct / 100;
  const rnd = product?.rnd || {};
  const lifecycle = rnd.lifecycle || 1000;
  const rndTotal = (rnd.testing || 0) + (rnd.consumables || 0) + (rnd.samples || 0) +
    (rnd.overhead || 0) + (rnd.otherOverhead || 0) + (rnd.qc || 0);
  const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;
  const po = product?.productionOverhead || {};
  const overheadTotal = (po.electricity || 0) + (po.labor || 0) + (po.labTesting || 0) + (po.other || 0);
  const overheadPerUnit = refW > 0 ? overheadTotal / refW : 0;
  const pkg = product?.packaging || {};
  const pkgCost = (pkg.items || []).filter(i => !i.optional).reduce((s, i) => s + (i.amount || i.qty * i.rate || 0), 0)
    + (pkg.charges?.machine || 0) + (pkg.charges?.shrinkWrap || 0) + (pkg.charges?.other || 0);
  return { refW, formCost, saPct, saAmount, rndTotal, lifecycle, rndPerUnit, overheadTotal, overheadPerUnit, pkgCost };
}

function calcTotalCostPerUnit(product) {
  if (!product) return 0;
  const b = calcOverheadBreakdown(product);
  return b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit + b.pkgCost;
}

function MetricCard({ label, value, sub, icon, iconBg }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex justify-between items-start">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${iconBg}`}>{icon}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: 'bg-emerald-100 text-emerald-700',
    Inactive: 'bg-slate-100 text-slate-500',
    Draft: 'bg-amber-100 text-amber-700',
    Archived: 'bg-red-100 text-red-600',
    Discontinued: 'bg-gray-100 text-gray-500',
  };
  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${map[status] || map.Inactive}`}>{status}</span>;
}

function HighlightStrip({ items, tone = 'light' }) {
  const isDark = tone === 'dark';
  return (
    <div className={clsx('grid gap-4 rounded-xl p-4', isDark ? 'bg-slate-900 text-white' : 'border border-gray-200')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it, i) => (
        <div key={i}>
          <p className={clsx('text-[11px] mb-1', isDark ? 'text-white/70' : 'text-gray-400')}>{it.label}</p>
          <p className={clsx('font-bold', it.big ? 'text-xl' : 'text-base', isDark ? (it.accent ? 'text-amber-300' : 'text-white') : 'text-gray-800')}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function AttachmentList({ attachments, onRemove }) {
  if (!attachments?.length) return null;
  const icon = (t) => t === 'video' ? <Video size={14} /> : t === 'audio' ? <Mic size={14} /> : <FileText size={14} />;
  return (
    <div className="flex flex-col gap-2 mt-3">
      {attachments.map((a) => (
        <div key={a._id || a.url} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 text-xs">
          <span className="text-lg">{icon(a.type)}</span>
          <div className="flex-1 min-w-0">
            <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline truncate block">{a.name || 'Attachment'}</a>
            <p className="text-gray-400">{a.type || 'file'} · {fmtDate(a.createdAt)}</p>
          </div>
          <button onClick={() => onRemove(a._id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function IngredientCell({ row, index, rawMaterials, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(row.name || '');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { setQuery(row.name || ''); }, [row.name]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return rawMaterials.slice(0, 8);
    const q = query.toLowerCase();
    return rawMaterials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, rawMaterials]);

  const isLinked = !!row.rawMaterialId;
  const exactMatch = rawMaterials.some(m => m.name.toLowerCase() === query.toLowerCase());
  const DROPDOWN_MAX_HEIGHT = 240;

  function openDropdown() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && r.top > spaceBelow;
      setDropPos({
        top: openUp ? r.top + window.scrollY - 2 : r.bottom + window.scrollY + 2,
        left: r.left + window.scrollX,
        width: 224,
        openUp,
      });
    }
    setOpen(true);
  }

  function select(mat) {
    onUpdate(index, { name: mat.name, rawMaterialId: mat._id, unit: mat.unit, costPerKg: mat.costPrice || 0 });
    setQuery(mat.name);
    setOpen(false);
  }

  function handleChange(e) {
    setQuery(e.target.value);
    onUpdate(index, { name: e.target.value, rawMaterialId: '' });
    openDropdown();
  }

  const dropdown = open ? createPortal(
    <div style={{
      position: 'fixed',
      left: dropPos.left, width: dropPos.width, zIndex: 9999,
      maxHeight: DROPDOWN_MAX_HEIGHT, overflowY: 'auto',
      ...(dropPos.openUp ? { bottom: window.innerHeight - dropPos.top, top: 'auto' } : { top: dropPos.top }),
    }} className="bg-white border border-gray-200 rounded-lg shadow-xl">
      {suggestions.map(m => (
        <button key={m._id} onMouseDown={() => select(m)}
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 flex items-center justify-between gap-2">
          <span className="text-gray-800 truncate">{m.name}</span>
          <span className="text-gray-400 shrink-0">{m.unit} · {m.currentStock ?? 0}</span>
        </button>
      ))}
      {query.trim() && !exactMatch && (
        <div className="px-3 py-1.5 text-xs text-orange-500 border-t border-gray-100 flex items-center gap-1">
          <span className="font-bold">+</span> Create &quot;{query}&quot; as new raw material on save
        </div>
      )}
      {!suggestions.length && !query.trim() && (
        <div className="px-3 py-3 text-xs text-gray-400 text-center">No raw materials yet</div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} className="flex items-center gap-1">
      <input ref={inputRef} value={query} onChange={handleChange} onFocus={openDropdown}
        className="input text-xs w-40" placeholder="Type ingredient..." />
      {isLinked
        ? <span title="Linked to inventory" className="text-[10px] text-emerald-600 font-bold select-none">●</span>
        : query.trim()
          ? <span title="Will be auto-created as raw material" className="text-[10px] text-orange-400 font-bold select-none">+</span>
          : null}
      {dropdown}
    </div>
  );
}

function VersionRowsTable({ rows, refWeight, rawMaterials, onUpdate, onAdd, onRemove, editable }) {
  const headers = editable ? ['Ingredient', '%', 'Qty (g)', 'Conv. Factor', 'Phase', 'Cost/unit (₹)', ''] : ['Ingredient', '%', 'Qty (g)', 'Conv. Factor', 'Phase', 'Cost/unit (₹)'];
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5">{editable ? <IngredientCell row={r} index={i} rawMaterials={rawMaterials} onUpdate={onUpdate} /> : <span className="text-gray-700">{r.name}</span>}</td>
                <td className="px-3 py-1.5">{editable ? <input type="number" value={r.percentage} onChange={e => onUpdate(i, { percentage: e.target.value })} className="input text-xs w-16" /> : `${numF(r.percentage, 1)}%`}</td>
                <td className="px-3 py-1.5 text-gray-500">{numF((refWeight || 100) * (r.percentage || 0) / 100 * (Number(r.convFactor) || 1), 2)}</td>
                <td className="px-3 py-1.5">{editable ? <input type="number" step="0.01" value={r.convFactor ?? 1} onChange={e => onUpdate(i, { convFactor: e.target.value })} className="input text-xs w-16" /> : (r.convFactor ?? 1)}</td>
                <td className="px-3 py-1.5">{editable ? <input value={r.phase || ''} onChange={e => onUpdate(i, { phase: e.target.value })} placeholder="A/B/C" className="input text-xs w-16" /> : (r.phase || '—')}</td>
                <td className="px-3 py-1.5">{editable ? <input type="number" value={r.costPerKg} onChange={e => onUpdate(i, { costPerKg: e.target.value })} className="input text-xs w-20" /> : `₹${numF(r.costPerKg)}`}</td>
                {editable && <td className="px-3 py-1.5"><button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-gray-400">No ingredients in this version</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && <button onClick={onAdd} className="btn-secondary text-xs mt-2">+ Add Ingredient</button>}
    </div>
  );
}

function FormulationVersionSidebar({ product, selectedVersionId, setSelectedVersionId, versionActions }) {
  const versions = product?.formulationVersions || [];
  const sorted = [...versions].sort((a, b) => a.versionLabel.localeCompare(b.versionLabel, undefined, { numeric: true }));

  return (
    <div className="w-52 flex-shrink-0 space-y-2">
      <button onClick={() => setSelectedVersionId(null)}
        className={clsx('w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors',
          !selectedVersionId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50')}>
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          Live <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">The product's current formulation</div>
      </button>

      {sorted.map((v) => {
        const badge = FORM_VERSION_STATUS[v.status] || FORM_VERSION_STATUS.draft;
        return (
          <button key={v._id} onClick={() => setSelectedVersionId(v._id)}
            className={clsx('w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors',
              selectedVersionId === v._id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50')}>
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              {v.versionLabel}
              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>
            </div>
            {v.changeNotes && <div className="text-[10px] text-slate-400 truncate mt-0.5">{v.changeNotes}</div>}
          </button>
        );
      })}

      <button onClick={() => versionActions.onCreateVersion({ cloneFrom: selectedVersionId, onCreated: setSelectedVersionId })} disabled={versionActions.state.creating}
        className="w-full text-xs px-3 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
        {versionActions.state.creating ? 'Cloning…' : <><Clipboard size={12} className="inline -mt-0.5 mr-1" />Clone to V(n+1)</>}
      </button>
    </div>
  );
}

function BranchedFormulationEditor({ product, selectedVersionId, setSelectedVersionId, versionActions }) {
  const { onUpdateVersion, onActivateVersion, onDeleteVersion, state } = versionActions;
  const versions = product?.formulationVersions || [];
  const selected = versions.find((v) => v._id === selectedVersionId);
  const [draftRows, setDraftRows] = useState([]);
  const [draftMeta, setDraftMeta] = useState({ refWeight: 100, refUnit: 'ml' });
  const [changeNotes, setChangeNotes] = useState('');

  useEffect(() => {
    if (selected) {
      setDraftRows(selected.rows || []);
      setDraftMeta({ refWeight: selected.refWeight || 100, refUnit: selected.refUnit || 'ml' });
      setChangeNotes(selected.changeNotes || '');
    }
  }, [selectedVersionId]);

  const { data: rmData } = useQuery({
    queryKey: ['raw-materials-list'],
    queryFn: () => api.get('/inventory/raw-materials').then(r => r.data.materials || []),
    staleTime: 60000,
  });
  const rawMaterials = rmData || [];

  function updateDraftRow(i, fields) { setDraftRows(rows => { const copy = [...rows]; copy[i] = { ...copy[i], ...fields }; return copy; }); }
  function addDraftRow() { setDraftRows(rows => [...rows, { name: '', rawMaterialId: '', percentage: 0, quantity: 0, unit: 'g', costPerKg: 0, phase: '', convFactor: 1 }]); }
  function removeDraftRow(i) { setDraftRows(rows => rows.filter((_, idx) => idx !== i)); }

  if (!selected) return null;
  const badge = FORM_VERSION_STATUS[selected.status] || FORM_VERSION_STATUS.draft;
  const editable = ['draft', 'testing'].includes(selected.status);

  const dashRows = editable ? draftRows : (selected.rows || []);
  const dashRefWeight = Number(editable ? draftMeta.refWeight : selected.refWeight) || 100;
  const dashRefUnit = editable ? draftMeta.refUnit : (selected.refUnit || 'ml');
  const dashTotalPct = dashRows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const dashTotalQty = dashRows.reduce((s, r) => s + (dashRefWeight * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1)), 0);

  return (
    <div className="space-y-3">
      {!editable && (
        <div className={clsx('px-3 py-2 rounded-lg text-xs font-semibold',
          selected.status === 'locked' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200')}>
          {selected.status === 'locked' ? <><Lock size={12} className="inline -mt-0.5 mr-1" />LOCKED — this version is Active. Create a new version to iterate.</> : <><Archive size={12} className="inline -mt-0.5 mr-1" />ARCHIVED — read-only historical version.</>}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{selected.versionLabel}</span>
          <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>
        </div>
        <div className="flex gap-2">
          {editable && (
            <button onClick={() => onUpdateVersion(selected._id, { rows: withComputedQuantity(draftRows, draftMeta.refWeight), refWeight: draftMeta.refWeight, refUnit: draftMeta.refUnit, changeNotes })}
              disabled={state.updating} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-50 transition-colors">
              {state.updating ? 'Saving…' : <><Save size={12} className="inline -mt-0.5 mr-1" />Save</>}
            </button>
          )}
          {editable && (
            <button onClick={() => onActivateVersion(selected._id)} disabled={state.activating}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {state.activating ? 'Activating…' : <><Lock size={12} className="inline -mt-0.5 mr-1" />Approve & Lock</>}
            </button>
          )}
          {editable && (
            <button onClick={() => { if (window.confirm(`Delete ${selected.versionLabel}?`)) { onDeleteVersion(selected._id); setSelectedVersionId(null); } }} disabled={state.deleting}
              className="text-xs px-2 py-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"><Trash2 size={13} /></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total Ingredients" value={dashRows.length} icon={<FlaskConical size={18} />} iconBg="bg-blue-100" />
        <MetricCard label="Total Percentage" value={`${numF(dashTotalPct, 2)}%`} icon={<BarChart3 size={18} />} iconBg="bg-emerald-100" />
        <MetricCard label="Total Quantity" value={numF(dashTotalQty, 2)} icon={<Scale size={18} />} iconBg="bg-orange-100" />
        <MetricCard label="Reference Weight" value={`${dashRefWeight} ${dashRefUnit}`} icon={<Ruler size={18} />} iconBg="bg-purple-100" />
      </div>

      {editable ? (
        <>
          <div className="flex items-center gap-3">
            <div><label className="text-[10px] text-gray-400">Ref. Weight</label>
              <input type="number" value={draftMeta.refWeight} onChange={e => setDraftMeta(m => ({ ...m, refWeight: Number(e.target.value) }))} className="input text-xs w-20" />
            </div>
            <div><label className="text-[10px] text-gray-400">Unit</label>
              <select value={draftMeta.refUnit} onChange={e => setDraftMeta(m => ({ ...m, refUnit: e.target.value }))} className="input text-xs w-16">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex-1"><label className="text-[10px] text-gray-400">Change Note</label>
              <input value={changeNotes} onChange={e => setChangeNotes(e.target.value)} placeholder="e.g. Reduced tack, added ferulic 0.5%" className="input text-xs w-full" />
            </div>
          </div>
          <VersionRowsTable rows={draftRows} refWeight={draftMeta.refWeight} rawMaterials={rawMaterials} onUpdate={updateDraftRow} onAdd={addDraftRow} onRemove={removeDraftRow} editable />
        </>
      ) : (
        <>
          {selected.changeNotes && <p className="text-xs text-slate-400 italic">{selected.changeNotes}</p>}
          <VersionRowsTable rows={selected.rows || []} refWeight={selected.refWeight} editable={false} />
        </>
      )}
    </div>
  );
}

function ManufacturingProcedureTab({ product, form, setForm, onSave, isPending, onAttach, onRemoveAttach }) {
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  function setText(field, val) { setForm(prev => ({ ...prev, [field]: { ...prev[field], text: val } })); }

  function onFile(kind) {
    return (e) => {
      const f = e.target.files[0]; if (!f) return;
      onAttach(f, kind);
      e.target.value = '';
    };
  }

  async function toggleAudioRecord() {
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `Recording ${new Date().toLocaleString()}.webm`, { type: 'audio/webm' });
        onAttach(file, 'procedure');
        setRecording(false); setRecSeconds(0);
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true); setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch { toast.error('Microphone access denied'); }
  }

  const mm = String(Math.floor(recSeconds / 60)).padStart(2, '0');
  const ss = String(recSeconds % 60).padStart(2, '0');

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Factory size={14} />Manufacturing Procedure</p>
          <div className="flex gap-2">
            <input type="file" id="procFile" accept=".pdf,.doc,.docx" className="hidden" onChange={onFile('procedure')} />
            <button onClick={() => document.getElementById('procFile').click()} className="btn-secondary text-xs inline-flex items-center gap-1"><Paperclip size={12} />Attach File</button>
            <input type="file" id="procVideo" accept="video/*" className="hidden" onChange={onFile('procedure')} />
            <button onClick={() => document.getElementById('procVideo').click()} className="btn-secondary text-xs inline-flex items-center gap-1"><Video size={12} />Attach Video</button>
            <button onClick={toggleAudioRecord} className="btn-secondary text-xs inline-flex items-center gap-1">{recording ? <><Square size={12} />Stop Recording</> : <><Mic size={12} />Record Audio</>}</button>
          </div>
        </div>
        <textarea value={form.procedure?.text || ''} onChange={e => setText('procedure', e.target.value)} rows={6} className="input resize-none text-sm w-full" placeholder="Step-by-step manufacturing procedure…" />
        {recording && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-red-600">Recording…</span>
            <span className="ml-auto text-gray-400">{mm}:{ss}</span>
          </div>
        )}
        <AttachmentList attachments={product.procedure?.attachments} onRemove={(id) => onRemoveAttach('procedure', id)} />
      </div>
      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : <><Save size={13} className="inline -mt-0.5 mr-1" />Save Procedure</>}</button>
    </div>
  );
}

function RndOverheadsTab({ product, form, setForm, onSave, isPending }) {
  const po = form.productionOverhead || {};
  const sa = form.standardAssumptions || {};
  const b = calcOverheadBreakdown({ ...product, ...form });

  function setPO(f, v) { setForm(prev => ({ ...prev, productionOverhead: { ...prev.productionOverhead, [f]: v } })); }
  function setSA(f, v) { setForm(prev => ({ ...prev, standardAssumptions: { ...prev.standardAssumptions, [f]: v } })); }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5 mb-3"><Factory size={14} />Production Overhead</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[['electricity', 'Electricity (₹)'], ['labor', 'Production Labor (₹)'], ['labTesting', 'Lab Testing Cost (₹)'], ['other', 'Other Production Overhead (₹)']].map(([f, label]) => (
            <div key={f}><label className="text-xs text-gray-600 block mb-1">{label}</label><input type="number" min="0" step="0.01" value={po[f] || 0} onChange={e => setPO(f, Number(e.target.value))} className="input text-xs w-full" /></div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total Production Overhead', value: `₹${numF(b.overheadTotal)}` },
          { label: 'Per Unit', value: `₹${numF(b.overheadPerUnit, 4)}`, big: true },
        ]} />
      </div>

      <hr className="border-gray-100" />

      <div>
        <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><FileEdit size={14} />Standard Assumptions (Industry STD%)</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {ASSUMPTION_FIELDS.map(({ key, label, max, hint }) => (
            <div key={key}>
              <label className="text-xs text-gray-600 block mb-1">{label} <span className="text-gray-400">%</span></label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max={max} step="0.5" value={sa[key] ?? 0} onChange={e => setSA(key, Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-semibold text-gray-700 w-10 text-right">{sa[key] ?? 0}%</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total Indirect % on Material Cost', value: `${numF(b.saPct, 1)}%` },
          { label: 'Total Amount / Unit (at ref cost)', value: `₹${numF(b.saAmount, 4)}`, big: true },
        ]} />
      </div>

      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : <><Save size={13} className="inline -mt-0.5 mr-1" />Save R&D & Overheads</>}</button>
    </div>
  );
}

function CostingPackagingTab({ product, form, setForm, isPending, onSavePackaging, onSaveVariants, onSaveCosting }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Package size={14} />Costing & Pricing</p>
        <HighlightStrip tone="dark" items={[
          { label: 'Ingredients Cost', value: `₹${numF(calcFormCost(form))}` },
          { label: 'Total Unit Cost', value: `₹${numF(calcTotalCostPerUnit({ ...product, ...form }))}`, big: true, accent: true },
        ]} />
      </div>
    </div>
  );
}

function MarketplaceTab({ product, form, setForm, onSave, isPending }) {
  return (
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
      <button onClick={onSave} disabled={isPending} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
        {isPending ? 'Saving...' : 'Save Marketplace Details'}
      </button>
    </div>
  );
}

function DocumentsTab({ product, onAttach, onRemoveAttach }) {
  const slots = [
    ['coa', 'COA (Certificate of Analysis)', '.pdf'],
    ['msds', 'MSDS', '.pdf'],
    ['registration', 'Product Registration', '.pdf'],
    ['brochure', 'Marketing Brochure', '.pdf,.jpg,.png'],
  ];
  const docs = product.documents || {};

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><FileText size={14} />Documents & Certificates</p>
      <div className="grid grid-cols-2 gap-4">
        {slots.map(([key, label, accept]) => {
          const doc = docs[key];
          return (
            <div key={key} className="rounded-xl border border-gray-200 p-4">
              <label className="text-xs text-gray-600 font-semibold block mb-2">{label}</label>
              {doc?.url ? (
                <div className="flex items-center gap-2 text-xs mt-1">
                  <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline truncate flex-1">{doc.name || 'Document'}</a>
                  <button onClick={() => onRemoveAttach(`documents.${key}`)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              ) : (
                <input type="file" id={`doc-${key}`} accept={accept} className="hidden" onChange={e => { const f = e.target.files[0]; if (f) onAttach(f, `documents.${key}`); e.target.value = ''; }} />
              )}
              {!doc?.url && <button onClick={() => document.getElementById(`doc-${key}`).click()} className="btn-secondary text-xs inline-flex items-center gap-1"><Paperclip size={12} />Upload</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QRCodeTab({ product: p }) {
  const qrData = JSON.stringify({ code: p.code, name: p.name, category: p.category || '', unit: p.unit || '' });
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <p className="text-sm font-bold text-gray-700 self-start flex items-center gap-1.5"><QrCode size={14} />Product QR Code</p>
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <QRCode value={qrData} size={200} fgColor="#0f172a" bgColor="#ffffff" />
      </div>
      <div className="text-center text-sm">
        <p className="font-bold text-gray-800">{p.name}</p>
        <p className="text-gray-400">SKU: {p.code}</p>
        <p className="text-gray-400">{p.unit || ''}</p>
      </div>
      <button onClick={() => window.print()} className="btn-primary text-sm inline-flex items-center gap-1"><Printer size={13} />Print Label</button>
    </div>
  );
}

function HistoryTab({ product: p }) {
  const events = [...(p.history || [])];
  if (p.rnd?.lastUpdated) events.push({ action: 'R&D costing updated', date: p.rnd.lastUpdated });
  if (p.productionOverhead?.lastUpdated) events.push({ action: 'Production Overhead updated', date: p.productionOverhead.lastUpdated });
  if (p.standardAssumptions?.lastUpdated) events.push({ action: 'Standard Assumptions updated', date: p.standardAssumptions.lastUpdated });
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-6">
      <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Clock size={14} />Activity History</p>
      {!events.length ? (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">No activity history recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-gray-100 text-xs">
              <span className="text-gray-400 whitespace-nowrap">{fmtDate(e.date)}</span>
              <p className="font-semibold text-gray-700">{e.action}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BasicInfoTab({ product: p }) {
  const b = calcOverheadBreakdown(p);
  return (
    <div className="grid grid-cols-3 gap-6">
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Basic Information</p>
        <div className="space-y-3 text-sm">
          <div><span className="text-xs text-slate-500">SKU/Code</span><p className="font-mono font-bold text-slate-900">{p.code}</p></div>
          <div><span className="text-xs text-slate-500">Category</span><p className="text-slate-900">{p.category}</p></div>
          <div><span className="text-xs text-slate-500">Sub-Category</span><p className="text-slate-900">{p.subCategory || '—'}</p></div>
          <div><span className="text-xs text-slate-500">Type</span><p className="text-slate-900">{p.type || '—'}</p></div>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Specifications</p>
        <div className="space-y-3 text-sm">
          <div><span className="text-xs text-slate-500">Base Unit</span><p className="text-slate-900">{p.unit}</p></div>
          <div><span className="text-xs text-slate-500">Reference Weight</span><p className="text-slate-900">{p.weight ? `${p.weight} ${p.unit}` : '—'}</p></div>
          <div><span className="text-xs text-slate-500">Shelf Life</span><p className="text-slate-900">{p.shelfLife ? `${p.shelfLife} months` : '—'}</p></div>
          <div><span className="text-xs text-slate-500">HSN Code</span><p className="font-mono text-slate-900">{p.hsnCode || '—'}</p></div>
          <div><span className="text-xs text-slate-500">GST Rate</span><p className="text-slate-900">{p.gstRate}%</p></div>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Costs & Status</p>
        <div className="space-y-3 text-sm">
          <div><span className="text-xs text-slate-500">Formulation Cost</span><p className="font-bold text-emerald-600 text-base">₹{b.formCost.toFixed(2)}</p></div>
          <div><span className="text-xs text-slate-500">Status</span><p><StatusBadge status={p.status} /></p></div>
          {p.description && <p className="text-slate-900 text-sm mt-1">{p.description}</p>}
        </div>
      </div>
    </div>
  );
}

// Main Modal Component
export default function ProductDetailModal({ productId, onClose, refetchLead }) {
  const qc = useQueryClient();

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['catalog-detail', productId],
    queryFn: () => api.get(`/catalog/products/${productId}`).then(r => r.data),
    enabled: !!productId,
  });
  const detail = detailData?.product;

  const [activeTab, setActiveTab] = useState('Overview');
  const [detailMaximized, setDetailMaximized] = useState(false);
  const [form, setForm] = useState({});
  const [selectedVersionId, setSelectedVersionId] = useState(null);

  useEffect(() => {
    if (detail) {
      setForm(detail);
    }
  }, [detail?._id]);

  const { data: rmData } = useQuery({
    queryKey: ['raw-materials-list'],
    queryFn: () => api.get('/inventory/raw-materials').then(r => r.data.materials || []),
    staleTime: 60000,
  });
  const rawMaterials = rmData || [];

  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/catalog/products/${productId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      qc.invalidateQueries({ queryKey: ['catalog-detail', productId] });
      sessionStorage.setItem('productUpdated', 'true');
      sessionStorage.setItem('updatedProductId', productId);
      toast.success('Saved');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save'),
  });

  const attachMutation = useMutation({
    mutationFn: ({ file, kind }) => { const fd = new FormData(); fd.append('file', file); fd.append('kind', kind); return api.post(`/catalog/products/${productId}/attachment`, fd); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-detail', productId] }); toast.success('Attachment uploaded'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Upload failed'),
  });

  const removeAttachMutation = useMutation({
    mutationFn: ({ kind, attachmentId }) => api.delete(`/catalog/products/${productId}/attachment`, { data: { kind, attachmentId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-detail', productId] }); toast.success('Attachment removed'); },
    onError: () => toast.error('Failed to remove attachment'),
  });

  const createVersionMutation = useMutation({
    mutationFn: ({ changeNotes, cloneFrom }) => api.post(`/catalog/products/${productId}/formulation-versions`, { changeNotes, cloneFrom }),
    onSuccess: (res, { onCreated }) => {
      const p = res?.data?.product;
      if (p) qc.setQueryData(['catalog-detail', productId], (old) => (old ? { ...old, product: p } : old));
      qc.invalidateQueries({ queryKey: ['catalog-detail', productId] });
      toast.success('New version created');
      const newest = p?.formulationVersions?.[p.formulationVersions.length - 1];
      if (newest && onCreated) onCreated(newest._id);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to create version'),
  });

  const updateVersionMutation = useMutation({
    mutationFn: ({ versionId, data }) => api.put(`/catalog/products/${productId}/formulation-versions/${versionId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-detail', productId] }); toast.success('Version saved'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save version'),
  });

  const activateVersionMutation = useMutation({
    mutationFn: ({ versionId }) => api.post(`/catalog/products/${productId}/formulation-versions/${versionId}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-detail', productId] }); toast.success('Version activated'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to activate version'),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: ({ versionId }) => api.delete(`/catalog/products/${productId}/formulation-versions/${versionId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-detail', productId] }); toast.success('Version deleted'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to delete version'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/catalog/products/${productId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); toast.success('Deleted'); onClose(); },
    onError: () => toast.error('Failed to delete'),
  });

  if (isLoading || !detail) return null;

  const versionActions = {
    onCreateVersion: (opts) => createVersionMutation.mutate({ ...opts, changeNotes: opts.changeNotes || '' }),
    onUpdateVersion: (versionId, data) => updateVersionMutation.mutate({ versionId, data }),
    onActivateVersion: (versionId) => activateVersionMutation.mutate({ versionId }),
    onDeleteVersion: (versionId) => deleteVersionMutation.mutate({ versionId }),
    state: { creating: createVersionMutation.isPending, updating: updateVersionMutation.isPending, activating: activateVersionMutation.isPending, deleting: deleteVersionMutation.isPending },
  };

  return createPortal(
    <div className={clsx('fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto', detailMaximized ? 'p-0' : 'p-4')}>
      <div className={clsx('bg-white shadow-2xl border border-slate-200 flex flex-col', detailMaximized ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'rounded-2xl w-full max-w-6xl my-4 max-h-[92vh]')}>
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 text-lg">{detail.name}</h2>
            <p className="text-xs text-slate-400">{detail.code} · {detail.category}{detail.type ? ` · ${detail.type}` : ''} · {detail.unit}</p>
          </div>
          <button onClick={() => { if (window.confirm('Delete ' + detail.name + '?')) deleteMutation.mutate(); }} className="px-3 py-1.5 rounded bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">Delete</button>
          <button onClick={() => setDetailMaximized(m => !m)} className="p-2 hover:bg-slate-100 rounded transition">{detailMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition"><X size={18} /></button>
        </div>

        <div className="flex gap-0 px-6 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={clsx('px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'Overview' && <BasicInfoTab product={detail} />}

          {activeTab === 'Formulation & Procedure' && detail && (
            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <FormulationVersionSidebar product={detail} selectedVersionId={selectedVersionId} setSelectedVersionId={setSelectedVersionId} versionActions={versionActions} />
                <div className="flex-1 min-w-0">
                  {selectedVersionId
                    ? <BranchedFormulationEditor product={detail} selectedVersionId={selectedVersionId} setSelectedVersionId={setSelectedVersionId} versionActions={versionActions} />
                    : <div className="space-y-4">
                        <h3 className="font-bold text-slate-900 text-sm">Current Formulation</h3>
                        {detail.formulation?.rows?.length > 0 && (
                          <div className="overflow-x-auto rounded border border-slate-200">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Ingredient</th><th className="px-3 py-2 text-left">%</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2 text-left">Cost/kg</th><th className="px-3 py-2 text-left">Amount</th></tr></thead>
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
                        )}
                      </div>
                  }
                </div>
              </div>
              <hr className="border-gray-100" />
              <ManufacturingProcedureTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ procedure: form.procedure })} isPending={updateMutation.isPending} onAttach={(f, k) => attachMutation.mutate({ file: f, kind: k })} onRemoveAttach={(k, id) => removeAttachMutation.mutate({ kind: k, attachmentId: id })} />
            </div>
          )}

          {activeTab === 'R&D Price Calculator' && <div className="-m-6"><RDPriceCalculator presetProduct={detail} /></div>}

          {activeTab === 'R&D & Overheads' && <RndOverheadsTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ rnd: form.rnd, productionOverhead: form.productionOverhead, standardAssumptions: form.standardAssumptions })} isPending={updateMutation.isPending} />}

          {activeTab === 'Costing' && <CostingPackagingTab product={detail} form={form} setForm={setForm} isPending={updateMutation.isPending} onSavePackaging={() => updateMutation.mutate({ packaging: form.packaging })} onSaveVariants={() => updateMutation.mutate({ variants: form.variants })} onSaveCosting={() => updateMutation.mutate({ costing: form.costing })} />}

          {activeTab === 'Marketplace' && <MarketplaceTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ marketplace: form.marketplace })} isPending={updateMutation.isPending} />}

          {activeTab === 'QR Code' && <QRCodeTab product={detail} />}

          {activeTab === 'Documents' && <DocumentsTab product={detail} onAttach={(f, k) => attachMutation.mutate({ file: f, kind: k })} onRemoveAttach={(k) => removeAttachMutation.mutate({ kind: k, attachmentId: null })} />}

          {activeTab === 'History' && <HistoryTab product={detail} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
