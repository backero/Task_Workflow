import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import { MapPin, X } from 'lucide-react';
import api from '../../api/axios';
import { Button, Card, Drawer, Empty, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import 'leaflet/dist/leaflet.css';

const { Title, Text } = Typography;

const DEFAULT_CENTER = [20.5937, 78.9629]; // India, used only when there are no live points yet
const DEFAULT_ZOOM = 5;

function fmtAgo(v) {
  if (!v) return '—';
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function Location() {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['locations-live'],
    queryFn: () => api.get('/locations/live').then((r) => r.data),
    refetchInterval: 30_000,
  });
  const points = data?.locations || [];

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['location-history', selectedSessionId],
    queryFn: () => api.get(`/locations/sessions/${selectedSessionId}/history`).then((r) => r.data),
    enabled: !!selectedSessionId,
  });
  const historyPoints = historyData?.history || [];
  const polyline = historyPoints.map((p) => [p.latitude, p.longitude]);

  const center = points.length ? [points[0].latitude, points[0].longitude] : DEFAULT_CENTER;
  const zoom = points.length ? 12 : DEFAULT_ZOOM;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Live Location</Title>
          <Text type="secondary">Field employees currently on an active tracking session</Text>
        </div>
        <Tag color={isFetching ? 'processing' : 'default'}>{points.length} tracking now</Tag>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Card styles={{ body: { padding: 0 } }} style={{ flex: 1, overflow: 'hidden' }}>
          <MapContainer center={center} zoom={zoom} style={{ height: 'calc(100vh - 240px)', width: '100%' }} key={points.length ? 'has-points' : 'empty'}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {points.map((p) => (
              <CircleMarker
                key={p.trackingSessionId}
                center={[p.latitude, p.longitude]}
                radius={9}
                pathOptions={{ color: p.isLowAccuracy ? '#f59e0b' : '#2563eb', fillColor: p.isLowAccuracy ? '#f59e0b' : '#2563eb', fillOpacity: 0.7 }}
                eventHandlers={{ click: () => { setSelectedSessionId(p.trackingSessionId); setSelectedLabel(p.employeeFullName); } }}
              >
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <strong>{p.employeeFullName}</strong><br />
                    Last seen: {fmtAgo(p.recordedAt)}<br />
                    Accuracy: {p.accuracyMeters != null ? `${Math.round(p.accuracyMeters)}m` : '—'}{p.isLowAccuracy ? ' (low)' : ''}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            {selectedSessionId && polyline.length > 1 && (
              <Polyline positions={polyline} pathOptions={{ color: '#2563eb', weight: 3 }} />
            )}
          </MapContainer>
        </Card>

        <Card size="small" style={{ width: 280, flexShrink: 0 }} title="Active Sessions">
          {!points.length ? (
            <Empty description="No one is tracking right now" image={<MapPin size={32} color="#d1d5db" style={{ margin: '0 auto' }} />} />
          ) : (
            points.map((p) => (
              <div
                key={p.trackingSessionId}
                onClick={() => { setSelectedSessionId(p.trackingSessionId); setSelectedLabel(p.employeeFullName); }}
                style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: selectedSessionId === p.trackingSessionId ? '#eff6ff' : 'transparent', borderRadius: 6 }}
              >
                <Text strong style={{ fontSize: 13 }}>{p.employeeFullName}</Text>
                <div><Text type="secondary" style={{ fontSize: 11 }}>{fmtAgo(p.recordedAt)}{p.isLowAccuracy && <Tag color="gold" style={{ marginLeft: 6, fontSize: 10 }}>Low accuracy</Tag>}</Text></div>
              </div>
            ))
          )}
        </Card>
      </div>

      <Drawer
        open={!!selectedSessionId} onClose={() => setSelectedSessionId(null)} width={420} closeIcon={<X size={18} />}
        title={selectedLabel ? `Session History — ${selectedLabel}` : 'Session History'}
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Text type="secondary">Loading…</Text></div>
        ) : (
          <Table
            rowKey="_id" size="small" pagination={false}
            dataSource={historyPoints.slice().reverse()}
            locale={{ emptyText: <Empty description="No points recorded yet" /> }}
            columns={[
              { title: 'Time', dataIndex: 'recordedAt', key: 'recordedAt', render: (v) => dayjs(v).format('HH:mm:ss') },
              { title: 'Lat', dataIndex: 'latitude', key: 'latitude', render: (v) => v.toFixed(5) },
              { title: 'Lng', dataIndex: 'longitude', key: 'longitude', render: (v) => v.toFixed(5) },
              { title: 'Acc.', dataIndex: 'accuracyMeters', key: 'accuracyMeters', render: (v) => v != null ? `${Math.round(v)}m` : '—' },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
}
