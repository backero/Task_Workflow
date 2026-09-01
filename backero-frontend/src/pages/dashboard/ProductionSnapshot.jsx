import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../api/axios';
import { STAGE_NAMES } from '../crm/production/StageSteps';
import { customerId } from '../../utils/leadHelpers';

// Same stat boxes as the Sample Production dashboard strip (/samples), same order/labels, each
// linking straight into that tab there — kept independent (own queries) so this can sit on a
// different page without rendering the whole thing.
const TAB_CONFIG = [
  { key: 'new', label: 'KYC', emoji: '🆕' },
  { key: 'qa', label: 'Q&A Inbox', emoji: '📥' },
  { key: 'payments', label: "RND's Payments", emoji: '💳' },
  { key: 'sample', label: 'Sample', emoji: '🧪' },
  { key: 'awaiting', label: 'Invoices', emoji: '⏳' },
  { key: 'linked', label: 'Orders', emoji: '🧾' },
  { key: 'procurement', label: 'Procurement', emoji: '📦', stage: 2 },
  { key: 'weighing', label: 'Weighing', emoji: '⚖️', stage: 3 },
  { key: 'bulkqc', label: 'Bulk QC', emoji: '🧫', stage: 4 },
  { key: 'packing', label: 'Product Packaging', emoji: '🎁', stage: 5 },
  { key: 'finalqc', label: 'Final QC', emoji: '✅', stage: 6 },
  { key: 'dispatch', label: 'Dispatch', emoji: '🚚', stage: 7 },
];

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}
// ISO 8601 week key, matching Kitchen Schedule's own weekKeyOf() so this hits the same cached
// week document instead of fetching it twice.
function weekKeyOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}
function personId(p) { return p?._id || p || null; }

function useSampleProductionLeads(enabled) {
  const { data: newLeadsData } = useQuery({
    queryKey: ['prod-snapshot', 'new-leads'],
    queryFn: () => Promise.all([
      api.get('/crm/leads', { params: { status: 'New Lead', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      api.get('/crm/leads', { params: { status: 'Follow-up', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
    ]),
    enabled,
  });
  const [newStatusLeads, followUpLeads] = newLeadsData || [[], []];

  const { data: stageLeadsData } = useQuery({
    queryKey: ['prod-snapshot', 'stage-leads'],
    queryFn: () => Promise.all([
      api.get('/crm/leads', { params: { status: 'Sample', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      api.get('/crm/leads', { params: { status: 'In Progress', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      api.get('/crm/leads', { params: { status: 'Ready to Dispatch', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
    ]),
    enabled,
  });
  const [sampleLeads, inProgressLeads, readyToDispatchLeads] = stageLeadsData || [[], [], []];

  const { data: sampleQueries } = useQuery({
    queryKey: ['prod-snapshot', 'queries'],
    queryFn: () => api.get('/crm/queries').then((r) => r.data.queries || []),
    enabled,
  });

  const { data: allProductionOrders } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => api.get('/production', { params: { limit: 200 } }).then((r) => r.data.data || []),
    enabled,
  });

  return { newStatusLeads, followUpLeads, sampleLeads, inProgressLeads, readyToDispatchLeads, sampleQueries, allProductionOrders };
}

// Just the stat-box row — used on its own where a page only has room for a quick glance (e.g.
// the founder's Command Center), and reused inside the full ProductionSnapshot below.
export function ProductionStatBoxes({ department }) {
  const enabled = department === 'Production';
  const { newStatusLeads, followUpLeads, sampleLeads, inProgressLeads, readyToDispatchLeads, sampleQueries, allProductionOrders } = useSampleProductionLeads(enabled);

  if (!enabled) return null;

  const sampleLeadIds = new Set(sampleLeads.map((l) => l._id));
  const relevantQueriesCount = (sampleQueries || []).filter((q) => sampleLeadIds.has(q.leadId?._id)).length;
  const awaitingCount = inProgressLeads.filter((l) => !l.productionOrderId).length;
  const linkedCount = inProgressLeads.filter((l) => l.productionOrderId).length + (readyToDispatchLeads || []).length;

  const counts = {
    new: newStatusLeads.length + followUpLeads.length,
    qa: relevantQueriesCount,
    payments: sampleLeads.length,
    sample: sampleLeads.length,
    awaiting: awaitingCount,
    linked: linkedCount,
  };
  TAB_CONFIG.filter((t) => t.stage).forEach((t) => {
    counts[t.key] = (allProductionOrders || []).filter((o) => o.stage === t.stage).length;
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {TAB_CONFIG.map((t) => (
        <Link key={t.key} to={`/samples?tab=${t.key}`} className="card px-4 py-3 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <span className="text-base">{t.emoji}</span>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{counts[t.key] || 0}</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1.5 truncate">{t.label}</p>
        </Link>
      ))}
    </div>
  );
}

// Shown on a Production-department staff member's own dashboard — the stat boxes above plus a
// live "who's doing what today" roster, client payment status, delivery risk, and raw-material
// shortages, all sourced from the same live data Sample Production / Kitchen Schedule use.
export default function ProductionSnapshot({ department }) {
  const enabled = department === 'Production';
  const { sampleLeads, inProgressLeads, readyToDispatchLeads, allProductionOrders } = useSampleProductionLeads(enabled);

  const { data: rawMaterials } = useQuery({
    queryKey: ['inventory', 'raw-materials', 'all'],
    queryFn: () => api.get('/inventory/raw-materials', { params: { limit: 500 } }).then((r) => r.data.materials || []),
    enabled,
  });

  const weekKey = weekKeyOf(mondayOf(new Date()));
  const { data: scheduleData } = useQuery({
    queryKey: ['production-schedule', weekKey],
    queryFn: () => api.get(`/production-schedule/${weekKey}`).then((r) => r.data),
    enabled,
  });
  const { data: usersData } = useQuery({
    queryKey: ['users', 'production-dept'],
    queryFn: () => api.get('/users', { params: { department: 'Production', isActive: true, limit: 200 } }).then((r) => r.data),
    enabled,
  });

  if (!enabled) return null;

  const slots = scheduleData?.week?.slots || scheduleData?.slots || [];
  const prodUsers = usersData?.data || usersData?.users || (Array.isArray(usersData) ? usersData : []) || [];
  const todayStr = toDateStr(new Date());

  const workRows = prodUsers.map((u) => {
    const slot = (slots || []).find((s) => {
      if (s.status === 'Removed' || s.date !== todayStr) return false;
      if (personId(s.leader) === u._id) return true;
      return (s.support || []).some((x) => personId(x) === u._id);
    });
    const order = slot?.productionOrderId;
    return {
      id: u._id,
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      busy: !!slot,
      client: order?.customer,
      product: order?.catalogProduct?.name,
      orderNumber: order?.orderNumber,
      stage: order?.stage,
    };
  });

  // Every lead currently live in the pipeline (Sample, In Progress, or Ready to Dispatch) —
  // R&D fee confirmation is per-lead, product payment is per-product on that lead, so both are
  // shown so Production can see at a glance whose work is blocked on payment.
  const activeLeadsMap = new Map();
  [...sampleLeads, ...inProgressLeads, ...(readyToDispatchLeads || [])].forEach((l) => activeLeadsMap.set(l._id, l));
  const paymentRows = [...activeLeadsMap.values()].map((l) => {
    const products = l.productLinks || [];
    const paidCount = products.filter((p) => p.paymentStatus === 'full_paid').length;
    return {
      id: l._id,
      name: l.name,
      custId: customerId(l),
      rndPaid: l.sampleDetails?.paymentStatus === 'full_paid',
      paidCount,
      totalProducts: products.length,
    };
  });

  // Same targetQty-vs-currentStock check the Procurement stage does per order, rolled up here
  // across every live batch (Procurement through Dispatch — the ingredients were already
  // consumed by then, but a shortfall recorded earlier still means the batch was short).
  const liveOrders = (allProductionOrders || []).filter((o) => o.stage >= 2 && o.stage <= 7);
  const openLink = (o) => (o.leadId ? `/samples?open=${o.leadId?._id || o.leadId}&leadTab=Production` : `/samples?tab=${TAB_CONFIG.find((t) => t.stage === o.stage)?.key || 'linked'}`);

  const shortageOrders = liveOrders
    .map((o) => {
      const shortfalls = (o.ingredients || [])
        .map((ing) => {
          const stock = (rawMaterials || []).find((m) => m._id === ing.rawMaterialId)?.currentStock ?? 0;
          const shortfall = Math.max(0, (ing.targetQty || 0) - stock);
          return { name: ing.name, shortfall, unit: ing.unit };
        })
        .filter((s) => s.shortfall > 0);
      return { order: o, shortfalls };
    })
    .filter((x) => x.shortfalls.length > 0);

  // A batch not yet dispatched with its delivery date already past, or within 2 days, is at
  // risk of missing the promise — the same 2-day window Kitchen Schedule's conflict check uses.
  const now = new Date();
  const riskOrders = liveOrders.filter((o) => {
    if (o.stage === 7 || !o.deliveryDate) return false;
    const days = Math.round((new Date(o.deliveryDate) - now) / 86400000);
    return days < 2;
  });

  return (
    <div className="space-y-4">
      <ProductionStatBoxes department={department} />

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">👷 Who's Doing What — Today</h3>
          <Link to="/production/kitchen" className="text-xs font-semibold text-blue-600 hover:underline">Kitchen Schedule →</Link>
        </div>
        {workRows.length === 0 ? (
          <p className="text-sm text-gray-400">No Production-department users found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workRows.map((w) => (
              <div
                key={w.id}
                className={clsx('rounded-xl border p-3', w.busy ? 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10' : 'border-gray-100 dark:border-[#1b2e4a]')}
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{w.name}</p>
                {w.busy ? (
                  <>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">🏭 {w.client || '—'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{w.product || w.orderNumber || '—'}</p>
                    <span className="badge badge-blue mt-1.5 inline-block">{STAGE_NAMES[w.stage] || `Stage ${w.stage}`}</span>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Available</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">💰 Client Payment Status</h3>
          <Link to="/samples" className="text-xs font-semibold text-blue-600 hover:underline">Open Batch Tracker →</Link>
        </div>
        {paymentRows.length === 0 ? (
          <p className="text-sm text-gray-400">No active clients in the pipeline right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paymentRows.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-100 dark:border-[#1b2e4a] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                  <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{p.custId}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className={clsx('badge', p.rndPaid ? 'badge-green' : 'badge-yellow')}>
                    R&amp;D {p.rndPaid ? 'Paid' : 'Pending'}
                  </span>
                  {p.totalProducts === 0 ? (
                    <span className="badge badge-gray">No products yet</span>
                  ) : (
                    <span className={clsx('badge', p.paidCount === p.totalProducts ? 'badge-green' : p.paidCount === 0 ? 'badge-yellow' : 'badge-blue')}>
                      {p.paidCount}/{p.totalProducts} paid
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">⚠️ Delivery Risk</h3>
          {riskOrders.length > 0 && <span className="badge badge-red">{riskOrders.length} at risk</span>}
        </div>
        {riskOrders.length === 0 ? (
          <p className="text-sm text-gray-400">No batches at delivery risk right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {riskOrders.map((o) => {
              const days = Math.round((new Date(o.deliveryDate) - now) / 86400000);
              return (
                <Link key={o._id} to={openLink(o)} className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10 p-3 hover:shadow-md transition-shadow">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.customer || o.orderNumber}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{o.catalogProduct?.name || o.orderNumber}</p>
                  <span className="badge badge-red mt-1.5 inline-block">
                    {days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`} — {STAGE_NAMES[o.stage]}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">📉 Raw Material Shortages</h3>
          <Link to="/inventory/rawmaterials" className="text-xs font-semibold text-blue-600 hover:underline">Raw Materials →</Link>
        </div>
        {shortageOrders.length === 0 ? (
          <p className="text-sm text-gray-400">No stock shortages blocking a batch right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shortageOrders.map(({ order: o, shortfalls }) => (
              <Link key={o._id} to={openLink(o)} className="rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/10 p-3 hover:shadow-md transition-shadow">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.customer || o.orderNumber}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{o.catalogProduct?.name || o.orderNumber} — {STAGE_NAMES[o.stage]}</p>
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1.5">
                  {shortfalls.map((s) => `${s.name}: short ${s.shortfall}${s.unit || ''}`).join(', ')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
