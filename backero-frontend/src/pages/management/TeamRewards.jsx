import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, Gift, Clock, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Card, Col, Drawer, Empty, Input, Radio, Row, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const { Title, Text, Paragraph } = Typography;

const REWARD_TYPES = [
  { value: 'congrats_game', label: 'Congrats note + game outing', icon: Sparkles },
  { value: 'refreshments', label: 'Refreshments', icon: Gift },
  { value: 'early_leave', label: '1 hour paid early leave', icon: Clock },
];

const STATUS_TABS = [
  { value: 'pending', label: 'Pending Review' },
  { value: 'granted', label: 'Granted' },
  { value: 'skipped', label: 'Skipped' },
];

const STATUS_COLOR = { pending: 'orange', granted: 'green', skipped: 'default' };

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rewardLabel(type) {
  return REWARD_TYPES.find((r) => r.value === type)?.label || type;
}

function GrantDrawer({ open, reward, onClose }) {
  const qc = useQueryClient();
  const [rewardType, setRewardType] = useState('congrats_game');
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (open) { setRewardType('congrats_game'); setNote(''); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/team-rewards/${reward._id}/grant`, { rewardType, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-rewards'] });
      toast.success(`Reward granted to ${reward.department}!`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to grant reward'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={420}
      title={`Grant Reward — ${reward.department || ''}`}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={() => mutation.mutate()}>Grant Reward</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={20}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>Reward Type *</Text>
          <Radio.Group value={rewardType} onChange={(e) => setRewardType(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {REWARD_TYPES.map((r) => (
                <Radio key={r.value} value={r.value} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${rewardType === r.value ? '#a8781f' : '#f0f0f0'}`, borderRadius: 8, background: rewardType === r.value ? '#fffbe6' : undefined }}>
                  <Space size={8}><r.icon size={14} color="#a8781f" />{r.label}</Space>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Note to the team <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text></Text>
          <Input.TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Great work this week, team!" />
        </div>
      </Space>
    </Drawer>
  );
}

export default function TeamRewards() {
  const [statusTab, setStatusTab] = useState('pending');
  const [grantTarget, setGrantTarget] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['team-rewards', statusTab],
    queryFn: () => api.get(`/team-rewards?status=${statusTab}&limit=50`).then((r) => r.data),
  });

  const rewards = data?.data || [];

  const skipMutation = useMutation({
    mutationFn: (id) => api.post(`/team-rewards/${id}/skip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-rewards'] });
      toast.success('Reward dismissed');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to dismiss'),
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}><Trophy size={20} color="#f59e0b" style={{ marginRight: 8, verticalAlign: -3 }} />Team Rewards</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>Teams that hit every task and daily update on time, every day for 2 straight weeks — one missed update or late task cancels it for everyone. Runs twice a month.</Text>

      <Radio.Group value={statusTab} onChange={(e) => setStatusTab(e.target.value)} style={{ display: 'block', margin: '16px 0' }}>
        {STATUS_TABS.map((tab) => <Radio.Button key={tab.value} value={tab.value}>{tab.label}</Radio.Button>)}
      </Radio.Group>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : rewards.length === 0 ? (
        <Card>
          <Empty
            image={<Trophy size={40} color="#d1d5db" style={{ margin: '0 auto' }} />}
            description={statusTab === 'pending' ? 'No teams are awaiting review right now.' : `No ${statusTab} rewards yet.`}
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {rewards.map((r) => (
            <Col xs={24} sm={12} key={r._id}>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <Text strong>{r.department}</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{fmtDate(r.weekStart)} – {fmtDate(r.weekEnd)}</Text></div>
                  </div>
                  <Tag color={STATUS_COLOR[r.status]}>{r.status === 'pending' ? 'Pending' : r.status === 'granted' ? 'Granted' : 'Skipped'}</Tag>
                </div>

                <Space size={4} wrap style={{ marginBottom: 12 }}>
                  {(r.memberIds || []).map((m) => <Tag color="blue" key={m._id}>{m.firstName} {m.lastName}</Tag>)}
                </Space>

                {r.status === 'granted' && (
                  <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Text strong style={{ color: '#389e0d', fontSize: 13 }}>{rewardLabel(r.rewardType)}</Text>
                    {r.note && <Paragraph italic style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>"{r.note}"</Paragraph>}
                    {r.grantedBy && <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>Granted by {r.grantedBy.firstName} {r.grantedBy.lastName} on {fmtDate(r.grantedAt)}</Text>}
                  </Card>
                )}

                {r.status === 'pending' && (
                  <Space style={{ width: '100%' }}>
                    <Button type="primary" icon={<CheckCircle2 size={14} />} style={{ flex: 1 }} onClick={() => setGrantTarget(r)}>Grant Reward</Button>
                    <Button icon={<XCircle size={14} />} loading={skipMutation.isPending} title="Dismiss without granting" onClick={() => skipMutation.mutate(r._id)} />
                  </Space>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <GrantDrawer open={!!grantTarget} reward={grantTarget || {}} onClose={() => setGrantTarget(null)} />
    </div>
  );
}
