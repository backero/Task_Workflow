import { useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CATEGORIES as CATALOG_CATEGORIES, UNITS as CATALOG_UNITS, PRODUCT_TYPES as CATALOG_PRODUCT_TYPES, GST_RATES as CATALOG_GST_RATES, STATUSES as CATALOG_STATUSES } from '../inventory/ProductCatalogPage';

// Leaf module (no imports from SampleLeadDetail.jsx / StageSteps.jsx / NewOrderModal.jsx) so all
// three can create a catalog product inline without forming an import cycle — this used to live
// inside SampleLeadDetail.jsx, but StageSteps.jsx's Stage 0 "Orders" panel now also
// needs it (to add another product line for an existing order's customer) and StageSteps.jsx is
// itself imported BY SampleLeadDetail.jsx, so it had to move out to its own file first.

const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const inputCls = 'px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871]';
const accentBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50';
const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';

// "Create Product" — creates a real Product Catalog entry via POST /catalog/products (the
// caller does the actual API call and passes it in as onSave), so it shows up in the actual
// Product Catalog too. Mirrors the exact Basic Info field set of the catalog's own "Add New
// Product" form (Formulation/Costing/Marketplace/etc. only unlock after the product exists
// there too, so they're out of scope here).
export function CreateCatalogProductModal({ nextCode, defaultName, saving, onClose, onSave }) {
  const [code, setCode] = useState(nextCode);
  const [name, setName] = useState(defaultName || '');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('Active');
  const [unit, setUnit] = useState('ml');
  const [weight, setWeight] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [hsnCode, setHsnCode] = useState('');
  const [shelfLife, setShelfLife] = useState('');
  const [description, setDescription] = useState('');
  const [storage, setStorage] = useState('');
  const [certifications, setCertifications] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [maximized, setMaximized] = useState(false);

  function onImageChange(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => setImagePreview(ev.target.result);
    r.readAsDataURL(f);
  }

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f0eadd] shadow-2xl flex flex-col border border-[#d3c9b4]',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-2xl max-h-[90vh] rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>🆕 Create Product</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-[#6d5f4c] -mt-1">Creates a real entry in the Product Catalog (same fields as Product Catalog's own Add Product).</p>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">SKU Code <span className="text-[#b6453a]">*</span></label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., FG-0007" className={clsx(inputCls, 'w-full')} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Product Name <span className="text-[#b6453a]">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vitamin C Serum" className={clsx(inputCls, 'w-full')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Category <span className="text-[#b6453a]">*</span></label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={clsx(inputCls, 'w-full')}>
                <option value="">Select…</option>
                {CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Sub-Category</label>
              <input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="e.g., Shampoo, Serum" className={clsx(inputCls, 'w-full')} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Product Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={clsx(inputCls, 'w-full')}>
                <option value="">Select…</option>
                {CATALOG_PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={clsx(inputCls, 'w-full')}>
                {CATALOG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Base Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={clsx(inputCls, 'w-full')}>
                {CATALOG_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Ref Weight/Volume</label>
              <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 200" className={clsx(inputCls, 'w-full')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">GST Rate</label>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={clsx(inputCls, 'w-full')}>
                {CATALOG_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">HSN Code</label>
              <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g., 3305" className={clsx(inputCls, 'w-full')} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Shelf Life (months)</label>
              <input type="number" value={shelfLife} onChange={(e) => setShelfLife(e.target.value)} placeholder="e.g., 36" className={clsx(inputCls, 'w-full')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 items-start">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Product description, key claims, benefits…" className={clsx(inputCls, 'w-full')} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Image</label>
              <label className="w-16 h-16 border-2 border-dashed border-[#d3c9b4] rounded-lg flex items-center justify-center cursor-pointer overflow-hidden hover:border-[#968871] transition-colors bg-white">
                {imagePreview ? <img src={imagePreview} alt="Product" className="w-full h-full object-cover" /> : <span className="text-[#968871] text-[10px] text-center px-1">📷 Upload</span>}
                <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Storage</label>
              <input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Cool, dry place" className={clsx(inputCls, 'w-full')} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Certifications</label>
              <input value={certifications} onChange={(e) => setCertifications(e.target.value)} placeholder="Organic, Cruelty-Free…" className={clsx(inputCls, 'w-full')} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Barcode</label>
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="8901234567890" className={clsx(inputCls, 'w-full')} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#e2dac8] flex-shrink-0">
          <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
          <button
            onClick={() => {
              if (!code.trim() || !name.trim() || !category) { toast.error('SKU code, name and category are required'); return; }
              onSave({
                code: code.trim(), name: name.trim(), category, subCategory: subCategory.trim() || undefined,
                type: type || undefined, status, unit, weight: weight ? Number(weight) : undefined,
                gstRate, hsnCode: hsnCode.trim() || undefined, shelfLife: shelfLife ? Number(shelfLife) : undefined,
                description: description.trim() || undefined, storage: storage.trim() || undefined,
                certifications: certifications.trim() || undefined, barcode: barcode.trim() || undefined,
                image: imagePreview || undefined,
              });
            }}
            disabled={saving}
            className={clsx(accentBtn, 'flex-1 justify-center')}
          >
            {saving ? 'Creating…' : '💾 Create in Catalog'}
          </button>
        </div>
      </div>
    </div>
  );
}
