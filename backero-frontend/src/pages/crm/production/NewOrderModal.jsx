import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../../api/axios';
import { Card } from '../sampleTheme';
import { customerId } from '../../../utils/leadHelpers';
import { CreateCatalogProductModal } from '../CreateCatalogProductModal';
import OrderSpecTabs, { Field, inputCls } from './orderSpecFields';

// New Order Sheet — manual/direct order intake (no CRM lead hand-off needed first). Ported
// from the "New Order Sheet" reference file: same one-scrolling-page SPEC/QC/Packaging/Payment/
// Custom-Checks layout (via OrderSpecTabs — shared with the Stage 0 "Customer Details" edit
// panel so both surfaces read the exact same field set) restyled onto the cream/amber theme and
// wired to the real APIs instead of localStorage stubs. Customers
// always come from the existing KYC/Lead directory (never typed fresh here) — pick one, then
// link an existing Product Catalog SKU or create a new one inline, same as the rest of the app
// does it. Every product line becomes its own Production Order (POST /production), created
// without a leadId — same "manual + New Order flow" the backend's link-production comment
// already anticipates, so it shows up as an orphan order in the Orders tab.

const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };
const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';
const accentBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50';

function emptyLine() {
  return {
    catalogProduct: null, catalogSearch: '',
    batchSizeKg: 10, plannedQuantity: '', container: '', priority: 'Normal', deliveryDate: '', notes: '',
    crmSpec: {},
  };
}

export default function NewOrderModal({ onClose, onCreated, initialCustomerSearch = '' }) {
  const qc = useQueryClient();

  const [maximized, setMaximized] = useState(false);
  const [customerSearch, setCustomerSearch] = useState(initialCustomerSearch);
  const [selectedLead, setSelectedLead] = useState(null);
  const { data: leadMatches, isFetching: searchingLeads } = useQuery({
    queryKey: ['crm', 'leads', 'search', customerSearch],
    queryFn: () => api.get('/crm/leads', { params: { search: customerSearch, limit: 10 } }).then((r) => r.data.data || r.data.leads || []),
    enabled: customerSearch.trim().length >= 2,
  });

  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    staleTime: 5 * 60 * 1000,
  });
  const activeCatalogProducts = (catalogProducts || []).filter((p) => p.status !== 'Discontinued');

  const [lines, setLines] = useState([emptyLine()]);
  const [activeLine, setActiveLine] = useState(0);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [busy, setBusy] = useState(false);

  const line = lines[activeLine];
  const patchLine = (patch) => setLines((ls) => ls.map((l, i) => (i === activeLine ? { ...l, ...patch } : l)));
  const patchSpec = (key, val) => patchLine({ crmSpec: { ...line.crmSpec, [key]: val } });

  const catalogMatches = line.catalogSearch
    ? activeCatalogProducts.filter((p) => (p.name || '').toLowerCase().includes(line.catalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(line.catalogSearch.toLowerCase()))
    : activeCatalogProducts;

  const createProductMutation = useMutation({
    mutationFn: (body) => api.post('/catalog/products', body).then((r) => r.data.product),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      patchLine({ catalogProduct: created, catalogSearch: '' });
      setShowCreateProduct(false);
      toast.success(`${created.name} added to Product Catalog`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create product'),
  });

  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
    setActiveLine(lines.length);
  }
  function removeLine(i) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
    setActiveLine((a) => (a >= i ? Math.max(0, a - 1) : a));
  }

  async function createOrders() {
    if (!selectedLead) { toast.error('Select a customer first'); return; }
    const valid = lines.filter((l) => l.catalogProduct);
    if (!valid.length) { toast.error('Select a product for at least one line'); return; }
    for (const l of valid) {
      if (!l.batchSizeKg || Number(l.batchSizeKg) <= 0) { toast.error('Enter a valid batch size (kg) for every product line'); return; }
    }
    setBusy(true);
    // Multiple lines under one customer share an order group tag (same idea as the reference
    // sheet's groupId) so it's traceable later that they were placed together in one pass.
    const orderGroupId = valid.length > 1 ? `OG-${Date.now()}` : undefined;
    try {
      const created = [];
      for (const l of valid) {
        const res = await api.post('/production', {
          catalogProduct: l.catalogProduct._id,
          batchSizeKg: Number(l.batchSizeKg),
          plannedQuantity: l.plannedQuantity ? Number(l.plannedQuantity) : undefined,
          customer: selectedLead.name,
          contact: selectedLead.whatsapp || selectedLead.phone || '',
          container: l.container || undefined,
          priority: l.priority,
          deliveryDate: l.deliveryDate || undefined,
          notes: l.notes || undefined,
          crmSpec: orderGroupId ? { ...l.crmSpec, orderGroupId } : l.crmSpec,
        });
        created.push(res.data.order);
      }
      toast.success(`${created.length} order(s) created for ${selectedLead.name}`);
      onCreated?.(created);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create order');
    } finally {
      setBusy(false);
    }
  }

  const detailsContent = (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-bold text-[#2e241b] mb-3">Customer <span className="text-[#b6453a]">*</span></h3>
        {selectedLead ? (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#dce9d4]">
            <div>
              <p className="text-sm font-semibold text-[#2e241b]">{selectedLead.name} <span className="text-[#968871] font-mono text-xs">{customerId(selectedLead)}</span></p>
              <p className="text-xs text-[#6d5f4c]">{selectedLead.whatsapp || selectedLead.phone || '—'} · {selectedLead.city || '—'}</p>
            </div>
            <button onClick={() => { setSelectedLead(null); setCustomerSearch(''); }} className="text-xs font-semibold text-[#8c3a30]">Change</button>
          </div>
        ) : (
          <div>
            <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search existing customer by name, phone, company…" className={inputCls} />
            {customerSearch.trim().length >= 2 && (
              <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-40 overflow-y-auto">
                {searchingLeads && <div className="px-3 py-2 text-xs text-[#968871]">Searching…</div>}
                {!searchingLeads && (leadMatches || []).length === 0 && (
                  <div className="px-3 py-2 text-xs text-[#968871]">No customer found — add them via KYC first.</div>
                )}
                {(leadMatches || []).slice(0, 8).map((l) => (
                  <button key={l._id} type="button" onClick={() => { setSelectedLead(l); setCustomerSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between items-center">
                    <span className="text-[#2e241b]">{l.name} <span className="text-[#968871]">— {l.whatsapp || l.phone || '—'}</span></span>
                    <span className="text-[#968871] font-mono">{customerId(l)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-[#2e241b] mb-3">Product <span className="text-[#b6453a]">*</span></h3>
        {line.catalogProduct ? (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#dce9d4]">
            <div>
              <p className="text-sm font-semibold text-[#2e241b]">{line.catalogProduct.name} <span className="text-[#968871] font-mono text-xs">{line.catalogProduct.code}</span></p>
              <p className="text-xs text-[#6d5f4c]">{line.catalogProduct.formulation?.rows?.length || 0} ingredient(s) in formulation</p>
            </div>
            <button onClick={() => patchLine({ catalogProduct: null })} className="text-xs font-semibold text-[#8c3a30]">Change</button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <input value={line.catalogSearch} onChange={(e) => patchLine({ catalogSearch: e.target.value })} placeholder="Search catalog products…" className={inputCls} />
              <button onClick={() => setShowCreateProduct(true)} className={clsx(outlineBtn, 'flex-shrink-0 whitespace-nowrap')}>+ New Product</button>
            </div>
            {line.catalogSearch && (
              <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-40 overflow-y-auto">
                {catalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found.</div>}
                {catalogMatches.slice(0, 8).map((p) => (
                  <button key={p._id} type="button" onClick={() => patchLine({ catalogProduct: p, catalogSearch: '' })}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                    <span className="text-[#2e241b]">{p.name}</span>
                    <span className="text-[#968871] font-mono">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Batch Size (kg) — scales the formula"><input type="number" min="0.1" step="0.1" value={line.batchSizeKg} onChange={(e) => patchLine({ batchSizeKg: e.target.value })} className={inputCls} /></Field>
          <Field label="Order Qty (units)"><input type="number" min="1" value={line.plannedQuantity} onChange={(e) => patchLine({ plannedQuantity: e.target.value })} placeholder="e.g. 5000" className={inputCls} /></Field>
          <Field label="Container"><input value={line.container} onChange={(e) => patchLine({ container: e.target.value })} placeholder="e.g. 50ml Amber Glass Jar" className={inputCls} /></Field>
          <Field label="Priority">
            <select value={line.priority} onChange={(e) => patchLine({ priority: e.target.value })} className={inputCls}>
              {['Low', 'Normal', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Requested Delivery"><input type="date" value={line.deliveryDate} onChange={(e) => patchLine({ deliveryDate: e.target.value })} className={inputCls} /></Field>
        </div>
        <div className="mt-3"><Field label="Order Notes"><textarea rows={2} value={line.notes} onChange={(e) => patchLine({ notes: e.target.value })} placeholder="Commercial notes, incoterms, PO reference…" className={inputCls} /></Field></div>
      </Card>
    </div>
  );

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center', maximized ? 'p-0' : 'p-4')} style={bodyFont}>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative bg-white shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-6xl rounded-2xl')}
        style={maximized ? undefined : { maxHeight: '92vh' }}>
        <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <div>
            <h3 className="font-bold text-[#2e241b]" style={displayFont}>🆕 New Order — Product Specification &amp; QC Plan</h3>
            <p className="text-xs text-[#6d5f4c] mt-0.5">Pick an existing customer, link a catalog product (or create one), then capture the SPEC/QC plan in one pass.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'}
              className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">
              {maximized ? '🗗' : '🗖'}
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-56 flex-shrink-0 border-r border-[#e2dac8] bg-[#f0eadd] p-3 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#968871] mb-2">Products (from catalogue)</p>
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i}
                  onClick={() => setActiveLine(i)}
                  className={clsx('rounded-lg border-[1.5px] px-2.5 py-2 cursor-pointer flex items-start justify-between gap-1.5',
                    i === activeLine ? 'border-[#f2b23e] bg-[#f3e3c2]' : 'border-[#d3c9b4] bg-[#fff] hover:border-[#968871]')}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#2e241b] truncate">{l.catalogProduct ? l.catalogProduct.name : 'New line — select product'}</p>
                    <p className="text-[10px] text-[#968871] truncate">{l.catalogProduct ? l.catalogProduct.code : `Line ${i + 1}`}{l.plannedQuantity ? ` · ${l.plannedQuantity} units` : ''}</p>
                  </div>
                  {lines.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); removeLine(i); }} title="Remove line" className="text-[#8c3a30] font-bold text-sm flex-shrink-0">×</span>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addLine} className="w-full mt-2 border-2 border-dashed border-[#968871] text-[#7a5a10] rounded-lg py-2 text-xs font-bold hover:bg-[#f3e3c2]">+ Add product</button>
            <p className="text-[9.5px] text-[#968871] mt-2 leading-relaxed">Each product becomes its own order &amp; job sheet under the same customer ID and order group.</p>
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            <OrderSpecTabs
              crmSpec={line.crmSpec}
              onChange={patchSpec}
              locked={false}
              detailsContent={detailsContent}
            />
          </div>
        </div>

        <div className={clsx('flex items-center justify-between gap-3 px-5 py-4 border-t border-[#e2dac8] flex-shrink-0 bg-[#f0eadd]', !maximized && 'rounded-b-2xl')}>
          <span className="text-xs text-[#968871]">{lines.filter((l) => l.catalogProduct).length} of {lines.length} line(s) ready</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className={outlineBtn}>Cancel</button>
            <button onClick={createOrders} disabled={busy} className={accentBtn}>{busy ? 'Creating…' : `✅ Create Order${lines.filter((l) => l.catalogProduct).length > 1 ? 's' : ''}`}</button>
          </div>
        </div>
      </div>

      {showCreateProduct && (
        <CreateCatalogProductModal
          nextCode={`FG-${String((catalogProducts?.length || 0) + 1).padStart(4, '0')}`}
          defaultName=""
          saving={createProductMutation.isPending}
          onClose={() => setShowCreateProduct(false)}
          onSave={(payload) => createProductMutation.mutate(payload)}
        />
      )}
    </div>
  );
}
