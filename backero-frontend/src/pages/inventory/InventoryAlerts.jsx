import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';

const { Title, Text } = Typography;

export default function InventoryAlerts() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'alerts'],
    queryFn: () => api.get('/inventory/alerts').then((r) => r.data),
    refetchInterval: 2 * 60 * 1000,
  });

  const alerts = data?.alerts || [];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>Low Stock Alerts</Title>
      <Text type="secondary">{alerts.length} products below minimum</Text>

      <div style={{ marginTop: 16 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : alerts.length === 0 ? (
          <Card>
            <Empty
              image={<CheckCircle2 size={48} color="#4ade80" style={{ margin: '0 auto' }} />}
              description={<Text strong>All stock levels are healthy!</Text>}
            />
          </Card>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {alerts.map((product) => (
              <Card key={product._id} style={{ borderInlineStart: `4px solid ${product.currentStock === 0 ? '#ef4444' : '#f97316'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text strong>{product.name}</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>SKU: {product.sku} • {product.category}</Text></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: product.currentStock === 0 ? '#dc2626' : '#ea580c' }}>
                      {product.currentStock} {product.unit}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Min: {product.minStockLevel} {product.unit}</Text>
                    {product.currentStock === 0 && <div><Tag color="red" style={{ marginTop: 4 }}>Out of Stock</Tag></div>}
                  </div>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </div>
    </div>
  );
}
