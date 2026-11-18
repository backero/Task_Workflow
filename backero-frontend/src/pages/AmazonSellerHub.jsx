import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Row, Skeleton, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ApiOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
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
  return <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space direction="vertical"><Title level={4} style={{ margin: 0 }}>Connect Amazon Seller Central</Title><Paragraph type="secondary" style={{ maxWidth: 560, margin: 0 }}>Amazon data is connected through the official Selling Partner API (SP-API), not by sharing a Seller Central password. An administrator must complete the one-time Amazon app authorization on the collector computer.</Paragraph></Space>}>
    <Alert type="info" showIcon style={{ textAlign: 'left', maxWidth: 680, margin: '16px auto 0' }} message="What is needed" description="Seller Central SP-API application credentials, an authorized seller account, and the required Orders role. After that, Backero will publish only captured seller data to this organization." />
  </Empty></Card>;
}

export default function AmazonSellerHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionRequired, setConnectionRequired] = useState(false);
  const [error, setError] = useState(null);
  const request = useRef(null);
  const load = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setLoading(true);
    try { const response = await api.get('/marketflow/amazon/seller-mirror', { signal: controller.signal }); if (!controller.signal.aborted) { setData(response.data); setConnectionRequired(false); setError(null); } }
    catch (err) { if (!controller.signal.aborted) { setConnectionRequired(err.response?.data?.connectionRequired || err.response?.status === 404); setError(err.response?.status === 403 ? 'This Amazon view requires an administrator account.' : err.response?.status === 404 ? null : err.response?.data?.message || 'The Amazon seller capture could not be loaded. Please try again.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => { clearInterval(timer); request.current?.abort(); }; }, [load]);
  const orders = data?.orders || []; const listings = data?.listings || [];
  const items = data ? [
    { key: 'overview', label: 'Overview', children: <><Alert type="info" showIcon style={{ marginBottom: 20 }} message="Official Amazon SP-API data" description="Backero stores a read-only seller capture. Refresh reloads saved data; it never changes Seller Central." /><MetricSection heading="Order summary" metrics={data.metrics?.orders} /></> },
    { key: 'orders', label: 'Orders', children: <CapturedTable heading="Recent orders" rows={orders} columns={orderColumns} coverage={data.coverage?.orders} searchFields={['order_id', 'status', 'fulfillment_channel']} /> },
    { key: 'listings', label: 'Listings & inventory', children: <CapturedTable heading="Listings" rows={listings} columns={listingColumns} coverage={data.coverage?.listings} searchFields={['sku', 'title', 'asin']} /> },
  ] : [];
  return <main style={{ maxWidth: 1600, margin: '0 auto', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}><div><Space size={8} style={{ marginBottom: 8 }}><ApiOutlined style={{ color: '#ff9900' }} /><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>MARKETPLACE / AMAZON</Text></Space><Title level={3} style={{ margin: '0 0 6px' }}>Amazon Seller Central</Title><Text type="secondary">Your Amazon seller data, brought into Backero through SP-API.</Text></div><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh saved data</Button></div>
    {error && <Alert type="error" showIcon message="Unable to load Amazon data" description={error} action={<Button size="small" onClick={load}>Retry</Button>} style={{ marginBottom: 20 }} />}
    {loading && !data && !connectionRequired && <Card><Skeleton active paragraph={{ rows: 7 }} /></Card>}
    {connectionRequired && !loading && <ConnectionCard />}
    {data && <><Card size="small" style={{ marginBottom: 20, background: '#fff8e8' }}><Space wrap size={[16, 8]}><Tag color="gold">Amazon SP-API</Tag><Text style={{ fontSize: 12 }}><strong>Last API read:</strong> {dateText(data.lastScrapedAt)}</Text><Text type="secondary" style={{ fontSize: 12 }}>Website sync: {dateText(data.syncedAt)}</Text></Space></Card>{data.status?.state && data.status.state !== 'ok' && <Alert type="warning" showIcon message="Amazon connection needs attention" description={data.status.detail || 'Check the local SP-API collector configuration.'} style={{ marginBottom: 20 }} />}<Tabs items={items} />{data.limitations?.length > 0 && <Card size="small" style={{ marginTop: 24 }}><Text strong>Capture coverage</Text><ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, lineHeight: 1.9 }}>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></Card>}</>}
  </main>;
}
