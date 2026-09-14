import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle2, RefreshCw, TriangleAlert, Smartphone, Bell, Clock, Users,
  Pin, ClipboardList, BarChart3, Package, Phone, Megaphone, UserPlus,
} from 'lucide-react';
import api from '../../api/axios';
import { Button, Card, Input, Select, Space, Tag, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;

const STATUS_CONFIG = {
  connected: { label: 'Connected', color: '#22c55e', bg: '#f0fdf4', icon: CheckCircle2 },
  qr_ready: { label: 'Scan QR Code', color: '#3b82f6', bg: '#eff6ff', icon: Smartphone },
  connecting: { label: 'Connecting…', color: '#eab308', bg: '#fefce8', icon: RefreshCw },
  disconnected: { label: 'Disconnected', color: '#ef4444', bg: '#fef2f2', icon: TriangleAlert },
  unavailable: { label: 'Unavailable', color: '#9ca3af', bg: '#f9fafb', icon: TriangleAlert },
};

const DEFAULT_DEPARTMENTS = [
  { name: 'Marketing', code: 'MKT', color: '#9333ea' },
  { name: 'Marketplace', code: 'MKTPL', color: '#f97316' },
  { name: 'Sales', code: 'SALES', color: '#16a34a' },
  { name: 'Production', code: 'PROD', color: '#2563eb' },
  { name: 'R&D', code: 'RND', color: '#0891b2' },
  { name: 'Operations', code: 'OPS', color: '#4f46e5' },
  { name: 'Accounts & Finance', code: 'ACCFIN', color: '#059669' },
  { name: 'HR', code: 'HR', color: '#d97706' },
  { name: 'Management', code: 'MGMT', color: '#475569' },
];

function SeedDepartments({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSeed = async () => {
    setLoading(true);
    let created = 0, skipped = 0;
    for (const dept of DEFAULT_DEPARTMENTS) {
      try {
        await api.post('/departments', dept);
        created++;
      } catch (e) {
        if (e.response?.status === 409 || e.response?.data?.message?.includes('exists')) skipped++;
      }
    }
    setResult({ created, skipped });
    setLoading(false);
    onDone();
  };

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>No departments found. Auto-create standard departments.</Text>
      {result ? (
        <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>{result.created} departments created, {result.skipped} already existed</Text>
      ) : (
        <Button type="primary" loading={loading} onClick={handleSeed}>Auto-create Departments from Tasks</Button>
      )}
    </div>
  );
}

function DepartmentGroups({ isConnected }) {
  const qc = useQueryClient();
  const [inviteLinks, setInviteLinks] = useState({});
  const [joining, setJoining] = useState({});
  const [joinError, setJoinError] = useState({});
  const [joinSuccess, setJoinSuccess] = useState({});
  const [selections, setSelections] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [expanded, setExpanded] = useState({});
  const [testing, setTesting] = useState({});
  const [testResult, setTestResult] = useState({});

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['wa-groups'],
    queryFn: () => api.get('/whatsapp/groups').then(r => r.data),
    enabled: isConnected,
  });

  const departments = deptsData?.departments || [];
  const groups = groupsData?.data?.groups || [];

  useEffect(() => {
    if (departments.length) {
      const initial = {};
      departments.forEach(d => { initial[d._id] = d.whatsappGroupId || ''; });
      setSelections(initial);
    }
  }, [deptsData]);

  const linkedGroupName = (jid) => groups.find(g => g.jid === jid)?.name;

  const handleJoinLink = async (deptId) => {
    const link = (inviteLinks[deptId] || '').trim();
    if (!link) return;
    setJoining(s => ({ ...s, [deptId]: true }));
    setJoinError(s => ({ ...s, [deptId]: null }));
    try {
      await api.post(`/whatsapp/departments/${deptId}/join-group`, { inviteLink: link });
      setJoinSuccess(s => ({ ...s, [deptId]: true }));
      setInviteLinks(s => ({ ...s, [deptId]: '' }));
      setExpanded(s => ({ ...s, [deptId]: false }));
      qc.invalidateQueries(['departments']);
      qc.invalidateQueries(['wa-groups']);
      setTimeout(() => setJoinSuccess(s => ({ ...s, [deptId]: false })), 3000);
    } catch (err) {
      setJoinError(s => ({ ...s, [deptId]: err.response?.data?.message || 'Failed to join group' }));
    } finally {
      setJoining(s => ({ ...s, [deptId]: false }));
    }
  };

  const handlePickGroup = async (deptId) => {
    setSaving(s => ({ ...s, [deptId]: true }));
    try {
      await api.post(`/whatsapp/departments/${deptId}/group`, { groupJid: selections[deptId] || null });
      setSaved(s => ({ ...s, [deptId]: true }));
      setExpanded(s => ({ ...s, [deptId]: false }));
      qc.invalidateQueries(['departments']);
      setTimeout(() => setSaved(s => ({ ...s, [deptId]: false })), 2000);
    } finally {
      setSaving(s => ({ ...s, [deptId]: false }));
    }
  };

  return (
    <Card>
      <Space size={8}><Users size={18} color="#6b7280" /><Title level={5} style={{ marginBottom: 0 }}>Department WhatsApp Groups</Title></Space>
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 20 }}>When a task goes overdue, an alert is sent to the linked department group automatically.</Paragraph>

      {!isConnected && (
        <Card size="small" style={{ background: '#fff7ed', borderColor: '#fed7aa', marginBottom: 16 }}>
          <Space size={8}><TriangleAlert size={14} color="#f97316" /><Text style={{ fontSize: 12, color: '#c2410c' }}>WhatsApp not connected — connect first to link groups.</Text></Space>
        </Card>
      )}

      {departments.length === 0 ? (
        <SeedDepartments onDone={() => qc.invalidateQueries(['departments'])} />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {departments.map(dept => {
            const groupName = dept.whatsappGroupId ? linkedGroupName(dept.whatsappGroupId) : null;
            const isOpen = !!expanded[dept._id];
            return (
              <Card key={dept._id} size="small" styles={{ body: { padding: 0 } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fafafa' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13 }}>{dept.name}</Text>
                    {dept.whatsappGroupId ? (
                      <div><Space size={4}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /><Text style={{ fontSize: 11, color: '#16a34a' }}>{groupName || 'Group linked'}</Text></Space></div>
                    ) : (
                      <div><Text type="secondary" style={{ fontSize: 11 }}>No group linked</Text></div>
                    )}
                  </div>
                  <Space size={8}>
                    {joinSuccess[dept._id] && <Tag color="green">Joined!</Tag>}
                    {saved[dept._id] && <Tag color="green">Saved</Tag>}
                    {testResult[dept._id] && <Tag color="green">Sent!</Tag>}
                    {dept.whatsappGroupId && isConnected && (
                      <Button
                        size="small" loading={testing[dept._id]}
                        onClick={async () => {
                          setTesting(s => ({ ...s, [dept._id]: true }));
                          setTestResult(s => ({ ...s, [dept._id]: false }));
                          try {
                            await api.post(`/whatsapp/departments/${dept._id}/test`);
                            setTestResult(s => ({ ...s, [dept._id]: true }));
                            setTimeout(() => setTestResult(s => ({ ...s, [dept._id]: false })), 4000);
                          } catch {}
                          setTesting(s => ({ ...s, [dept._id]: false }));
                        }}
                      >
                        Send Alert
                      </Button>
                    )}
                    <Button size="small" disabled={!isConnected} onClick={() => isConnected && setExpanded(s => ({ ...s, [dept._id]: !s[dept._id] }))}>
                      {isOpen ? 'Cancel' : dept.whatsappGroupId ? 'Change' : 'Link Group'}
                    </Button>
                  </Space>
                </div>

                {isOpen && (
                  <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <div>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Paste WhatsApp group invite link</Text>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder="https://chat.whatsapp.com/XXXXXXXXXX" value={inviteLinks[dept._id] || ''}
                            onChange={e => setInviteLinks(s => ({ ...s, [dept._id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleJoinLink(dept._id)}
                          />
                          <Button type="primary" style={{ background: '#16a34a', borderColor: '#16a34a' }} loading={joining[dept._id]} disabled={!inviteLinks[dept._id]?.trim()} onClick={() => handleJoinLink(dept._id)}>Join & Link</Button>
                        </Space.Compact>
                        {joinError[dept._id] && <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{joinError[dept._id]}</Text>}
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>WhatsApp group → ⋮ Menu → Invite to group → Copy link</Text>
                      </div>

                      {groups.length > 0 && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                            <Text type="secondary" style={{ fontSize: 11 }}>or pick from already joined groups</Text>
                            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                          </div>
                          <Space.Compact style={{ width: '100%' }}>
                            <Select
                              style={{ flex: 1 }} value={selections[dept._id] || undefined} onChange={v => setSelections(s => ({ ...s, [dept._id]: v }))}
                              placeholder="— None —" options={groups.map(g => ({ label: `${g.name} (${g.participants} members)`, value: g.jid }))}
                            />
                            <Button type="primary" loading={saving[dept._id]} onClick={() => handlePickGroup(dept._id)}>Save</Button>
                          </Space.Compact>
                        </>
                      )}
                    </Space>
                  </div>
                )}
              </Card>
            );
          })}
        </Space>
      )}
    </Card>
  );
}

function CrmLeadGroup({ isConnected }) {
  const qc = useQueryClient();
  const [inviteLink, setInviteLink] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedJid, setSelectedJid] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: orgData } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => api.get('/settings/organization').then(r => r.data),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['wa-groups'],
    queryFn: () => api.get('/whatsapp/groups').then(r => r.data),
    enabled: isConnected,
  });

  const groups = groupsData?.data?.groups || [];
  const crmGroupId = orgData?.data?.organization?.crmLeadGroupId || orgData?.data?.crmLeadGroupId || null;
  const linkedGroupName = crmGroupId ? groups.find(g => g.jid === crmGroupId)?.name : null;

  const handleJoinLink = async () => {
    if (!inviteLink.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await api.post('/whatsapp/crm/join-group', { inviteLink: inviteLink.trim() });
      setInviteLink('');
      setExpanded(false);
      qc.invalidateQueries({ queryKey: ['org-settings'] });
      qc.invalidateQueries({ queryKey: ['wa-groups'] });
    } catch (err) {
      setJoinError(err.response?.data?.message || 'Failed to join group');
    } finally {
      setJoining(false);
    }
  };

  const handlePickGroup = async () => {
    setSaving(true);
    try {
      await api.post('/whatsapp/crm/group', { groupJid: selectedJid || null });
      setSaved(true);
      setExpanded(false);
      qc.invalidateQueries({ queryKey: ['org-settings'] });
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await api.post('/whatsapp/crm/group', { groupJid: null });
    qc.invalidateQueries({ queryKey: ['org-settings'] });
  };

  return (
    <Card>
      <Space size={8}><UserPlus size={18} color="#6b7280" /><Title level={5} style={{ marginBottom: 0 }}>New Lead Alerts — WhatsApp Group</Title></Space>
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 20 }}>Whenever a new lead is added in CRM, a notification is sent to this WhatsApp group automatically.</Paragraph>

      {!isConnected && (
        <Card size="small" style={{ background: '#fff7ed', borderColor: '#fed7aa', marginBottom: 16 }}>
          <Space size={8}><TriangleAlert size={14} color="#f97316" /><Text style={{ fontSize: 12, color: '#c2410c' }}>WhatsApp not connected — connect first to link groups.</Text></Space>
        </Card>
      )}

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fafafa' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ fontSize: 13 }}>CRM Lead Notifications</Text>
            {crmGroupId ? (
              <div><Space size={4}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /><Text style={{ fontSize: 11, color: '#16a34a' }}>{linkedGroupName || 'Group linked'}</Text></Space></div>
            ) : (
              <div><Text type="secondary" style={{ fontSize: 11 }}>No group linked</Text></div>
            )}
          </div>
          <Space size={8}>
            {saved && <Tag color="green">Saved</Tag>}
            {crmGroupId && <Button size="small" danger onClick={handleClear}>Clear</Button>}
            <Button size="small" disabled={!isConnected} onClick={() => isConnected && setExpanded(p => !p)}>{expanded ? 'Cancel' : crmGroupId ? 'Change' : 'Link Group'}</Button>
          </Space>
        </div>

        {expanded && (
          <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Paste WhatsApp group invite link</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="https://chat.whatsapp.com/XXXXXXXXXX" value={inviteLink} onChange={e => setInviteLink(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoinLink()} />
                  <Button type="primary" style={{ background: '#16a34a', borderColor: '#16a34a' }} loading={joining} disabled={!inviteLink.trim()} onClick={handleJoinLink}>Join & Link</Button>
                </Space.Compact>
                {joinError && <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{joinError}</Text>}
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>WhatsApp group → ⋮ Menu → Invite to group → Copy link</Text>
              </div>

              {groups.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>or pick from already joined groups</Text>
                    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                  </div>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select style={{ flex: 1 }} value={selectedJid || undefined} onChange={setSelectedJid} placeholder="— None —" options={groups.map(g => ({ label: `${g.name} (${g.participants} members)`, value: g.jid }))} />
                    <Button type="primary" loading={saving} onClick={handlePickGroup}>Save</Button>
                  </Space.Compact>
                </>
              )}
            </Space>
          </div>
        )}
      </Card>
    </Card>
  );
}

const NOTIFICATION_EVENTS = [
  { icon: Pin, title: 'Task Assigned', desc: 'Employee gets a WhatsApp immediately when a task is assigned to them', always: true },
  { icon: TriangleAlert, title: 'Task Overdue — Employee', desc: 'Employee gets WhatsApp when their task passes the due date, then every 24h', always: true },
  { icon: TriangleAlert, title: 'Task Overdue — Manager', desc: 'Manager who assigned the task gets alerted when it goes overdue', always: true },
  { icon: ClipboardList, title: 'Tasks Due Today — Department Group', desc: 'Department WhatsApp group gets a morning summary (9 AM) of all tasks due that day', always: false },
  { icon: Users, title: 'Task Overdue — Department Group', desc: 'Department WhatsApp group gets an alert when any task in that department goes overdue', always: false },
  { icon: BarChart3, title: 'Daily Report — 9 PM IST', desc: 'All admins & founders get a full daily summary every night at 9 PM', always: true },
  { icon: Package, title: 'Low Stock Alerts', desc: 'Admins notified when product stock drops to zero', always: false },
  { icon: Phone, title: 'Lead Follow-up Reminders', desc: "Sales staff reminded when a lead hasn't been contacted in 48 hours", always: false },
];

const SCHEDULE_ROWS = [
  { time: 'Every 30 min', event: 'Check for newly overdue tasks' },
  { time: 'Every hour', event: 'Check stale CRM leads (48h no contact)' },
  { time: '9:00 AM IST', event: 'Due-today task reminders to department groups' },
  { time: '9:00 PM IST', event: 'Daily report WhatsApp to all admins' },
  { time: '8:00 AM IST', event: 'Follow-up reminders for CRM leads' },
  { time: '10:00 AM IST', event: 'Daily WhatsApp updates to In Progress leads' },
  { time: 'Every 6 hours', event: 'Low stock inventory check' },
];

export default function WhatsAppSetup() {
  const qc = useQueryClient();
  const [pollActive, setPollActive] = useState(true);

  const { data: statusData } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then((r) => r.data),
    refetchInterval: pollActive ? 3000 : false,
  });

  const { data: qrData, refetch: refetchQR } = useQuery({
    queryKey: ['wa-qr'],
    queryFn: () => api.get('/whatsapp/qr').then((r) => r.data),
    refetchInterval: pollActive ? 4000 : false,
    enabled: !statusData?.connected,
  });

  useEffect(() => {
    if (statusData?.connected) {
      setPollActive(false);
      qc.invalidateQueries(['wa-qr']);
    } else {
      setPollActive(true);
    }
  }, [statusData?.connected]);

  const testReport = useMutation({ mutationFn: () => api.post('/whatsapp/test-report') });
  const reconnect = useMutation({
    mutationFn: () => api.post('/whatsapp/reconnect'),
    onSuccess: () => {
      setPollActive(true);
      qc.invalidateQueries(['wa-status']);
      qc.invalidateQueries(['wa-qr']);
    },
  });

  const status = statusData?.status || 'disconnected';
  const isConnected = statusData?.connected;
  const qrImage = qrData?.qrImage;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  const StatusIcon = cfg.icon;

  return (
    <div style={{ maxWidth: 640 }}>
      <Title level={4} style={{ marginBottom: 0 }}>WhatsApp Notifications</Title>
      <Text type="secondary">Connect your WhatsApp number to receive task alerts and daily reports</Text>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
        <Card>
          <Space size={16} style={{ marginBottom: 24 }} align="center">
            <div style={{ width: 48, height: 48, borderRadius: 14, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <StatusIcon size={22} color={cfg.color} className={status === 'connecting' ? 'animate-spin' : ''} />
            </div>
            <div>
              <Title level={5} style={{ marginBottom: 0 }}>WhatsApp Status</Title>
              <Space size={6}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                <Text strong style={{ fontSize: 13, color: cfg.color }}>{cfg.label}</Text>
              </Space>
            </div>
          </Space>

          {!isConnected && (
            <div>
              <Card size="small" style={{ background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 20 }}>
                <Space size={8} style={{ marginBottom: 8 }}><Smartphone size={16} color="#1d4ed8" /><Text strong style={{ fontSize: 13, color: '#1e3a8a' }}>How to connect</Text></Space>
                <ol style={{ fontSize: 13, color: '#1e40af', margin: 0, paddingLeft: 20 }}>
                  <li>Open WhatsApp on your phone</li>
                  <li>Tap <strong>⋮ Menu → Linked Devices</strong></li>
                  <li>Tap <strong>Link a Device</strong></li>
                  <li>Scan the QR code below</li>
                </ol>
              </Card>

              {qrImage ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <Card size="small" style={{ padding: 8 }}><img src={qrImage} alt="WhatsApp QR Code" style={{ width: 256, height: 256 }} /></Card>
                  <Text type="secondary" style={{ fontSize: 13, textAlign: 'center' }}>QR code expires in ~60 seconds. It auto-refreshes.</Text>
                  <Button type="link" icon={<RefreshCw size={14} />} onClick={() => { refetchQR(); qc.invalidateQueries(['wa-status']); }}>Refresh QR</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#9ca3af' }}>
                  <RefreshCw size={28} className="animate-spin" style={{ marginBottom: 12 }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>{status === 'unavailable' ? 'WhatsApp package not installed — run: npm install @whiskeysockets/baileys' : 'Generating QR code… (server is starting up)'}</Text>
                </div>
              )}
            </div>
          )}

          {isConnected && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', gap: 16 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={40} color="#16a34a" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <Title level={5} style={{ marginBottom: 4 }}>WhatsApp Connected!</Title>
                <Text type="secondary" style={{ fontSize: 13 }}>All notifications will be sent via WhatsApp</Text>
              </div>
              <Button danger icon={<RefreshCw size={14} className={reconnect.isPending ? 'animate-spin' : ''} />} loading={reconnect.isPending} onClick={() => reconnect.mutate()}>Reconnect WhatsApp</Button>
              {reconnect.isSuccess && <Text style={{ fontSize: 12, color: '#ea580c' }}>Session reset — scan the new QR code below in a few seconds</Text>}
            </div>
          )}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Title level={5} style={{ marginBottom: 16 }}>Notification Events</Title>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {NOTIFICATION_EVENTS.map((item) => (
              <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 8, background: '#fafafa' }}>
                <item.icon size={18} color="#6b7280" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text></div>
                </div>
                <Tag color={item.always ? 'green' : 'default'}>{item.always ? 'Active' : 'Conditional'}</Tag>
              </div>
            ))}
          </Space>
        </Card>

        {isConnected && (
          <Card style={{ marginTop: 16 }}>
            <Title level={5} style={{ marginBottom: 4 }}>Test Notifications</Title>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>Manually trigger to verify WhatsApp delivery</Text>
            <Button type="primary" icon={<Bell size={14} />} loading={testReport.isPending} onClick={() => testReport.mutate()}>Send Test Daily Report Now</Button>
            {testReport.isSuccess && <div style={{ marginTop: 8 }}><Space size={4}><CheckCircle2 size={14} color="#16a34a" /><Text style={{ fontSize: 13, color: '#16a34a' }}>Report sent! Check your WhatsApp.</Text></Space></div>}
          </Card>
        )}

        <div style={{ marginTop: 16 }}><CrmLeadGroup isConnected={isConnected} /></div>
        <div style={{ marginTop: 16 }}><DepartmentGroups isConnected={isConnected} /></div>

        <Card style={{ marginTop: 16 }}>
          <Space size={8} style={{ marginBottom: 12 }}><Clock size={16} /><Title level={5} style={{ marginBottom: 0 }}>Automation Schedule</Title></Space>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {SCHEDULE_ROWS.map((row) => (
              <div key={row.time} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tag style={{ fontFamily: 'monospace', width: 112, textAlign: 'center' }}>{row.time}</Tag>
                <Text type="secondary" style={{ fontSize: 13 }}>{row.event}</Text>
              </div>
            ))}
          </Space>
        </Card>
      </motion.div>
    </div>
  );
}
