import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { MessageCircle, Phone, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { Button, Card, Empty, Grid, Input, Result, Select, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { usePermissions } from '../../store/usePermissions';

const { Title, Text } = Typography;

// Customer WhatsApp chats copied from the business numbers by Bounce Guard
// (incoming messages, replies typed in the WhatsApp Business app, and the
// 6-month history imported when a number is connected). Read-only.

export const canSeeWhatsAppChats = (perm) => perm.isManager || perm.hasPermission('whatsapp_chats:read');

const showNumber = (n = '') =>
  n.length === 12 && n.startsWith('91') ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`;

const STATUS_TEXT = { sent: '✓', delivered: '✓✓', read: '✓✓ read', failed: 'failed', edited: 'edited' };

export default function WhatsAppChats() {
  const perm = usePermissions();
  const screens = Grid.useBreakpoint();
  const narrow = !screens.md;
  const [business, setBusiness] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null); // { business, contact }
  const bottomRef = useRef(null);
  const allowed = canSeeWhatsAppChats(perm);

  const { data: list, isLoading } = useQuery({
    queryKey: ['wa-chats', 'threads', business, search],
    queryFn: () => api.get('/wa-chats/threads', { params: { business: business || undefined, q: search || undefined } }).then((r) => r.data),
    refetchInterval: 30000,
    enabled: allowed,
  });

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['wa-chats', 'thread', open?.business, open?.contact],
    queryFn: () => api.get(`/wa-chats/threads/${open.business}/${open.contact}`).then((r) => r.data),
    refetchInterval: 30000,
    enabled: allowed && !!open,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages?.length, open?.contact]);

  const days = useMemo(() => {
    const groups = [];
    for (const m of thread?.messages || []) {
      const day = format(new Date(m.sentAt), 'd MMM yyyy');
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1).items.push(m);
    }
    return groups;
  }, [thread]);

  if (!allowed) {
    return <Result status="403" title="No access" subTitle="WhatsApp chats are visible to managers and people given the whatsapp_chats:read permission." />;
  }

  const threads = list?.threads || [];
  const businesses = list?.businesses || [];

  const threadList = (
    <Card bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
      <Space direction="vertical" style={{ width: '100%', padding: 12 }}>
        <Select
          value={business}
          onChange={(v) => { setBusiness(v); setOpen(null); }}
          style={{ width: '100%' }}
          options={[{ value: '', label: 'All WhatsApp numbers' }, ...businesses.map((b) => ({ value: b.business, label: showNumber(b.business) }))]}
        />
        <Input.Search placeholder="Search name, number or text" allowClear onSearch={setSearch} />
      </Space>
      <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : threads.length === 0 ? (
          <Empty style={{ padding: 32 }} description={search ? 'No chat matches.' : 'No chats yet. They appear once the WhatsApp number is connected.'} />
        ) : threads.map((t) => {
          const active = open?.contact === t.contact && open?.business === t.business;
          const at = new Date(t.lastAt);
          return (
            <div
              key={`${t.business}-${t.contact}`}
              role="button"
              tabIndex={0}
              onClick={() => setOpen({ business: t.business, contact: t.contact })}
              onKeyDown={(e) => e.key === 'Enter' && setOpen({ business: t.business, contact: t.contact })}
              style={{ padding: '10px 14px', borderTop: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer', background: active ? 'rgba(22,119,255,0.08)' : undefined }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Text strong ellipsis>{t.name || showNumber(t.contact)}</Text>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{isToday(at) ? format(at, 'h:mm a') : format(at, 'd MMM')}</Text>
              </div>
              <Text type="secondary" ellipsis style={{ fontSize: 13, display: 'block' }}>
                {t.lastDirection === 'out' ? 'You: ' : ''}{t.lastBody}
              </Text>
              {t.lastDirection === 'in' && <Tag color="orange" style={{ marginTop: 4 }}>awaiting reply</Tag>}
            </div>
          );
        })}
      </div>
    </Card>
  );

  const conversation = (
    <Card
      style={{ height: '100%' }}
      title={open ? (
        <Space wrap>
          {narrow && <Button type="text" icon={<ArrowLeft size={16} />} onClick={() => setOpen(null)} aria-label="Back to chats" />}
          <span>{thread?.name || showNumber(open.contact)}</span>
          {thread?.name && <Text type="secondary">{showNumber(open.contact)}</Text>}
        </Space>
      ) : 'Pick a chat'}
      extra={open && (
        <Space>
          <Button size="small" icon={<Phone size={14} />} href={`tel:+${open.contact}`}>Call</Button>
          <Button size="small" icon={<MessageCircle size={14} />} href={`https://wa.me/${open.contact}`} target="_blank" rel="noopener noreferrer">WhatsApp</Button>
        </Space>
      )}
    >
      {!open ? (
        <Empty description="Select a customer on the left to read the conversation." />
      ) : threadLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {days.map((g) => (
            <React.Fragment key={g.day}>
              <Text type="secondary" style={{ alignSelf: 'center', fontSize: 12, padding: '6px 0' }}>{g.day}</Text>
              {g.items.map((m) => {
                const out = m.direction === 'out';
                const meta = [format(new Date(m.sentAt), 'h:mm a'), out ? STATUS_TEXT[m.status] : null, m.source === 'history' ? 'imported' : null].filter(Boolean).join(' · ');
                return (
                  <div
                    key={m.waMessageId}
                    style={{
                      alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '78%', padding: '6px 10px', borderRadius: 10,
                      background: out ? '#dcf8c6' : '#f5f5f5', color: '#1f2328', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      fontStyle: m.status === 'deleted' ? 'italic' : undefined, opacity: m.status === 'deleted' ? 0.7 : 1,
                    }}
                  >
                    {m.mediaId && <ImageIcon size={14} style={{ marginRight: 4, verticalAlign: -2 }} />}
                    {m.body}
                    <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', marginTop: 2 }}>{meta}</div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </Card>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 0 }}>WhatsApp Chats</Title>
        <Text type="secondary">Customer conversations on our business WhatsApp numbers, kept as a backup and for follow-up</Text>
      </div>
      {narrow ? (open ? conversation : threadList) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16 }}>
          {threadList}
          {conversation}
        </div>
      )}
    </div>
  );
}
