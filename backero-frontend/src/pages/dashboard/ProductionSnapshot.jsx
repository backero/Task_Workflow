import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  IdCard, Inbox, Wallet, FlaskConical, Clock, Receipt,
  Package, Scale, TestTube2, Gift, CheckCircle2, Truck,
  Users, DollarSign, TriangleAlert, TrendingDown,
} from 'lucide-react';
import api from '../../api/axios';
import { STAGE_NAMES } from '../crm/production/StageSteps';
import { customerId } from '../../utils/leadHelpers';

const { Text, Title } = Typography;

// Same stat boxes as the Sample Production dashboard strip (/samples), same order/labels, each
// linking straight into that tab there — kept independent (own queries) so this can sit on a
// different page without rendering the whole thing.
const TAB_CONFIG = [
  { key: 'new', label: 'KYC', icon: IdCard },
  { key: 'qa', label: 'Q&A Inbox', icon: Inbox },
  { key: 'payments', label: "RND's Payments", icon: Wallet },
  { key: 'sample', label: 'Sample', icon: FlaskConical },
  { key: 'awaiting', label: 'Invoices', icon: Clock },
  { key: 'linked', label: 'Orders', icon: Receipt },
  { key: 'procurement', label: 'Procurement', icon: Package, stage: 2 },
  { key: 'weighing', label: 'Weighing', icon: Scale, stage: 3 },
  { key: 'bulkqc', label: 'Bulk QC', icon: TestTube2, stage: 4 },
  { key: 'packing', label: 'Product Packaging', icon: Gift, stage: 5 },
  { key: 'finalqc', label: 'Final QC', icon: CheckCircle2, stage: 6 },
  { key: 'dispatch', label: 'Dispatch', icon: Truck, stage: 7 },
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
    <Row gutter={[12, 12]}>
      {TAB_CONFIG.map((t) => (
        <Col key={t.key} xs={12} sm={8} lg={4}>
          <Link to={`/samples?tab=${t.key}`}>
            <Card size="small" hoverable>
              <Space size={8}>
                <t.icon size={14} color="#8c8c8c" />
                <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{counts[t.key] || 0}</span>
              </Space>
              <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }} ellipsis>{t.label}</Text>
              </div>
            </Card>
          </Link>
        </Col>
      ))}
    </Row>
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
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <ProductionStatBoxes department={department} />

      <Card
        title={<Title level={5} style={{ marginBottom: 0 }}><Space size={8}><Users size={16} />Who's Doing What — Today</Space></Title>}
        extra={<Link to="/production/kitchen">Kitchen Schedule →</Link>}
      >
        {workRows.length === 0 ? (
          <Text type="secondary">No Production-department users found.</Text>
        ) : (
          <Row gutter={[12, 12]}>
            {workRows.map((w) => (
              <Col key={w.id} xs={24} sm={12} lg={8}>
                <Card size="small" style={w.busy ? { background: '#e6f4ff', borderColor: '#91caff' } : undefined}>
                  <Text strong style={{ fontSize: 13 }}>{w.name}</Text>
                  {w.busy ? (
                    <>
                      <div><Text style={{ fontSize: 12, color: '#1677ff' }}>{w.client || '—'}</Text></div>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{w.product || w.orderNumber || '—'}</Text></div>
                      <Tag color="blue" style={{ marginTop: 6 }}>{STAGE_NAMES[w.stage] || `Stage ${w.stage}`}</Tag>
                    </>
                  ) : (
                    <div><Text type="secondary" style={{ fontSize: 12 }}>Available</Text></div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Card
        title={<Title level={5} style={{ marginBottom: 0 }}><Space size={8}><DollarSign size={16} />Client Payment Status</Space></Title>}
        extra={<Link to="/samples">Open Batch Tracker →</Link>}
      >
        {paymentRows.length === 0 ? (
          <Text type="secondary">No active clients in the pipeline right now.</Text>
        ) : (
          <Row gutter={[12, 12]}>
            {paymentRows.map((p) => (
              <Col key={p.id} xs={24} sm={12} lg={8}>
                <Card size="small">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Text strong style={{ fontSize: 13 }} ellipsis>{p.name}</Text>
                    <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>{p.custId}</Text>
                  </div>
                  <Space size={4} style={{ marginTop: 8 }} wrap>
                    <Tag color={p.rndPaid ? 'green' : 'gold'}>R&amp;D {p.rndPaid ? 'Paid' : 'Pending'}</Tag>
                    {p.totalProducts === 0 ? (
                      <Tag>No products yet</Tag>
                    ) : (
                      <Tag color={p.paidCount === p.totalProducts ? 'green' : p.paidCount === 0 ? 'gold' : 'blue'}>
                        {p.paidCount}/{p.totalProducts} paid
                      </Tag>
                    )}
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Card
        title={<Title level={5} style={{ marginBottom: 0 }}><Space size={8}><TriangleAlert size={16} />Delivery Risk</Space></Title>}
        extra={riskOrders.length > 0 && <Tag color="red">{riskOrders.length} at risk</Tag>}
      >
        {riskOrders.length === 0 ? (
          <Text type="secondary">No batches at delivery risk right now.</Text>
        ) : (
          <Row gutter={[12, 12]}>
            {riskOrders.map((o) => {
              const days = Math.round((new Date(o.deliveryDate) - now) / 86400000);
              return (
                <Col key={o._id} xs={24} sm={12} lg={8}>
                  <Link to={openLink(o)}>
                    <Card size="small" hoverable style={{ background: '#fff2f0', borderColor: '#ffccc7' }}>
                      <Text strong style={{ fontSize: 13 }}>{o.customer || o.orderNumber}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{o.catalogProduct?.name || o.orderNumber}</Text></div>
                      <Tag color="red" style={{ marginTop: 6 }}>
                        {days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`} — {STAGE_NAMES[o.stage]}
                      </Tag>
                    </Card>
                  </Link>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

      <Card
        title={<Title level={5} style={{ marginBottom: 0 }}><Space size={8}><TrendingDown size={16} />Raw Material Shortages</Space></Title>}
        extra={<Link to="/inventory/rawmaterials">Raw Materials →</Link>}
      >
        {shortageOrders.length === 0 ? (
          <Text type="secondary">No stock shortages blocking a batch right now.</Text>
        ) : (
          <Row gutter={[12, 12]}>
            {shortageOrders.map(({ order: o, shortfalls }) => (
              <Col key={o._id} xs={24} sm={12} lg={8}>
                <Link to={openLink(o)}>
                  <Card size="small" hoverable style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                    <Text strong style={{ fontSize: 13 }}>{o.customer || o.orderNumber}</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{o.catalogProduct?.name || o.orderNumber} — {STAGE_NAMES[o.stage]}</Text></div>
                    <div><Text style={{ fontSize: 12, color: '#d46b08' }}>{shortfalls.map((s) => `${s.name}: short ${s.shortfall}${s.unit || ''}`).join(', ')}</Text></div>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </Space>
  );
}
