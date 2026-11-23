import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Row, Segmented, Select, Skeleton, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ApiOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../api/axios';

const { Title, Text, Paragraph } = Typography;
const numbers = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const value = (item) => item == null ? 'Unavailable' : typeof item === 'number' ? numbers.format(item) : String(item);
const money = (item) => item == null ? 'Unavailable' : rupees.format(item);
const dateText = (item) => {
  if (!item) return 'Not captured';
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(item) ? item : `${item}+05:30`);
  return Number.isNaN(date.getTime()) ? 'Capture time unavailable' : `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;
};
const title = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function MetricSection({ heading, metrics }) {
  const entries = Object.entries(metrics || {});
  return <Card title={heading} style={{ marginBottom: 20 }}>
    {entries.length ? <Row gutter={[20, 20]}>{entries.map(([key, metric]) => <Col xs={24} sm={12} lg={8} key={key}>
      <Text type="secondary">{title(key)}</Text>
      <div style={{ fontSize: 21, fontWeight: 650 }}>{/sales|amount|revenue/.test(key) ? money(metric?.value) : value(metric?.value)}</div>
      <Text type="secondary" style={{ fontSize: 11 }}>Captured {dateText(metric?.capturedAt)}</Text>
    </Col>)}</Row> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This Amazon report has not been enabled yet." />}
  </Card>;
}

function InventorySummary({ summary }) {
  const items = [
    ['Visible listings', summary?.visible_listings], ['Stock units', summary?.stock_units],
    ['FBA listings', summary?.fba_listings], ['FBM listings', summary?.fbm_listings],
    ['Average price', summary?.average_price, true],
  ];
  return <Card title="Visible inventory summary" style={{ marginBottom: 20 }}>
    <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>Derived only from the listing rows captured in Seller Central; it is not an Amazon inventory report.</Text>
    <Row gutter={[16, 16]}>{items.map(([label, metric, isMoney]) => <Col xs={12} sm={8} lg={4} key={label}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <div style={{ marginTop: 3, fontSize: 20, fontWeight: 650 }}>{isMoney ? money(metric) : value(metric)}</div>
    </Col>)}</Row>
  </Card>;
}

const TREND_COLORS = ['#ff9900', '#3057d5', '#0f9f79', '#b45309'];
const isMoneyMetric = (key) => /(^|\.)(sales|revenue|amount|price)/i.test(key);
const asDateKey = (date) => date.toISOString().slice(0, 10);
function calendarTrendRows(points, days, metricKeys) {
  const captured = new Map((points || []).map((point) => [point.date, point]));
  const lastDate = points?.length ? new Date(`${points[points.length - 1].date}T12:00:00`) : new Date();
  const startDate = new Date(lastDate); startDate.setDate(startDate.getDate() - days + 1);
  const rows = [];
  for (let cursor = new Date(startDate); cursor <= lastDate; cursor.setDate(cursor.getDate() + 1)) {
    const date = asDateKey(cursor); const source = captured.get(date);
    const row = { date, capturedAt: source?.capturedAt || null, isCaptured: Boolean(source) };
    metricKeys.forEach((key) => { row[key] = source?.metrics?.[key] ?? null; });
    rows.push(row);
  }
  return rows;
}
function HistoricalTrends({ result, loading, error, days, onDaysChange, metricKeys, onMetricKeysChange, onRetry }) {
  const options = result?.availableMetrics || [];
  const series = options.filter((item) => metricKeys.includes(item.key));
  const actualPoints = result?.points || [];
  const points = calendarTrendRows(actualPoints, days, series.map((metric) => metric.key));
  const hasMoney = series.some((metric) => isMoneyMetric(metric.key));
  const hasCount = series.some((metric) => !isMoneyMetric(metric.key));
  const firstReading = actualPoints[0]?.date;
  const lastReading = actualPoints.at(-1)?.date;
  const gaps = Math.max(0, points.length - actualPoints.length);
  return <div>
    <Card style={{ marginBottom: 20, borderTop: '3px solid #ff9900' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 620 }}><Title level={5} style={{ margin: '0 0 5px' }}>Historical evidence</Title><Text type="secondary" style={{ fontSize: 12 }}>A point exists only when the signed-in collector publishes a real Amazon reading. Blank days are never filled with estimates.</Text></div>
        <Segmented value={days} onChange={onDaysChange} options={[30, 90, 180].map((value) => ({ label: `${value} days`, value }))} />
      </div>
      {loading ? <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 24 }} /> : error ? <Alert type="error" showIcon style={{ marginTop: 20 }} message="Historical data could not be loaded" description={error} action={<Button size="small" onClick={onRetry}>Retry</Button>} /> : !options.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="History will appear after the collector publishes its first real reading." style={{ margin: '34px 0 18px' }} /> : <>
        <div style={{ marginTop: 20, maxWidth: 620 }}><Text strong style={{ display: 'block', fontSize: 12, marginBottom: 7 }}>Plot recorded metrics</Text><Select mode="multiple" value={metricKeys} onChange={onMetricKeysChange} options={options.map((item) => ({ value: item.key, label: item.label }))} maxTagCount="responsive" placeholder="Choose up to two metrics" style={{ width: '100%' }} /></div>
        {!actualPoints.length || !series.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={!actualPoints.length ? 'No real readings are in this date range yet.' : 'Choose one or more metrics to plot.'} style={{ margin: '34px 0 12px' }} /> : <>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', borderTop: '1px solid #f0e3cf', borderBottom: '1px solid #f0e3cf', background: '#fffdf9' }}>
            {[['Recorded readings', actualPoints.length], ['First reading', firstReading || '—'], ['Latest reading', lastReading || '—'], ['Capture gaps', gaps ? `${gaps} day${gaps === 1 ? '' : 's'}` : 'None']].map(([label, metric]) => <div key={label} style={{ padding: '11px 13px', borderRight: '1px solid #f0e3cf' }}><Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text><Text strong style={{ fontSize: 13 }}>{metric}</Text></div>)}
          </div>
          <div style={{ width: '100%', height: 320, marginTop: 22 }}><ResponsiveContainer><LineChart data={points} margin={{ top: 5, right: hasMoney && hasCount ? 52 : 22, left: 0, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={8} minTickGap={28} /><YAxis yAxisId="count" hide={!hasCount} tick={{ fontSize: 11 }} width={54} label={hasMoney && hasCount ? { value: 'Count', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6b7280' } } : undefined} /><YAxis yAxisId="money" orientation="right" hide={!hasMoney} tick={{ fontSize: 11 }} width={hasMoney ? 62 : 0} tickFormatter={(item) => `₹${numbers.format(item)}`} label={hasMoney && hasCount ? { value: 'INR', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#6b7280' } } : undefined} /><Tooltip formatter={(item, name) => { const metric = series.find((entry) => entry.label === name); return [metric && isMoneyMetric(metric.key) ? money(item) : typeof item === 'number' ? numbers.format(item) : item, name]; }} labelFormatter={(label, payload) => payload?.[0]?.payload?.isCaptured ? `Captured date: ${label}` : `No reading captured: ${label}`} /><Legend />{series.map((metric, index) => <Line key={metric.key} name={metric.label} type="monotone" dataKey={(row) => row[metric.key]} yAxisId={isMoneyMetric(metric.key) ? 'money' : 'count'} stroke={TREND_COLORS[index % TREND_COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />)}</LineChart></ResponsiveContainer></div>
          {gaps > 0 && <Text type="secondary" style={{ fontSize: 11 }}>Breaks in the line show days where no Amazon reading was captured.</Text>}
        </>}
      </>}
    </Card>
    {result?.note && <Alert type="info" showIcon message={result.note} style={{ marginBottom: 20 }} />}
  </div>;
}

const orderColumns = [
  { title: 'Order ID', dataIndex: 'order_id', width: 220, render: value },
  { title: 'Purchase date', dataIndex: 'purchase_date', width: 190, render: dateText },
  { title: 'Status', dataIndex: 'status', width: 150, render: (item) => item ? <Tag>{item}</Tag> : 'Unavailable' },
  { title: 'Fulfilment', dataIndex: 'fulfillment_channel', width: 150, render: value },
  { title: 'Sales channel', dataIndex: 'sales_channel', width: 190, render: value },
  { title: 'Order total', dataIndex: 'amount', width: 140, align: 'right', render: money },
  { title: 'Currency', dataIndex: 'currency', width: 100, render: value },
];
const listingColumns = [
  { title: 'SKU', dataIndex: 'sku', width: 210, render: value }, { title: 'Product', dataIndex: 'title', width: 320, render: value },
  { title: 'ASIN', dataIndex: 'asin', width: 170, render: value }, { title: 'Status', dataIndex: 'status', width: 130, render: value },
  { title: 'Price', dataIndex: 'price', width: 130, align: 'right', render: money }, { title: 'Stock', dataIndex: 'stock', width: 110, align: 'right', render: value },
];

function CapturedTable({ heading, rows, columns, coverage, searchFields }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter((row) => searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(term))) : rows;
  }, [query, rows, searchFields]);
  return <Card style={{ marginBottom: 20 }}>
    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><Title level={5} style={{ margin: 0 }}>{heading}</Title><Text type="secondary">Captured {dateText(coverage?.capturedAt)} · {numbers.format(rows.length)} rows</Text></div>
        <Input allowClear prefix={<SearchOutlined />} aria-label={`Search ${heading.toLowerCase()}`} placeholder="Search captured rows" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 270, maxWidth: '100%' }} />
      </div>
      {coverage?.period && <Text type="secondary">Coverage: {coverage.period}</Text>}
      {coverage?.status && coverage.status !== 'ok' && <Alert type="info" showIcon message={coverage.status === 'unavailable' ? 'Report not enabled yet' : 'Partial report coverage'} description={coverage.detail} />}
    </Space>
    <Table size="small" dataSource={filtered} columns={columns} rowKey={(row, index) => row.order_id || row.sku || index} scroll={{ x: 1100 }} pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: query ? 'No captured rows match your search.' : 'No rows have been captured. This does not mean there are none in Seller Central.' }} />
  </Card>;
}

function ConnectionCard() {
  return <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space direction="vertical"><Title level={4} style={{ margin: 0 }}>Connect Amazon Seller Central</Title><Paragraph type="secondary" style={{ maxWidth: 560, margin: 0 }}>An administrator can sign in once in the secure local Seller Central collector browser, or connect the official Selling Partner API (SP-API). Backero only publishes the captured seller data for this organization.</Paragraph></Space>}>
    <Alert type="info" showIcon style={{ textAlign: 'left', maxWidth: 680, margin: '16px auto 0' }} message="What is needed" description="Use the existing collector browser for the automatic read-only capture, or configure authorized SP-API credentials for broader report coverage." />
  </Empty></Card>;
}

export default function AmazonSellerHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionRequired, setConnectionRequired] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [trendDays, setTrendDays] = useState(30);
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(null);
  const [trendMetrics, setTrendMetrics] = useState([]);
  const request = useRef(null);
  const load = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setLoading(true);
    try { const response = await api.get('/marketflow/amazon/seller-mirror', { signal: controller.signal }); if (!controller.signal.aborted) { setData(response.data); setConnectionRequired(false); setError(null); } }
    catch (err) { if (!controller.signal.aborted) { setConnectionRequired(err.response?.data?.connectionRequired || err.response?.status === 404); setError(err.response?.status === 403 ? 'This Amazon view requires an administrator account.' : err.response?.status === 404 ? null : err.response?.data?.message || 'The Amazon seller capture could not be loaded. Please try again.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => { clearInterval(timer); request.current?.abort(); }; }, [load]);
  const loadTrends = useCallback(async (days = trendDays) => {
    setTrendLoading(true); setTrendError(null);
    try {
      const response = await api.get('/marketflow/amazon/seller-trends', { params: { days } });
      const next = response.data || {}; setTrendData(next);
      setTrendMetrics((current) => {
        const valid = current.filter((key) => (next.availableMetrics || []).some((metric) => metric.key === key));
        return valid.length ? valid.slice(0, 2) : (next.availableMetrics || []).slice(0, 2).map((metric) => metric.key);
      });
    } catch (err) { setTrendError(err.response?.data?.message || 'Please try again in a moment.'); }
    finally { setTrendLoading(false); }
  }, [trendDays]);
  useEffect(() => { if (activeTab === 'trends') loadTrends(trendDays); }, [activeTab, trendDays, loadTrends]);
  const orders = data?.orders || []; const listings = data?.listings || [];
  const browserCapture = data?.source === 'seller_central_browser';
  const captureLabel = browserCapture ? 'Seller Central browser capture' : 'Amazon SP-API';
  const captureDescription = browserCapture ? 'Backero stores a read-only capture from the authenticated local Seller Central browser. Refresh reloads saved data; it never changes Seller Central.' : 'Backero stores a read-only Amazon SP-API capture. Refresh reloads saved data; it never changes Seller Central.';
  const setSelectedTrendMetrics = (keys) => setTrendMetrics(keys.slice(-2));
  const items = data ? [
    { key: 'overview', label: 'Overview', children: <><Alert type="info" showIcon style={{ marginBottom: 20 }} message={captureLabel} description={captureDescription} /><InventorySummary summary={data.inventorySummary} /><MetricSection heading="Listing status" metrics={data.metrics?.listing_status} /><MetricSection heading="Order summary" metrics={data.metrics?.orders} /></> },
    { key: 'orders', label: 'Orders', children: <CapturedTable heading="Recent orders" rows={orders} columns={orderColumns} coverage={data.coverage?.orders} searchFields={['order_id', 'status', 'fulfillment_channel']} /> },
    { key: 'listings', label: 'Listings & inventory', children: <CapturedTable heading="Listings" rows={listings} columns={listingColumns} coverage={data.coverage?.listings} searchFields={['sku', 'title', 'asin']} /> },
    { key: 'trends', label: 'Historical trends', children: <HistoricalTrends result={trendData} loading={trendLoading} error={trendError} days={trendDays} onDaysChange={setTrendDays} metricKeys={trendMetrics} onMetricKeysChange={setSelectedTrendMetrics} onRetry={() => loadTrends(trendDays)} /> },
  ] : [];
  return <main style={{ maxWidth: 1600, margin: '0 auto', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}><div><Space size={8} style={{ marginBottom: 8 }}><ApiOutlined style={{ color: '#ff9900' }} /><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>MARKETPLACE / AMAZON</Text></Space><Title level={3} style={{ margin: '0 0 6px' }}>Amazon Seller Central</Title><Text type="secondary">Your Amazon seller data, brought into Backero through {browserCapture ? 'the authenticated local collector' : 'SP-API'}.</Text></div><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh saved data</Button></div>
    {error && <Alert type="error" showIcon message="Unable to load Amazon data" description={error} action={<Button size="small" onClick={load}>Retry</Button>} style={{ marginBottom: 20 }} />}
    {loading && !data && !connectionRequired && <Card><Skeleton active paragraph={{ rows: 7 }} /></Card>}
    {connectionRequired && !loading && <ConnectionCard />}
    {data && <><Card size="small" style={{ marginBottom: 20, background: '#fff8e8' }}><Space wrap size={[16, 8]}><Tag color="gold">{captureLabel}</Tag><Text style={{ fontSize: 12 }}><strong>Last capture:</strong> {dateText(data.lastScrapedAt)}</Text><Text type="secondary" style={{ fontSize: 12 }}>Website sync: {dateText(data.syncedAt)}</Text></Space></Card>{data.status?.state && data.status.state !== 'ok' && <Alert type="warning" showIcon message="Amazon connection needs attention" description={data.status.detail || 'Check the local Amazon collector configuration.'} style={{ marginBottom: 20 }} />}<Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />{data.limitations?.length > 0 && <Card size="small" style={{ marginTop: 24 }}><Text strong>Capture coverage</Text><ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, lineHeight: 1.9 }}>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></Card>}</>}
  </main>;
}
