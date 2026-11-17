import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Row, Skeleton, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ReloadOutlined, SearchOutlined, ShopOutlined } from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text, Paragraph } = Typography;
const numbers = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const valueText = (value) => value == null ? 'Unavailable' : typeof value === 'number' ? numbers.format(value) : String(value);
const money = (value) => value == null ? 'Unavailable' : rupees.format(value);
const percent = (value) => value == null ? 'Unavailable' : `${numbers.format(value)}%`;
const label = (key) => key.replace(/_/g, ' ').replace(/\bpct\b/g, '(%)').replace(/\b30d\b/g, '(30 days)').replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseDate(value) {
  if (!value) return null;
  const timestamp = value.replace(' ', 'T');
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(value) {
  const date = parseDate(value);
  return date ? `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST` : 'Not captured';
}

function metricText(key, value) {
  if (typeof value !== 'number') return valueText(value);
  if (/(?:pct|percentage|conversion_rate)$/.test(key)) return percent(value);
  if (/(?:^|_)(?:sales|revenue|amount|balance|spend|price|budget|earnings|payable|wallet|bank_transfer)(?:_|$)/.test(key)) return money(value);
  return valueText(value);
}

function MetricSection({ title, area, description }) {
  const entries = Object.entries(area || {});
  return <Card title={title} style={{ marginBottom: 20 }}>
    {description && <Paragraph type="secondary">{description}</Paragraph>}
    {entries.length ? <Row gutter={[24, 20]}>{entries.map(([key, metric]) => <Col key={key} xs={24} sm={12} lg={8}>
      <Text type="secondary">{label(key)}</Text>
      <div style={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{metricText(key, metric?.value)}</div>
      <Text type="secondary" style={{ fontSize: 11 }}>Captured {dateText(metric?.capturedAt)}</Text>
    </Col>)}</Row> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This Supplier Panel section has not been captured yet." />}
  </Card>;
}

function DataTable({ title, rows = [], columns, coverage, fields, rowKey, description }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter((row) => fields.some((field) => String(row[field] ?? '').toLowerCase().includes(term))) : rows;
  }, [rows, fields, query]);
  return <Card style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
      <div>
        <Title level={5} style={{ margin: '0 0 4px' }}>{title}</Title>
        <Text type="secondary">Captured {dateText(coverage?.capturedAt)} · {numbers.format(rows.length)} captured rows</Text>
      </div>
      <Input prefix={<SearchOutlined />} aria-label={`Search ${title.toLowerCase()}`} placeholder="Search captured rows" allowClear value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 280, maxWidth: '100%' }} />
    </div>
    <Paragraph type="secondary">{description}</Paragraph>
    <Table size="small" dataSource={filtered} columns={columns} rowKey={rowKey} scroll={{ x: 1200 }}
      pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} rows` }}
      locale={{ emptyText: query ? 'No captured rows match your search.' : coverage?.capturedAt ? 'No product rows were returned in this capture.' : 'Product rows have not been captured yet. This does not mean the account has no products.' }} />
  </Card>;
}

const textColumn = (title, dataIndex, width = 160) => ({ title, dataIndex, width, render: valueText });
const numericColumn = (title, dataIndex, render = valueText) => ({ title, dataIndex, width: 140, align: 'right', render });
const productColumns = [
  textColumn('Product ID', 'product_id', 200), textColumn('Product', 'title', 320), numericColumn('Rating', 'rating'),
  numericColumn('Views', 'views'), numericColumn('Views change', 'views_change_pct', percent), numericColumn('Clicks', 'clicks'),
  numericColumn('Orders', 'orders'), numericColumn('Conversion', 'conversion_pct', percent), numericColumn('Sales', 'sales', money), numericColumn('Returns', 'returns_pct', percent),
];
const pricingColumns = [
  textColumn('Catalog ID', 'catalog_id', 190), textColumn('Style ID', 'style_id', 180), textColumn('Product', 'title', 320),
  textColumn('Size', 'size', 100), numericColumn('Stock', 'stock'), numericColumn('Growth · 30 days', 'growth_30d_pct', percent),
  numericColumn('Price', 'price', money), numericColumn('Bank transfer', 'bank_transfer', money), numericColumn('Suggested price', 'recommended_price', money),
  numericColumn('Suggested transfer', 'recommended_bank_transfer', money), textColumn('Panel insight', 'insight', 280), textColumn('Panel suggestion', 'action', 220),
];

export default function MeeshoSellerHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const request = useRef(null);
  const fetchData = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await api.get('/marketflow/meesho/seller-mirror', { signal: controller.signal });
      if (!controller.signal.aborted) { setData(response.data); setError(null); }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.response?.status === 403
        ? 'This Supplier Panel view requires an administrator account. Sign in as an admin to view the connected supplier data.'
        : err.response?.data?.message || 'The latest Meesho capture could not be loaded. Please try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60_000);
    return () => { clearInterval(timer); request.current?.abort(); };
  }, [fetchData]);

  const metrics = data?.metrics || {};
  const read = (key) => metrics.business_overview?.[key]?.value;
  const lastCapture = parseDate(data?.lastScrapedAt);
  const stale = lastCapture && Date.now() - lastCapture.getTime() > 8 * 60 * 60 * 1000;
  const clickMetric = metrics.business_overview?.clicks;
  const viewMetric = metrics.business_overview?.views;
  const matchingRange = clickMetric?.capturedAt && clickMetric.capturedAt === viewMetric?.capturedAt;
  const clicksPerView = matchingRange && typeof read('clicks') === 'number' && typeof read('views') === 'number' && read('views') > 0 ? read('clicks') / read('views') * 100 : null;
  const headline = [
    { title: 'Account views', value: read('views'), key: 'views' },
    { title: 'Account clicks', value: read('clicks'), key: 'clicks' },
    { title: 'Account orders', value: read('orders'), key: 'orders' },
    { title: 'Conversion', value: read('conversion_pct'), key: 'conversion_pct', formatter: percent },
    { title: 'Account sales', value: read('sales'), key: 'sales', formatter: money },
    { title: 'Clicks / views', value: clicksPerView, key: 'clicks', formatter: percent, derived: true },
  ];
  const items = data ? [
    { key: 'overview', label: 'Overview', children: <>
      <Alert type="info" showIcon message="Account totals use the selected seller report period" description="Views are Meesho panel views, not advertising impressions. The saved report period is not necessarily a rolling 7 days. Product-level figures are shown separately under Products." style={{ marginBottom: 20 }} />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>{headline.map((tile) => <Col xs={24} sm={12} xl={8} key={tile.title}>
        <Card size="small" style={{ height: '100%', borderTop: '3px solid #669c2c' }}>
          <Statistic title={tile.title} value={tile.value ?? 'Unavailable'} formatter={() => (tile.formatter || valueText)(tile.value)} valueStyle={{ fontSize: tile.value == null ? 19 : 29, fontWeight: 650 }} />
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>{tile.derived ? 'Calculated from captured clicks ÷ views' : 'Business Dashboard · selected report period'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dateText(metrics.business_overview?.[tile.key]?.capturedAt)}</Text>
        </Card>
      </Col>)}</Row>
      <MetricSection title="Business Dashboard" area={metrics.business_overview} />
      <MetricSection title="Home summary" area={metrics.home} description="Home figures retain the date labels reported by the supplier panel." />
    </> },
    { key: 'products', label: 'Products', children: <>
      <DataTable title="Product performance" rows={data.products} columns={productColumns} coverage={data.coverage?.products} fields={['product_id', 'title']} rowKey={(row, index) => `${row.product_id}-${index}`} description="Captured product-level figures from the selected report view. These rows are separate from account headline totals and may not include every account product." />
      <MetricSection title="Product summary" area={metrics.products} />
      <MetricSection title="Catalog uploads" area={metrics.catalog_uploads} />
    </> },
    { key: 'pricing', label: 'Pricing & stock', children: <>
      <DataTable title="Catalog pricing & stock" rows={data.pricing} columns={pricingColumns} coverage={data.coverage?.pricing} fields={['catalog_id', 'style_id', 'title']} rowKey={(row, index) => `${row.catalog_id}-${row.style_id}-${row.size}-${index}`} description="Read-only pricing and stock captured from Meesho. Suggested prices, transfers and actions are the panel's own suggestions; nothing on this page changes your seller account." />
      <MetricSection title="Pricing summary" area={metrics.pricing} />
    </> },
    { key: 'orders', label: 'Orders', children: <>
      <MetricSection title="Order summary" area={metrics.orders} description="Captured account-level order counters. Individual order records and complete order history are not included in this capture." />
      <MetricSection title="Dispatch" area={metrics.dispatch} />
    </> },
    { key: 'ads', label: 'Ads', children: <>
      <MetricSection title="Advertising" area={metrics.ads} description="Advertising figures are kept separate from Business Dashboard views and clicks." />
      <Alert type="info" showIcon message="Keyword metrics are not available" description="The current capture does not include keyword-level search terms, impressions, clicks or conversions." />
    </> },
    { key: 'payments', label: 'Payments & returns', children: <>
      <MetricSection title="Payments" area={metrics.payments} description="Payment amounts are shown in INR." />
      <MetricSection title="Returns" area={metrics.returns} />
    </> },
    { key: 'quality', label: 'Quality', children: <MetricSection title="Quality & account health" area={metrics.quality} /> },
  ] : [];

  return <main style={{ maxWidth: 1600, margin: '0 auto', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
      <div>
        <Space size={8} style={{ marginBottom: 8 }}><ShopOutlined style={{ color: '#669c2c' }} /><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>MARKETPLACE / MEESHO</Text></Space>
        <Title level={3} style={{ margin: '0 0 6px' }}>Meesho Supplier Panel</Title>
        <Text type="secondary">Your supplier data, brought into Backero.</Text>
      </div>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>Refresh saved data</Button>
    </div>
    {error && <Alert type="error" showIcon message="Unable to load Meesho data" description={error} action={<Button size="small" onClick={fetchData}>Retry</Button>} style={{ marginBottom: 20 }} />}
    {loading && !data && <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>}
    {data && <>
      <Card size="small" style={{ marginBottom: 20, background: '#f5f7ef' }}>
        <Space wrap size={[16, 8]}>
          <Tag color={data.mode === 'auto' ? 'green' : 'orange'}>{data.mode === 'auto' ? 'Supplier Panel capture' : `${data.mode || 'Unknown'} data source`}</Tag>
          <Text style={{ fontSize: 12 }}><strong>Last supplier read:</strong> {dateText(data.lastScrapedAt)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Website sync: {dateText(data.syncedAt)}</Text>
        </Space>
        <Paragraph type="secondary" style={{ fontSize: 12, margin: '8px 0 0' }}>This page checks saved data every minute. Refresh reloads the latest saved capture; it does not start a new supplier scrape. Each metric shows its own capture time.</Paragraph>
      </Card>
      {data.status?.state && data.status.state !== 'ok' && <Alert type="warning" showIcon message={data.status.state === 'needs_you' ? 'Sign in to Meesho with mobile OTP' : 'Some supplier data could not be refreshed'} description={<>
        <Paragraph style={{ marginBottom: data.status.state === 'needs_you' ? 8 : 0 }}>{data.status.detail || 'Check the Supplier Panel connection.'}{data.status.at ? ` Reported ${dateText(data.status.at)}.` : ''} Saved data is still shown below.</Paragraph>
        {data.status.state === 'needs_you' && <Paragraph style={{ marginBottom: 0 }}>Sign in with your mobile number and complete Meesho's OTP verification in the existing Supplier Panel collector browser on the computer running the sync. Meesho requires this verification before new data can sync. Refresh saved data only reloads stored figures; it does not reconnect your seller account.</Paragraph>}
      </>} style={{ marginBottom: 20 }} />}
      {stale && <Alert type="warning" showIcon message="Saved supplier data is more than 8 hours old" description="These figures may have changed in Meesho. Check the supplier connection; refreshing this page only reloads the saved capture." style={{ marginBottom: 20 }} />}
      {!lastCapture && <Alert type="info" showIcon message="Waiting for the first supplier capture" description="Missing values are shown as unavailable rather than zero." style={{ marginBottom: 20 }} />}
      <Tabs items={items} destroyOnHidden={false} />
      {data.limitations?.length > 0 && <Card size="small" style={{ marginTop: 24 }}><Text strong>Capture coverage</Text><ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#57534e', fontSize: 12, lineHeight: 1.9 }}>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></Card>}
    </>}
    {!loading && !data && !error && <Empty description="No Meesho capture is available." />}
  </main>;
}
