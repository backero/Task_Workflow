import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Row, Skeleton, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ReloadOutlined, SearchOutlined, ShopOutlined } from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text, Paragraph } = Typography;
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const label = (key) => key.replace(/_/g, ' ').replace(/\bpct\b/g, '(%)').replace(/\b30d\b/g, '(30 days)').replace(/\b7d\b/g, '(7 days)').replace(/\b\w/g, (c) => c.toUpperCase());
const valueText = (value) => value == null ? 'Unavailable' : typeof value === 'number' ? numberFormat.format(value) : String(value);
const money = (value) => value == null ? 'Unavailable' : moneyFormat.format(value);
const percent = (value) => value == null ? 'Unavailable' : `${numberFormat.format(value)}%`;

function dateText(value) {
  if (!value) return 'Not captured';
  // Seller Hub stores local IST timestamps; Mongo timestamps carry their own UTC offset.
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}+05:30`);
  if (Number.isNaN(date.getTime())) return 'Capture time unavailable';
  return `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;
}

function MetricSection({ title, area, description }) {
  const entries = Object.entries(area || {});
  return (
    <Card title={title} style={{ marginBottom: 20 }}>
      {description && <Paragraph type="secondary">{description}</Paragraph>}
      {!entries.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This Seller Hub section has not been captured yet." /> : (
        <Row gutter={[24, 20]}>
          {entries.map(([key, metric]) => (
            <Col xs={24} sm={12} lg={8} key={key}>
              <Text type="secondary">{label(key)}</Text>
              <div style={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{valueText(metric?.value)}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>Captured {dateText(metric?.capturedAt)}</Text>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}

function CapturedTable({ title, rows = [], columns, coverage, searchFields, description, rowKey }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(query))) : rows;
  }, [rows, search, searchFields]);
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={5} style={{ margin: '0 0 4px' }}>{title}</Title>
          <Text type="secondary">Captured {dateText(coverage?.capturedAt)} · {numberFormat.format(rows.length)} captured rows</Text>
        </div>
        <Input prefix={<SearchOutlined />} aria-label={`Search ${title.toLowerCase()}`} placeholder="Search captured rows" value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 260, maxWidth: '100%' }} />
      </div>
      {description && <Paragraph type="secondary">{description}</Paragraph>}
      {coverage?.period && <Paragraph type="secondary">Report period: {typeof coverage.period === 'string' ? coverage.period : JSON.stringify(coverage.period)}</Paragraph>}
      {coverage?.status && coverage.status !== 'ok' && coverage.status !== 'complete' && <Alert
        type="warning" showIcon style={{ marginBottom: 16 }}
        message={coverage.status === 'unavailable' ? 'Detailed records are not available' : 'These records have limited coverage'}
        description={coverage.detail || 'Only the records captured from the selected Seller Hub view are shown. This is not a complete account history.'}
      />}
      <Table
        size="small" rowKey={rowKey} dataSource={filtered} columns={columns}
        scroll={{ x: 1000 }} pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} rows` }}
        locale={{ emptyText: search ? 'No captured rows match your search.' : coverage?.capturedAt ? 'No rows were returned in this capture.' : 'Rows have not been captured yet. This does not mean there are none in Seller Hub.' }}
      />
    </Card>
  );
}

const textColumn = (title, dataIndex, width = 140) => ({ title, dataIndex, width, render: valueText });
const numericColumn = (title, dataIndex, render = valueText) => ({ title, dataIndex, width: 130, align: 'right', render });
const listingColumns = [
  textColumn('SKU', 'sku', 190), textColumn('Product', 'title', 300), textColumn('Category', 'category', 180),
  numericColumn('Price', 'price', money), numericColumn('Final price', 'final_price', money), numericColumn('MRP', 'mrp', money),
  numericColumn('Stock', 'stock'), textColumn('Days on hand', 'days_on_hand'), numericColumn('Return rate', 'return_rate_pct', percent),
  textColumn('Quality', 'quality'), numericColumn('Rating', 'rating'),
];
const orderColumns = [
  textColumn('SKU', 'sku', 190), textColumn('FSN', 'fsn', 180), textColumn('Product', 'title', 300),
  numericColumn('Quantity', 'qty'), numericColumn('Group orders', 'orders'), numericColumn('Price from', 'price_low', money), numericColumn('Price to', 'price_high', money),
];
const historyColumns = [
  textColumn('Order ID', 'order_id', 200), textColumn('Shipment ID', 'shipment_id', 200), textColumn('Order item ID', 'order_item_id', 200),
  textColumn('SKU', 'sku', 190), textColumn('FSN', 'fsn', 180), textColumn('Product', 'title', 300),
  numericColumn('Quantity', 'quantity'), numericColumn('Price', 'price', money), textColumn('Order date', 'order_date', 180),
  textColumn('Status', 'status', 160), textColumn('Dispatch by', 'dispatch_by', 180),
];
const returnColumns = [
  textColumn('Return ID', 'return_id', 200), textColumn('Order ID', 'order_id', 200), textColumn('SKU', 'sku', 190), textColumn('FSN', 'fsn', 180),
  textColumn('Product', 'title', 300), numericColumn('Quantity', 'quantity'), textColumn('Status', 'status', 160),
  textColumn('Type', 'type', 160), textColumn('Reason', 'reason', 250), textColumn('Return date', 'return_date', 180),
];
const campaignColumns = [
  textColumn('Campaign', 'name', 250), textColumn('ID', 'campaign_id', 170),
  { title: 'Status', dataIndex: 'status', width: 120, render: (value) => value ? <Tag color={value === 'Live' ? 'green' : 'default'}>{value}</Tag> : 'Unavailable' },
  textColumn('Type', 'kind', 90), textColumn('Report period', 'range_label', 180),
  numericColumn('Spend', 'spend', money), numericColumn('Views', 'views'), numericColumn('Clicks', 'clicks'), numericColumn('Units', 'units'),
  numericColumn('Revenue', 'revenue', money), numericColumn('ROI', 'roi'), numericColumn('Ads CTR', 'ctr_pct', percent), numericColumn('Ads CVR', 'cvr_pct', percent),
];
const dropColumns = [textColumn('SKU', 'sku', 190), textColumn('Product', 'name', 300), numericColumn('Impressions lost', 'impressions_drop'), numericColumn('Units lost', 'units_lost')];

export default function FlipkartSellerHub() {
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
      const response = await api.get('/marketflow/flipkart/seller-mirror', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(response.data);
        setError(null);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.response?.status === 403
        ? 'This Seller Hub view requires an administrator account. Sign in as an admin to view the connected seller data.'
        : err.response?.data?.message || 'The latest Flipkart capture could not be loaded. Please try again.');
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
  const read = (area, key) => metrics[area]?.[key]?.value;
  const syncError = data?.status?.sellerhub_error;
  const hasCapture = Boolean(data?.lastScrapedAt);
  const tiles = [
    { label: 'Units today', value: read('home', 'units_today'), note: 'Seller Hub home', area: 'home', key: 'units_today' },
    { label: 'Sales today', value: read('home', 'sales_today'), note: 'Seller Hub home · INR', area: 'home', key: 'sales_today', render: money },
    { label: 'Impressions · 30 days', value: read('traffic', 'impressions_30d'), note: 'Traffic Report · selected 30-day range', area: 'traffic', key: 'impressions_30d' },
    { label: 'Traffic conversion', value: read('traffic', 'conversion_30d_pct'), note: 'Platform-reported · 30-day range', area: 'traffic', key: 'conversion_30d_pct', render: percent },
  ];
  const coverage = data?.coverage || {};
  const tabItems = data ? [
    { key: 'overview', label: 'Overview', children: <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>{tiles.map((tile) => <Col xs={24} sm={12} xl={6} key={tile.label}>
        <Card size="small" style={{ height: '100%', borderTop: '3px solid #669c2c' }}>
          <Statistic title={tile.label} value={tile.value ?? 'Unavailable'} formatter={() => (tile.render || valueText)(tile.value)} valueStyle={{ fontSize: tile.value == null ? 19 : 29, fontWeight: 650 }} />
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>{tile.note}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dateText(metrics[tile.area]?.[tile.key]?.capturedAt)}</Text>
        </Card>
      </Col>)}</Row>
      <MetricSection title="Daily performance" area={metrics.home} />
      <MetricSection title="Traffic & conversion" area={metrics.traffic} description="Traffic conversion is the rate reported by Flipkart. Organic CTR is not available in the current capture. Ad CTR and CVR are shown separately under Ads." />
      <MetricSection title="Business health" area={metrics.business_health} />
      <CapturedTable title="Products losing impressions" rows={data.trafficDrops} columns={dropColumns} coverage={coverage.trafficDrops} searchFields={['sku', 'name']} rowKey={(row, index) => `${row.sku}-${index}`} />
    </> },
    { key: 'listings', label: 'Listings', children: <>
      <MetricSection title="Listing status" area={metrics.listing_states} />
      <CapturedTable title="Captured active listings" rows={data.listings} columns={listingColumns} coverage={coverage.listings} searchFields={['sku', 'title', 'category']} rowKey={(row, index) => `${row.sku}-${index}`} description="Product rows captured from the active listings page. Blocked and inactive listing counts are shown above; their product rows are not included in this table." />
      <MetricSection title="Inventory" area={metrics.inventory} />
    </> },
    { key: 'orders', label: 'Orders', children: <>
      <MetricSection title="Order summary" area={metrics.orders} />
      <CapturedTable title="Captured order history" rows={data.fullOrders} columns={historyColumns} coverage={coverage.fullOrders} searchFields={['order_id', 'shipment_id', 'order_item_id', 'sku', 'title', 'status']} rowKey={(row, index) => `${row.shipment_id || row.order_item_id || row.order_id}-${index}`} description="Read-only records from the captured Seller Hub order views. Coverage and report period below describe which records were captured; this table does not imply a complete order archive." />
      <CapturedTable title="To Accept · packing queue" rows={data.pendingOrders} columns={orderColumns} coverage={coverage.pendingOrders} searchFields={['sku', 'fsn', 'title']} rowKey={(row, index) => `${row.sku}-${index}`} description="Current packing queue grouped by SKU, not full order history. Group order counts may repeat across the SKUs in a combo order; do not sum this column." />
    </> },
    { key: 'returns', label: 'Returns', children: <>
      <MetricSection title="Returns summary" area={metrics.returns} />
      <CapturedTable title="Captured return details" rows={data.returnDetails} columns={returnColumns} coverage={coverage.returnDetails} searchFields={['return_id', 'order_id', 'sku', 'title', 'status', 'reason']} rowKey={(row, index) => `${row.return_id || row.order_id}-${index}`} description="Read-only return records from Seller Hub. Check the capture coverage for the selected status and report period." />
    </> },
    { key: 'ads', label: 'Ads', children: <>
      <Alert type="info" showIcon message="Ads metrics are separate from organic traffic" description="CTR and CVR below are attributed to advertising and use the report period shown in Seller Hub." style={{ marginBottom: 20 }} />
      <MetricSection title="Advertising performance" area={metrics.ads} />
      <CapturedTable title="Ad campaigns" rows={data.campaigns} columns={campaignColumns} coverage={coverage.campaigns} searchFields={['name', 'campaign_id', 'status']} rowKey={(row, index) => `${row.campaign_id}-${index}`} />
    </> },
    { key: 'keywords', label: 'Keywords', children: <Card>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><Title level={5}>Keyword data is not available yet</Title><Paragraph type="secondary" style={{ maxWidth: 560, margin: '0 auto' }}>The connected Seller Hub capture does not include search terms or keyword-level impressions, clicks and conversions. Campaign totals are available under Ads. Public keyword rank tracking is a separate data source.</Paragraph></>} />
    </Card> },
    { key: 'payments', label: 'Payments', children: <>
      <MetricSection title="Payments" area={metrics.payments} description="Amounts and estimates from the captured Seller Hub payments summary. Amounts are in INR." />
    </> },
  ] : [];

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <Space size={8} style={{ marginBottom: 8 }}><ShopOutlined style={{ color: '#669c2c' }} /><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>MARKETPLACE / FLIPKART</Text></Space>
          <Title level={3} style={{ margin: '0 0 6px' }}>Flipkart Seller Hub</Title>
          <Text type="secondary">Your seller data, brought into Backero.</Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>Refresh saved data</Button>
      </div>

      {error && <Alert type="error" showIcon message="Unable to load Flipkart data" description={error} action={<Button size="small" onClick={fetchData}>Retry</Button>} style={{ marginBottom: 20 }} />}
      {loading && !data && <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>}
      {data && <>
        <Card size="small" style={{ marginBottom: 20, background: '#f5f7ef' }}>
          <Space wrap size={[16, 8]}>
            <Tag color={data.mode === 'live' ? 'green' : 'orange'}>{data.mode === 'live' ? 'Seller Hub capture' : `${data.mode || 'Unknown'} data source`}</Tag>
            <Text style={{ fontSize: 12 }}><strong>Last seller read:</strong> {dateText(data.lastScrapedAt)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>Website sync: {dateText(data.syncedAt)}</Text>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: 12, margin: '8px 0 0' }}>This page checks saved data every minute. Refresh reloads the latest saved capture; it does not start a new seller scrape. Each section shows its own capture time.</Paragraph>
        </Card>
        {syncError && <Alert type="warning" showIcon message={syncError.kind === 'session' ? 'Seller login needs attention' : 'Some seller data could not be refreshed'} description={`${syncError.error || 'Check the Seller Hub connection.'}${syncError.at ? ` Reported ${dateText(syncError.at)}.` : ''} Previously captured data may still be shown below.`} style={{ marginBottom: 20 }} />}
        {!hasCapture && <Alert type="info" showIcon message="Waiting for the first Seller Hub capture" description="No capture time is available yet. Missing values are shown as unavailable rather than zero." style={{ marginBottom: 20 }} />}
        <Tabs items={tabItems} destroyOnHidden={false} />
        {data.limitations?.length > 0 && <Card size="small" style={{ marginTop: 24 }}>
          <Text strong>Capture coverage</Text>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#57534e', fontSize: 12, lineHeight: 1.9 }}>{data.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </Card>}
      </>}
      {!loading && !data && !error && <Empty description="No Flipkart capture is available." />}
    </main>
  );
}
