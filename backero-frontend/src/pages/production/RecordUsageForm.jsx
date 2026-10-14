import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  ArrowLeft, FlaskConical, Upload, Download, Check, Clock, User,
} from 'lucide-react';
import { Button, Card, Col, Empty, Input, Row, Space, Spin, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const totalStock = (m) => Number(m.currentStock) || (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);

export default function RecordUsageForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [material, setMaterial] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [returnTarget, setReturnTarget] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [matRes, recRes] = await Promise.all([
          api.get('/inventory/raw-materials'),
          api.get(`/production-usage?materialId=${id}`),
        ]);
        const mat = (matRes.data.materials || []).find(m => m._id === id);
        setMaterial(mat || null);
        setRecords(recRes.data.records || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) { setError('Enter a valid quantity'); return; }
    if (Number(qty) > totalStock(material)) { setError(`Only ${totalStock(material)} ${material.unit} available`); return; }
    if (!purpose.trim()) { setError('Purpose is required'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/production-usage', { materialId: id, quantity: Number(qty), purpose: purpose.trim(), notes: notes.trim() });
      setMaterial(prev => ({ ...prev, ...res.data.material }));
      setRecords(prev => [res.data.record, ...prev]);
      setQty(''); setPurpose(''); setNotes('');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record usage');
    } finally {
      setSubmitting(false);
    }
  };

  const openReturn = (record) => {
    const alreadyReturned = records
      .filter(r => r.type === 'return' && (r.returnOf?._id === record._id || r.returnOf === record._id))
      .reduce((s, r) => s + r.quantity, 0);
    setReturnTarget({ ...record, maxReturnable: record.quantity - alreadyReturned });
    setReturnQty(''); setReturnNotes(''); setReturnError('');
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    if (!returnQty || Number(returnQty) <= 0) { setReturnError('Enter a valid quantity'); return; }
    if (Number(returnQty) > returnTarget.maxReturnable) { setReturnError(`Max returnable: ${returnTarget.maxReturnable} ${returnTarget.unit}`); return; }
    setReturnSubmitting(true); setReturnError('');
    try {
      const res = await api.post(`/production-usage/${returnTarget._id}/return`, { quantity: Number(returnQty), notes: returnNotes.trim() });
      setMaterial(prev => ({ ...prev, ...res.data.material }));
      setRecords(prev => [res.data.record, ...prev]);
      setReturnTarget(null);
    } catch (e) {
      setReturnError(e.response?.data?.message || 'Failed to record return');
    } finally {
      setReturnSubmitting(false);
    }
  };

  const returnedQtyFor = (recId) =>
    records.filter(r => r.type === 'return' && (r.returnOf?._id === recId || r.returnOf === recId)).reduce((s, r) => s + r.quantity, 0);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!material) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Text type="secondary">Material not found.</Text>
        <div><Button type="link" onClick={() => navigate('/production/usage')}>← Back to list</Button></div>
      </div>
    );
  }

  const stock = totalStock(material);
  const isLow = material.enableMinStock && stock > 0 && stock <= (material.minStockLevel || 0);

  const columns = [
    { title: '#', dataIndex: 'issueNumber', key: 'issueNumber', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }} type="secondary">{v}</Text> },
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: (v) => v === 'issue' ? <Tag color="orange" icon={<Upload size={10} style={{ marginRight: 2 }} />}>Used</Tag> : <Tag color="green" icon={<Download size={10} style={{ marginRight: 2 }} />}>Returned</Tag>,
    },
    {
      title: 'Qty', key: 'qty',
      render: (_, r) => {
        const returned = r.type === 'issue' ? returnedQtyFor(r._id) : 0;
        return (
          <div>
            <Text strong style={{ color: r.type === 'issue' ? '#f97316' : '#059669' }}>{r.type === 'issue' ? '-' : '+'}{r.quantity} {r.unit}</Text>
            {r.type === 'issue' && returned > 0 && <div><Text type="secondary" style={{ fontSize: 10, color: '#059669' }}>{returned} returned</Text></div>}
          </div>
        );
      },
    },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', ellipsis: true, render: (v) => v || '—' },
    {
      title: 'Taken By', key: 'takenBy',
      render: (_, r) => (
        <div>
          <Space size={4}><User size={12} color="#9ca3af" /><Text style={{ fontSize: 13 }}>{r.takenBy ? `${r.takenBy.firstName} ${r.takenBy.lastName}` : '—'}</Text></Space>
          {r.takenBy?.role && <div><Text type="secondary" style={{ fontSize: 10 }}>{r.takenBy.role.replace('_', ' ')}</Text></div>}
        </div>
      ),
    },
    { title: 'Date & Time', key: 'date', render: (_, r) => <Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.createdAt)}</Text> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v) => v || '—' },
    {
      title: '', key: 'actions',
      render: (_, r) => {
        const returned = r.type === 'issue' ? returnedQtyFor(r._id) : 0;
        const maxRet = r.type === 'issue' ? r.quantity - returned : 0;
        if (r.type === 'issue' && maxRet > 0) return <Button size="small" icon={<Download size={12} />} onClick={() => openReturn(r)}>Return</Button>;
        if (r.type === 'issue' && maxRet <= 0 && returned > 0) return <Text type="secondary" style={{ fontSize: 10 }}>Fully returned</Text>;
        return null;
      },
    },
  ];

  return (
    <div>
      <Button type="link" icon={<ArrowLeft size={14} />} onClick={() => navigate('/production/usage')} style={{ paddingLeft: 0, marginBottom: 12 }}>Back to Production Usage</Button>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <Space size={6}>
              <FlaskConical size={14} color="#f97316" />
              <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{material.code}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>· {material.category}</Text>
            </Space>
            <Title level={4} style={{ marginTop: 4, marginBottom: 0 }}>{material.name}</Title>
            {material.supplier && <Text type="secondary">Supplier: {material.supplier}</Text>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block' }}>Available Stock</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: stock <= 0 ? '#ef4444' : isLow ? '#eab308' : '#059669' }}>{stock}</div>
            <Text type="secondary">{material.unit}</Text>
            {stock <= 0 && <div><Tag color="red">Out of Stock</Tag></div>}
            {isLow && <div><Tag color="gold">Low Stock</Tag></div>}
          </div>
        </div>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={<Space size={8}><Upload size={14} color="#f97316" />Record Usage</Space>}>
            <form onSubmit={submit}>
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Quantity ({material.unit}) *</Text>
                  <Input type="number" min="0.01" step="0.01" max={stock} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={`Max: ${stock} ${material.unit}`} disabled={stock <= 0} />
                </div>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Purpose / Product Batch *</Text>
                  <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Shampoo Batch #12, Face Cream B-04" disabled={stock <= 0} />
                </div>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Notes (optional)</Text>
                  <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes about this usage..." disabled={stock <= 0} />
                </div>
                {error && <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>}
                {stock <= 0 ? (
                  <Text type="danger" style={{ textAlign: 'center', display: 'block' }}>This material is out of stock</Text>
                ) : (
                  <Button type="primary" htmlType="submit" block loading={submitting} icon={<Check size={14} />}>Confirm Usage</Button>
                )}
              </Space>
            </form>
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            {returnTarget ? (
              <>
                <Space size={8} style={{ marginBottom: 4 }}><Download size={14} color="#10b981" /><Text strong>Return to Stock</Text></Space>
                <div><Text type="secondary" style={{ fontSize: 12 }}>Ref: {returnTarget.issueNumber} · {returnTarget.purpose}</Text></div>
                <form onSubmit={submitReturn} style={{ marginTop: 16 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Return Quantity ({returnTarget.unit}) *</Text>
                      <Input type="number" min="0.01" step="0.01" max={returnTarget.maxReturnable} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} placeholder={`Max: ${returnTarget.maxReturnable}`} autoFocus />
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Max returnable: <Text strong style={{ color: '#059669', fontSize: 11 }}>{returnTarget.maxReturnable} {returnTarget.unit}</Text></Text>
                    </div>
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Notes (optional)</Text>
                      <Input.TextArea rows={3} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Reason for return..." />
                    </div>
                    {returnError && <Text type="danger" style={{ fontSize: 12 }}>{returnError}</Text>}
                    <Space style={{ width: '100%' }}>
                      <Button style={{ flex: 1 }} onClick={() => setReturnTarget(null)}>Cancel</Button>
                      <Button type="primary" style={{ flex: 1, background: '#059669' }} htmlType="submit" loading={returnSubmitting} icon={<Check size={14} />}>Confirm Return</Button>
                    </Space>
                  </Space>
                </form>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, textAlign: 'center' }}>
                <Download size={28} color="#d1d5db" style={{ marginBottom: 8 }} />
                <Text type="secondary" style={{ fontSize: 13 }}>Click <Text strong style={{ color: '#059669', fontSize: 13 }}>Return</Text> on a usage entry below to return unused material to stock</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        styles={{ body: { padding: 0 } }}
        title={<Space size={8}><Clock size={14} color="#9ca3af" />Usage History <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>({records.length} entries)</Text></Space>}
      >
        <Table rowKey="_id" columns={columns} dataSource={records} pagination={false} locale={{ emptyText: <Empty description="No usage records yet for this material" /> }} />
      </Card>
    </div>
  );
}
