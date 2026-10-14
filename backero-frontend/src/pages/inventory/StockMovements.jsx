import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { format } from 'date-fns';
import { Card, Empty, Select, Spin, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const TYPE_COLOR = { IN: 'green', OUT: 'red', ADJUSTMENT: 'blue', SALE: 'purple', PRODUCTION_USE: 'orange', PRODUCTION_OUTPUT: 'green', QUALITY_TEST: 'default' };

export default function StockMovements() {
  const [type, setType] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', type],
    queryFn: () => api.get('/inventory/movements', { params: { limit: 50, type: type || undefined } }).then((r) => r.data),
  });

  const movements = data?.data || [];

  const columns = [
    {
      title: 'Product', key: 'product',
      render: (_, m) => (
        <div>
          <Text strong>{m.product?.name}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{m.product?.sku}</Text></div>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', key: 'type', align: 'center', render: (v) => <Tag color={TYPE_COLOR[v] || 'default'}>{v}</Tag> },
    {
      title: 'Quantity', key: 'quantity', align: 'center',
      render: (_, m) => <Text strong style={{ color: m.quantity > 0 ? '#16a34a' : '#dc2626' }}>{m.quantity > 0 ? '+' : ''}{m.quantity} {m.product?.unit}</Text>,
    },
    { title: 'Before → After', key: 'stockChange', align: 'center', render: (_, m) => <Text type="secondary" style={{ fontSize: 12 }}>{m.previousStock} → {m.newStock}</Text> },
    { title: 'By', key: 'by', render: (_, m) => `${m.createdBy?.firstName || ''} ${m.createdBy?.lastName || ''}` },
    { title: 'Date', key: 'date', align: 'right', render: (_, m) => <Text type="secondary" style={{ fontSize: 12 }}>{format(new Date(m.createdAt), 'dd MMM yy, HH:mm')}</Text> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Stock Movements</Title>
      <Select
        value={type} onChange={setType} style={{ width: 200, marginBottom: 16 }}
        options={['', 'IN', 'OUT', 'ADJUSTMENT', 'SALE', 'PRODUCTION_USE', 'PRODUCTION_OUTPUT'].map((t) => ({ label: t || 'All Types', value: t }))}
      />
      <Card styles={{ body: { padding: 0 } }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : (
          <Table
            rowKey="_id" columns={columns} dataSource={movements} pagination={false}
            locale={{ emptyText: <Empty description="No movements found" /> }}
          />
        )}
      </Card>
    </div>
  );
}
