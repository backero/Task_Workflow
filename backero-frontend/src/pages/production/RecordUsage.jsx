import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  FlaskConical, Upload, Download, Search, Clock, User, Box, Loader2,
} from 'lucide-react';
import { Button, Card, Drawer, Empty, Input, Radio, Space, Spin, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const totalStock = (m) => Number(m.currentStock) || (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);

export default function RecordUsage() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState('all');

  const [returnModal, setReturnModal] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [matRes, recRes] = await Promise.all([
        api.get('/inventory/raw-materials'),
        api.get('/production-usage'),
      ]);
      setMaterials(matRes.data.materials || []);
      setRecords(recRes.data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openReturn = (record) => {
    const alreadyReturned = records
      .filter(r => r.type === 'return' && (r.returnOf?._id === record._id || r.returnOf === record._id))
      .reduce((s, r) => s + r.quantity, 0);
    setReturnModal({ ...record, maxReturnable: record.quantity - alreadyReturned });
    setReturnQty(''); setReturnNotes(''); setReturnError('');
  };

  const submitReturn = async () => {
    if (!returnQty || Number(returnQty) <= 0) { setReturnError('Enter a valid quantity'); return; }
    if (Number(returnQty) > returnModal.maxReturnable) { setReturnError(`Max returnable: ${returnModal.maxReturnable} ${returnModal.unit}`); return; }
    setReturnLoading(true); setReturnError('');
    try {
      const res = await api.post(`/production-usage/${returnModal._id}/return`, { quantity: Number(returnQty), notes: returnNotes.trim() });
      if (res.data.material) setMaterials(prev => prev.map(m => m._id === res.data.material._id ? { ...m, ...res.data.material } : m));
      setRecords(prev => [res.data.record, ...prev]);
      setReturnModal(null);
    } catch (e) {
      setReturnError(e.response?.data?.message || 'Failed to record return');
    } finally {
      setReturnLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) || m.code?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredRecords = logFilter === 'all' ? records : records.filter(r => r.type === logFilter);
  const returnedQtyFor = (id) =>
    records.filter(r => r.type === 'return' && (r.returnOf?._id === id || r.returnOf === id)).reduce((s, r) => s + r.quantity, 0);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const materialColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }} type="secondary">{v}</Text> },
    {
      title: 'Material', key: 'material',
      render: (_, m) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
          {m.supplier && <div><Text type="secondary" style={{ fontSize: 11 }}>{m.supplier}</Text></div>}
        </div>
      ),
    },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: 'Available Stock', key: 'stock',
      render: (_, m) => {
        const stock = totalStock(m);
        const isLow = m.enableMinStock && stock > 0 && stock <= (m.minStockLevel || 0);
        return (
          <Space size={6}>
            <Text strong style={{ color: stock <= 0 ? '#ef4444' : isLow ? '#eab308' : '#059669' }}>{stock} {m.unit}</Text>
            {stock <= 0 && <Tag color="red">Out</Tag>}
            {isLow && <Tag color="gold">Low</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Net Used', key: 'netUsed',
      render: (_, m) => {
        const netUsed = records.filter(r => String(r.materialId?._id || r.materialId) === String(m._id)).reduce((s, r) => r.type === 'issue' ? s + r.quantity : s - r.quantity, 0);
        return <Text style={{ color: '#f97316', fontWeight: 600 }}>{Math.max(0, netUsed)} {m.unit}</Text>;
      },
    },
    {
      title: '', key: 'actions',
      render: (_, m) => {
        const stock = totalStock(m);
        return (
          <Button size="small" icon={<Upload size={12} />} disabled={stock <= 0} onClick={() => navigate(`/production/usage/${m._id}`)}>Record Usage</Button>
        );
      },
    },
  ];

  const logColumns = [
    { title: '#', dataIndex: 'issueNumber', key: 'issueNumber', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }} type="secondary">{v}</Text> },
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: (v) => v === 'issue' ? <Tag color="orange" icon={<Upload size={10} style={{ marginRight: 2 }} />}>Used</Tag> : <Tag color="green" icon={<Download size={10} style={{ marginRight: 2 }} />}>Returned</Tag>,
    },
    {
      title: 'Material', key: 'materialName',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.materialName}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.materialCode}</Text></div>
        </div>
      ),
    },
    {
      title: 'Qty', key: 'qty',
      render: (_, r) => {
        const returned = r.type === 'issue' ? returnedQtyFor(r._id) : 0;
        return (
          <div>
            <Text strong style={{ color: r.type === 'issue' ? '#f97316' : '#059669' }}>{r.type === 'issue' ? '-' : '+'}{r.quantity} {r.unit}</Text>
            {r.type === 'issue' && returned > 0 && <div><Text type="secondary" style={{ fontSize: 10, color: '#059669' }}>{returned} returned</Text></div>}
            {r.type === 'return' && r.returnOf && <div><Text type="secondary" style={{ fontSize: 10 }}>← {r.returnOf.issueNumber || 'issue'}</Text></div>}
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
      <Title level={4} style={{ marginBottom: 0 }}><FlaskConical size={18} color="#f97316" style={{ marginRight: 8, verticalAlign: -2 }} />Production Usage</Title>
      <Text type="secondary">Record raw material usage and returns for production</Text>

      <Card
        style={{ marginTop: 16, marginBottom: 16 }} styles={{ body: { padding: 0 } }}
        title={<Space size={8}><Box size={14} />Raw Materials</Space>}
        extra={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." prefix={<Search size={13} color="#9ca3af" />} style={{ width: 200 }} />}
      >
        <Table rowKey="_id" columns={materialColumns} dataSource={filteredMaterials} pagination={false} locale={{ emptyText: <Empty description="No materials found" /> }} />
      </Card>

      <Card
        styles={{ body: { padding: 0 } }}
        title={<Space size={8}><Clock size={14} />Usage Log <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>({records.length} entries)</Text></Space>}
        extra={<Radio.Group value={logFilter} onChange={(e) => setLogFilter(e.target.value)} size="small">
          <Radio.Button value="all">All</Radio.Button>
          <Radio.Button value="issue">Issue</Radio.Button>
          <Radio.Button value="return">Return</Radio.Button>
        </Radio.Group>}
      >
        <Table rowKey="_id" columns={logColumns} dataSource={filteredRecords} pagination={false} locale={{ emptyText: <Empty description="No records yet" /> }} />
      </Card>

      <Drawer
        open={!!returnModal} onClose={() => setReturnModal(null)} width={420}
        title={<Space size={8}><Download size={16} color="#10b981" />Return to Stock</Space>}
        footer={
          returnModal && (
            <Space style={{ width: '100%' }}>
              <Button style={{ flex: 1 }} onClick={() => setReturnModal(null)}>Cancel</Button>
              <Button type="primary" style={{ flex: 1 }} loading={returnLoading} icon={<Download size={14} />} onClick={submitReturn}>Confirm Return</Button>
            </Space>
          )
        }
      >
        {returnModal && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" style={{ background: '#fafafa' }}>
              <Text strong style={{ fontSize: 13 }}>{returnModal.materialName}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{returnModal.issueNumber} · {returnModal.purpose}</Text></div>
              <Text strong style={{ fontSize: 13, color: '#059669' }}>Max returnable: {returnModal.maxReturnable} {returnModal.unit}</Text>
            </Card>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Return Quantity ({returnModal.unit}) *</Text>
              <Input type="number" min="0.01" step="0.01" max={returnModal.maxReturnable} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} placeholder={`Max: ${returnModal.maxReturnable}`} autoFocus />
            </div>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Notes (optional)</Text>
              <Input.TextArea rows={2} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Reason for return..." />
            </div>
            {returnError && <Text type="danger" style={{ fontSize: 12 }}>{returnError}</Text>}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
