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
  if (!value || typeof value !== 'string') return null;
  const timestamp = value.replace(' ', 'T');
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(value) {
  const date = parseDate(value);
  return date ? `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST` : 'Not captured';
}

function isStale(value) {
  const date = parseDate(value);
  return date && Date.now() - date.getTime() > 8 * 60 * 60 * 1000;
}

function metricText(key, value) {
  if (typeof value !== 'number') return valueText(value);
  if (/(?:pct|percentage)$/.test(key)) return percent(value);
  if (/(?:^|_)(?:sales|revenue|amount|balance|spend|price|budget|earnings|payable|wallet)(?:_|$)/.test(key)) return money(value);
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
      {isStale(metric?.capturedAt) && <Tag color="orange" style={{ marginLeft: 6 }}>Over 8h old</Tag>}
    </Col>)}</Row> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This Seller Panel section has not been captured yet." />}
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
        {isStale(coverage?.capturedAt) && <Tag color="orange" style={{ marginLeft: 8 }}>Over 8h old</Tag>}
      </div>
      <Input prefix={<SearchOutlined />} aria-label={`Search ${title.toLowerCase()}`} placeholder="Search captured rows" allowClear value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 280, maxWidth: '100%' }} />
    </div>
    <Paragraph type="secondary">{description}</Paragraph>
    <Table size="small" dataSource={filtered} columns={columns} rowKey={rowKey} scroll={{ x: 1200 }}
      pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} rows` }}
      locale={{ emptyText: query ? 'No captured rows match your search.' : coverage?.capturedAt ? 'No rows were returned in this capture.' : 'Records have not been captured yet. This does not mean the account has no records.' }} />
  </Card>;
}

const textColumn = (title, dataIndex, width = 160) => ({ title, dataIndex, width, render: valueText });
const numericColumn = (title, dataIndex, render = valueText) => ({ title, dataIndex, width: 145, align: 'right', render });
const captureColumn = { title: 'Captured at (IST)', dataIndex: 'captured_at', width: 220, render: dateText };
const listingColumns = [
  textColumn('SKU', 'sku', 200), textColumn('Product', 'title', 320), textColumn('Brand', 'brand'), textColumn('Category', 'category', 200),
  textColumn('Status', 'status'), numericColumn('Stock', 'stock'), numericColumn('Price', 'price', money), numericColumn('MRP', 'mrp', money),
  numericColumn('MSP', 'msp', money), numericColumn('Gross payable', 'gross_payable', money), numericColumn('Panel product rating (%)', 'product_rating_pct', percent),
  numericColumn('Rating (panel scale)', 'rating'), numericColumn('Reviews', 'reviews'), textColumn('Fulfilment', 'fulfilment'), textColumn('POG ID', 'pog_id', 180),
  textColumn('Panel last synced', 'last_synced', 200), captureColumn,
];
const performanceColumns = [
  textColumn('SKU', 'sku', 200), textColumn('Product', 'title', 320), numericColumn('Orders · 30 days', 'orders_30d'),
  numericColumn('Transfer · 30 days', 'transfer_amount_30d', money), numericColumn('Bad rating contribution', 'bad_pct', percent),
  numericColumn('Returns', 'return_pct', percent), captureColumn,
];
const settlementColumns = [
  textColumn('Settlement reference', 'ref', 250), textColumn('Settlement date', 'date', 180), numericColumn('Amount', 'amount', money),
  numericColumn('Transactions', 'transactions'), captureColumn,
];

function derivedRatio(area, numerator, denominator) {
  const top = area?.[numerator];
  const bottom = area?.[denominator];
  if (!top?.capturedAt || top.capturedAt !== bottom?.capturedAt || typeof top.value !== 'number' || typeof bottom?.value !== 'number' || bottom.value <= 0) return null;
  return top.value / bottom.value * 100;
}

function AdsLoginNotice({ section, status }) {
  if (section?.state !== 'needs_login') return null;
  return <Alert type="warning" showIcon message="Snapdeal Ads needs its own sign-in"
    description={<>
      <Paragraph style={{ marginBottom: 8 }}>{section.detail || 'Sign in to Snapdeal Ads in the existing seller browser. The Seller Panel connection is separate.'}</Paragraph>
      {status && <Paragraph style={{ marginBottom: 8 }}>Latest read: {status.state}. {status.detail}{status.at ? ` Reported ${dateText(status.at)}.` : ''}</Paragraph>}
      <Paragraph style={{ marginBottom: 0 }}>Complete the Ads sign-in in that browser to resume advertising reads. Refresh saved data only reloads stored figures. Older advertising metrics remain labeled with their capture dates.{section.checkedAt ? ` Checked ${dateText(section.checkedAt)}.` : ''}</Paragraph>
    </>} style={{ marginBottom: 20 }} />;
}

export default function SnapdealSellerHub() {
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
      const response = await api.get('/marketflow/snapdeal/seller-mirror', { signal: controller.signal });
      if (!controller.signal.aborted) { setData(response.data); setError(null); }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.response?.status === 403
        ? 'This Seller Panel view requires an administrator account. Sign in as an admin to view the connected seller data.'
        : err.response?.data?.message || 'The latest Snapdeal capture could not be loaded. Please try again.');
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
  const dashboard = metrics.dashboard || {};
  const ads = metrics.ads || {};
  const adsSection = data?.sections?.ads;
  const failedAreas = data?.status?.failedAreas;
  const adsOnlyFailure = adsSection?.state === 'needs_login' && data?.status?.state === 'partial'
    && Array.isArray(failedAreas) && failedAreas.length > 0 && failedAreas.every((area) => area === 'ads');
  const adsCtr = derivedRatio(ads, 'clicks', 'impressions');
  const adsCvr = derivedRatio(ads, 'conversions', 'clicks');
  const tiles = [
    { key: 'sales_completed', title: 'Completed sales', formatter: money },
    { key: 'orders_processed', title: 'Orders processed' },
    { key: 'orders_booked', title: 'Orders booked' },
    { key: 'orders_returned', title: 'Orders returned' },
  ];
  const tabItems = data ? [
    { key: 'overview', label: 'Overview', children: <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>{tiles.map((tile) => <Col xs={24} sm={12} xl={6} key={tile.key}>
        <Card size="small" style={{ height: '100%', borderTop: '3px solid #669c2c' }}>
          <Statistic title={tile.title} value={dashboard[tile.key]?.value ?? 'Unavailable'} formatter={() => (tile.formatter || valueText)(dashboard[tile.key]?.value)} valueStyle={{ fontSize: dashboard[tile.key]?.value == null ? 19 : 29, fontWeight: 650 }} />
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Seller Panel dashboard · last 30 days</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dateText(dashboard[tile.key]?.capturedAt)}</Text>
        </Card>
      </Col>)}</Row>
      <MetricSection title="Seller dashboard · last 30 days" area={metrics.dashboard} />
      <MetricSection title="Account health" area={metrics.health} />
      <MetricSection title="Catalog summary" area={metrics.catalog} />
    </> },
    { key: 'listings', label: 'Listings & stock', children: <DataTable title="Captured listings & stock" rows={data.listings} columns={listingColumns} coverage={data.coverage?.listings} fields={['sku', 'title', 'brand', 'category', 'status', 'pog_id']} rowKey={(row, index) => `${row.sku || row.pog_id}-${index}`} description="Read-only catalog records captured from Seller Panel. Product rating percentages retain the panel's percentage scale; they are not star ratings. Check each row's capture time before acting on stock or prices." /> },
    { key: 'orders', label: 'Orders & returns', children: <>
      <Alert type="info" showIcon message="Account summaries, not individual order history" description="This capture contains Seller Panel order and return counters. It does not include individual order IDs, customer details, or a complete order archive." style={{ marginBottom: 20 }} />
      <MetricSection title="Order summary" area={metrics.orders} />
      <MetricSection title="Return summary" area={metrics.returns} />
    </> },
    { key: 'performance', label: 'Performance', children: <DataTable title="Product performance" rows={data.performance} columns={performanceColumns} coverage={data.coverage?.performance} fields={['sku', 'title']} rowKey={(row, index) => `${row.sku}-${index}`} description="Captured SKU performance rows from the panel's product performance view. This may be a selected subset, not every product in the account. Orders and transfers use the reported 30-day period." /> },
    { key: 'payments', label: 'Payments & settlements', children: <>
      <MetricSection title="Payments" area={metrics.payments} description="Payment amounts are shown in INR and retain the panel's own labels." />
      <DataTable title="Captured settlements" rows={data.settlements} columns={settlementColumns} coverage={data.coverage?.settlements} fields={['ref', 'date']} rowKey={(row, index) => `${row.ref}-${index}`} description="Read-only settlement references and payment totals captured from Seller Panel. These rows do not imply the account's full payment history." />
    </> },
    { key: 'ads', label: 'Ads', children: <>
      <AdsLoginNotice section={adsSection} status={adsOnlyFailure ? data.status : null} />
      <Alert type="info" showIcon message="Saved advertising capture · separate from organic traffic" description={`Advertising report period: ${valueText(ads.range_from?.value)} to ${valueText(ads.range_to?.value)}. The values below retain their own capture dates. A failed new ads read may leave an older capture visible.`} style={{ marginBottom: 20 }} />
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {[{ title: 'Ads CTR', value: adsCtr, note: 'Captured clicks ÷ impressions', date: ads.clicks?.capturedAt }, { title: 'Ads CVR', value: adsCvr, note: 'Captured conversions ÷ clicks', date: ads.conversions?.capturedAt }].map((tile) => <Col xs={24} sm={12} key={tile.title}><Card size="small">
          <Statistic title={tile.title} value={tile.value ?? 'Unavailable'} formatter={() => percent(tile.value)} />
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>{tile.note} · matching capture required</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{tile.value == null ? 'Inputs unavailable or not from the same capture' : dateText(tile.date)}</Text>
        </Card></Col>)}
      </Row>
      <MetricSection title="Advertising summary" area={metrics.ads} description="Advertising totals apply to the report dates above. They are not account-wide organic traffic figures." />
      <Alert type="info" showIcon message="Keyword-level metrics are unavailable" description="This Seller Panel capture does not include keyword-level search terms, impressions, clicks or conversions." />
    </> },
  ] : [];

  return <main style={{ maxWidth: 1600, margin: '0 auto', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
      <div>
        <Space size={8} style={{ marginBottom: 8 }}><ShopOutlined style={{ color: '#669c2c' }} /><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>MARKETPLACE / SNAPDEAL</Text></Space>
        <Title level={3} style={{ margin: '0 0 6px' }}>Snapdeal Seller Panel</Title>
        <Text type="secondary">Your seller data, brought into Backero.</Text>
      </div>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>Refresh saved data</Button>
    </div>
    {error && <Alert type="error" showIcon message="Unable to load Snapdeal data" description={error} action={<Button size="small" onClick={fetchData}>Retry</Button>} style={{ marginBottom: 20 }} />}
    {loading && !data && <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>}
    {data && <>
      <Card size="small" style={{ marginBottom: 20, background: '#f5f7ef' }}>
        <Space wrap size={[16, 8]}>
          <Tag color={data.mode === 'browser' ? 'green' : 'orange'}>{data.mode === 'browser' ? 'Seller Panel capture' : `${data.mode || 'Unknown'} data source`}</Tag>
          <Text style={{ fontSize: 12 }}><strong>Last seller read:</strong> {dateText(data.lastScrapedAt)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Website sync: {dateText(data.syncedAt)}</Text>
        </Space>
        <Paragraph type="secondary" style={{ fontSize: 12, margin: '8px 0 0' }}>This page checks saved data every minute. Refresh reloads the latest saved capture; it does not start a new seller scrape. Each section and record shows its own capture time.</Paragraph>
      </Card>
      <AdsLoginNotice section={adsSection} status={adsOnlyFailure ? data.status : null} />
      {data.status?.state && data.status.state !== 'ok' && !adsOnlyFailure && <Alert type="warning" showIcon message={data.status.state === 'needs_you' ? 'Snapdeal Seller Panel login needs attention' : 'Some seller data could not be refreshed'} description={`${data.status.detail || 'Check the Seller Panel connection.'}${data.status.at ? ` Reported ${dateText(data.status.at)}.` : ''} Previously captured figures remain dated below and may not reflect the latest seller data.`} style={{ marginBottom: 20 }} />}
      {isStale(data.lastScrapedAt) && <Alert type="warning" showIcon message="Saved seller data is more than 8 hours old" description="These figures may have changed in Snapdeal. Check the seller connection; refreshing this page only reloads the saved capture." style={{ marginBottom: 20 }} />}
      {!parseDate(data.lastScrapedAt) && <Alert type="info" showIcon message="Waiting for the first Seller Panel capture" description="Missing values are shown as unavailable rather than zero." style={{ marginBottom: 20 }} />}
      <Tabs items={tabItems} destroyOnHidden={false} />
      {data.limitations?.length > 0 && <Card size="small" style={{ marginTop: 24 }}><Text strong>Capture coverage</Text><ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#57534e', fontSize: 12, lineHeight: 1.9 }}>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></Card>}
    </>}
    {!loading && !data && !error && <Empty description="No Snapdeal capture is available." />}
  </main>;
}
