import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';
import { CheckCircle2, Clock, Truck, Box, CircleAlert, Sparkles } from 'lucide-react';
import { Card, Space, Spin, Steps, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STAGES = [
  { key: 'Order Confirmed', label: 'Order Confirmed',   icon: CheckCircle2 },
  { key: 'In Production',   label: 'In Production',     icon: Box },
  { key: 'Ready',           label: 'Ready to Dispatch',  icon: Sparkles },
  { key: 'Delivered',       label: 'Delivered',          icon: Truck },
];

function StageBar({ current }) {
  const idx = STAGES.findIndex((s) => s.key === current);
  const activeIdx = idx === -1 ? 0 : idx;

  return (
    <Steps
      current={activeIdx}
      items={STAGES.map((s) => ({ title: s.label, icon: <s.icon size={16} /> }))}
    />
  );
}

export default function OrderTracking() {
  const { token } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', token],
    queryFn: () => axios.get(`${API_BASE}/public/track/${token}`).then((r) => r.data.data?.order || r.data.order),
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#eff6ff,#e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12 }}><Text type="secondary">Loading your order…</Text></div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Card style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <CircleAlert size={48} color="#f87171" style={{ margin: '0 auto 12px' }} />
          <Title level={4} style={{ marginBottom: 8 }}>Order Not Found</Title>
          <Text type="secondary">This tracking link is invalid or has expired. Please contact us directly.</Text>
        </Card>
      </div>
    );
  }

  const isComplete = data.isCompleted;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#eff6ff 0%,#fff 50%,#eef2ff 100%)' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={8}>
            <div style={{ width: 32, height: 32, background: '#2563eb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text strong style={{ color: '#fff', fontSize: 14 }}>B</Text>
            </div>
            <Text strong>Backero</Text>
          </Space>
          <Tag color={isComplete ? 'green' : 'blue'} icon={isComplete ? <CheckCircle2 size={12} style={{ marginRight: 2 }} /> : <Clock size={12} style={{ marginRight: 2 }} />}>
            {isComplete ? 'Completed' : 'In Progress'}
          </Tag>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size={24}>
          <Card>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Your Order</Text>
            <Title level={4} style={{ margin: '4px 0' }}>{data.orderTitle}</Title>
            <Text type="secondary">{data.clientName}{data.company ? ` · ${data.company}` : ''}</Text>

            <Space size={32} style={{ marginTop: 16 }} wrap>
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Order Date</Text>
                <Text strong style={{ fontSize: 13 }}>{format(new Date(data.createdAt), 'dd MMM yyyy')}</Text>
              </div>
              {data.dueDate && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Estimated Delivery</Text>
                  <Text strong style={{ fontSize: 13, color: '#ea580c' }}>{format(new Date(data.dueDate), 'dd MMM yyyy')}</Text>
                </div>
              )}
              {data.completedAt && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Completed On</Text>
                  <Text strong style={{ fontSize: 13, color: '#16a34a' }}>{format(new Date(data.completedAt), 'dd MMM yyyy')}</Text>
                </div>
              )}
            </Space>
          </Card>

          <Card>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 20 }}>Order Progress</Text>
            <StageBar current={data.stage} />
          </Card>

          <Card>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 16 }}>Updates</Text>
            {data.updates?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Clock size={32} color="#e5e7eb" style={{ marginBottom: 8 }} />
                <div><Text type="secondary" style={{ fontSize: 13 }}>No updates yet — we'll notify you via WhatsApp as work progresses.</Text></div>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {data.updates.map((u, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle2 size={14} color="#3b82f6" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 13 }}>{u.message}</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>{format(new Date(u.date), 'dd MMM yyyy, h:mm a')}</Text></div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          {isComplete && (
            <Card style={{ background: '#f6ffed', borderColor: '#b7eb8f', textAlign: 'center' }}>
              <CheckCircle2 size={36} color="#22c55e" style={{ margin: '0 auto 8px' }} />
              <Title level={5} style={{ color: '#237804', marginBottom: 4 }}>Your order is complete!</Title>
              <Text style={{ color: '#389e0d', fontSize: 13 }}>Thank you for choosing Backero. We hope to serve you again.</Text>
            </Card>
          )}

          <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block', paddingBottom: 16 }}>
            Powered by <Text strong style={{ color: '#2563eb', fontSize: 11 }}>Backero</Text> · For queries, contact us directly
          </Text>
        </Space>
      </div>
    </div>
  );
}
