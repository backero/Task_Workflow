import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  ArrowLeft, Phone, Mail, Building2, MapPin, IndianRupee, CalendarDays,
  Clock, CheckCircle2, Pencil, X, MessageCircle, HelpCircle, Send,
  ClipboardList, ExternalLink, FileText, Flag, RefreshCw, Package,
  Settings, Truck, XCircle, Wrench, CircleDot, Handshake, Monitor,
  ImagePlus, Plus,
} from 'lucide-react';
import { Button, Card, Col, Drawer, Empty, Input, Row, Select, Space, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { clsx } from 'clsx';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';

const { Text, Title, Paragraph } = Typography;

const FOLLOWUP_ICONS = { call: Phone, whatsapp: MessageCircle, meeting: Handshake, email: Mail, demo: Monitor, other: FileText };

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'Sample', 'In Progress', 'Ready to Dispatch', 'Dispatched', 'Payment Pending', 'Lost'];
const LOST_REASONS = ['Price too high', 'Chose competitor', 'No budget', 'No response / Ghosted', 'Timeline mismatch', 'Product not suitable', 'Changed requirements', 'Other'];

const STAGE_COLOR = {
  'New Lead': 'default',
  'Contacted': 'blue',
  'Interested': 'geekblue',
  'Follow-up': 'gold',
  'Proposal Sent': 'orange',
  'Negotiation': 'purple',
  'Query Pending': 'gold',
  'In Progress': 'blue',
  'Ready to Dispatch': 'purple',
  'Dispatched': 'geekblue',
  'Payment Pending': 'green',
  'Lost': 'red',
};

// Actual outgoing WhatsApp message text sent to the customer — the trailing
// ✅/🚚 are part of the message content, not decorative UI, so they stay.
const MILESTONE_MESSAGES = [
  'Raw materials have been purchased ✅',
  'Production has started ✅',
  'Your product is being manufactured ✅',
  'Quality check is in progress ✅',
  'Quality check passed — product approved ✅',
  'Packaging is complete ✅',
  'Your order is ready for dispatch ✅',
  'Your order has been dispatched 🚚',
  'Custom message…',
];

const PRIORITY_COLOR = { critical: 'red', high: 'orange', medium: 'gold', low: 'default' };

const STAGE_META_LOCAL = {
  'New Lead': { color: '#94a3b8', icon: Flag },
  'Follow-up': { color: '#f59e0b', icon: RefreshCw },
  'Sample': { color: '#d946ef', icon: Package },
  'In Progress': { color: '#3b82f6', icon: Settings },
  'Ready to Dispatch': { color: '#8b5cf6', icon: CheckCircle2 },
  'Dispatched': { color: '#14b8a6', icon: Truck },
  'Payment Pending': { color: '#22c55e', icon: IndianRupee },
  'Lost': { color: '#f43f5e', icon: XCircle },
};

export default function LeadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editProductInterest, setEditProductInterest] = useState([]);
  const [piInput, setPiInput] = useState('');

  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, control: editControl } = useForm();
  const [updateMode, setUpdateMode] = useState(false);
  const [pendingStage, setPendingStage] = useState(null);
  const [stageShiftReason, setStageShiftReason] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [showDealValueModal, setShowDealValueModal] = useState(false);
  const [dealValueInput, setDealValueInput] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState(MILESTONE_MESSAGES[0]);
  const [customMessage, setCustomMessage] = useState('');
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [commType, setCommType] = useState('call');
  const [commTitle, setCommTitle] = useState('');
  const [commContent, setCommContent] = useState('');
  const [commDate, setCommDate] = useState('');
  const [commImages, setCommImages] = useState([]);
  const [commImagePreviews, setCommImagePreviews] = useState([]);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [samplePiList, setSamplePiList] = useState([]);
  const [samplePiInput, setSamplePiInput] = useState('');
  const [sampleEstValue, setSampleEstValue] = useState('');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', id],
    queryFn: () => api.get(`/crm/leads/${id}`).then(r => r.data.lead),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then(r => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: (payload) => {
      const data = typeof payload === 'string' ? { status: payload } : payload;
      return api.put(`/crm/leads/${id}`, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      qc.refetchQueries({ queryKey: ['crm', 'pipeline'] });
      toast.success('Stage updated');
    },
  });

  const editMutation = useMutation({
    mutationFn: (data) => api.put(`/crm/leads/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      toast.success('Lead updated');
      setEditMode(false);
    },
    onError: () => toast.error('Failed to update lead'),
  });

  const commLogMutation = useMutation({
    mutationFn: (formData) => api.post(`/crm/leads/${id}/comm-log`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      toast.success('Communication log saved');
      setShowCommModal(false);
      setCommType('call'); setCommTitle(''); setCommContent(''); setCommDate('');
      setCommImages([]); setCommImagePreviews([]);
    },
    onError: () => toast.error('Failed to save log'),
  });

  const { data: leadQueries } = useQuery({
    queryKey: ['crm', 'lead', id, 'queries'],
    queryFn: () => api.get(`/crm/leads/${id}/queries`).then(r => r.data.queries),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (message) => api.post(`/crm/leads/${id}/send-update`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      toast.success('Update sent to client via WhatsApp');
      setUpdateMode(false);
      setCustomMessage('');
      setSelectedMilestone(MILESTONE_MESSAGES[0]);
    },
    onError: () => toast.error('Failed to send update'),
  });

  const onSubmitEdit = (data) => {
    editMutation.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      city: data.city,
      state: data.state,
      businessType: data.businessType,
      priority: data.priority,
      estimatedValue: data.estimatedValue ? Number(data.estimatedValue) : 0,
      notes: data.notes,
      assignedTo: data.assignedTo || undefined,
      productInterest: editProductInterest,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <Text type="secondary">Lead not found</Text>
        <div><Button style={{ marginTop: 16 }} onClick={() => navigate('/crm/pipeline')}>Back to Pipeline</Button></div>
      </div>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <Button shape="circle" icon={<ArrowLeft size={18} />} onClick={() => navigate('/crm/pipeline')} style={{ marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <Space size={10} wrap align="center">
            <Title level={4} style={{ marginBottom: 0 }}>{lead.name}</Title>
            <Tag color={STAGE_COLOR[lead.status] || 'default'}>{lead.status}</Tag>
            <Button size="small" icon={<Pencil size={13} />} onClick={() => { setEditMode(true); resetEdit({ ...lead, assignedTo: lead.assignedTo?._id || '' }); setEditProductInterest(lead?.productInterest || []); setPiInput(''); }}>Edit</Button>
            {lead.isConverted ? (
              <Button size="small" icon={<ExternalLink size={13} />} style={{ color: '#15803d', borderColor: '#86efac', background: '#f0fdf4' }} onClick={() => navigate(`/workflow/${lead.convertedToTask?._id || ''}`)}>View Project</Button>
            ) : (lead.status === 'Payment Pending' || lead.status === 'In Progress') ? (
              <Button
                size="small" type="primary" icon={<ClipboardList size={13} />}
                onClick={() => navigate('/workflow', {
                  state: {
                    fromLead: {
                      id: lead._id,
                      name: lead.name,
                      title: `${lead.name} — Order`,
                      description: lead.notes ? `Client: ${lead.name}${lead.company ? ` | ${lead.company}` : ''} | Phone: ${lead.phone}\n\nRequirements: ${lead.notes}` : `Client: ${lead.name}${lead.company ? ` | ${lead.company}` : ''} | Phone: ${lead.phone}`,
                      priority: lead.priority || 'high',
                      dueDate: '',
                    },
                  },
                })}
              >
                Convert to Project
              </Button>
            ) : null}
            {(lead.status === 'Payment Pending' || lead.status === 'Dispatched') && (
              <Button size="small" icon={<FileText size={13} />} style={{ color: '#1d4ed8', borderColor: '#93c5fd' }} onClick={() => navigate(`/finance/invoices?fromLead=${lead._id}`)}>Create Invoice</Button>
            )}
            <Button size="small" icon={<Send size={13} />} style={{ color: '#15803d', borderColor: '#86efac' }} onClick={() => setUpdateMode(true)}>Send Update</Button>
          </Space>
          <div><Text type="secondary" style={{ fontSize: 13 }}>Added {format(new Date(lead.createdAt), 'dd MMM yyyy')}{lead.source && ` • ${lead.source}`}</Text></div>
        </div>
      </div>

      <Row gutter={24}>
        {/* Left column: Info + pipeline */}
        <Col span={16}>
          <Space direction="vertical" style={{ width: '100%' }} size={20}>

            {/* Pipeline stage mover */}
            <Card>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Pipeline Stage</Text>
              <Space size={8} wrap>
                {PIPELINE_STAGES.map((stage) => {
                  const active = lead.status === stage;
                  return (
                    <Tag
                      key={stage}
                      color={active ? STAGE_COLOR[stage] || 'default' : undefined}
                      style={{
                        cursor: 'pointer', padding: '4px 12px', fontSize: 13, fontWeight: 500, borderRadius: 999,
                        opacity: active ? 1 : 0.6, border: active ? undefined : '1px solid transparent',
                      }}
                      icon={active ? <CheckCircle2 size={12} style={{ marginRight: 2 }} /> : undefined}
                      onClick={() => {
                        if (statusMutation.isPending) return;
                        if (lead.status === stage) return;
                        const currentIdx = PIPELINE_STAGES.indexOf(lead.status);
                        const nextIdx = PIPELINE_STAGES.indexOf(stage);
                        if (nextIdx > currentIdx && !lead.communicationLogs?.length) {
                          toast.error('Log what was discussed before moving to the next stage');
                          document.querySelector('[data-section="comm-log"]')?.scrollIntoView({ behavior: 'smooth' });
                          return;
                        }
                        if (stage === 'Sample') {
                          setSamplePiList(lead.productInterest?.length ? [...lead.productInterest] : []);
                          setSamplePiInput('');
                          setSampleEstValue(lead.estimatedValue && lead.estimatedValue > 0 ? String(lead.estimatedValue) : '');
                          setShowSampleModal(true);
                          return;
                        }
                        if (stage === 'In Progress' && !lead.sampleDetails?.sentDate) {
                          toast.error('Fill in the sample Sent Date before moving to Production');
                          return;
                        }
                        if (stage === 'Payment Pending') {
                          setDealValueInput(lead.dealValue ? String(lead.dealValue) : '');
                          setShowDealValueModal(true);
                          return;
                        }
                        if (stage === 'Lost') {
                          setLostReason(LOST_REASONS[0]);
                          setLostNotes('');
                          setShowLostModal(true);
                          return;
                        }
                        if (lead.status === 'New Lead' && stage !== 'New Lead') {
                          setPendingStage(stage);
                          setStageShiftReason('');
                          return;
                        }
                        statusMutation.mutate(stage);
                      }}
                    >
                      {stage}
                    </Tag>
                  );
                })}
              </Space>
            </Card>

            {/* Contact details */}
            <Card>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 16 }}>Contact Details</Text>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Phone</Text>
                  <Space size={12}>
                    <a href={`tel:${lead.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}>
                      <Phone size={14} color="#94a3b8" />{lead.phone}
                    </a>
                    <a href={`https://wa.me/91${lead.phone?.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MessageCircle size={12} /> WA
                    </a>
                  </Space>
                </Col>

                {lead.email && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Email</Text>
                    <a href={`mailto:${lead.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}>
                      <Mail size={14} color="#94a3b8" />{lead.email}
                    </a>
                  </Col>
                )}

                {lead.company && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Company</Text>
                    <Space size={6}>
                      <Building2 size={14} color="#94a3b8" />
                      <Text strong style={{ fontSize: 13 }}>{lead.company}</Text>
                      {lead.designation && <Text type="secondary" style={{ fontSize: 13 }}>({lead.designation})</Text>}
                    </Space>
                  </Col>
                )}

                {(lead.city || lead.state) && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Location</Text>
                    <Space size={6}>
                      <MapPin size={14} color="#94a3b8" />
                      <Text strong style={{ fontSize: 13 }}>{[lead.city, lead.state].filter(Boolean).join(', ')}</Text>
                    </Space>
                  </Col>
                )}

                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Priority</Text>
                  <Tag color={PRIORITY_COLOR[lead.priority] || 'default'}>{lead.priority}</Tag>
                </Col>

                {lead.estimatedValue > 0 && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Estimated Value</Text>
                    <Space size={4}>
                      <IndianRupee size={14} color="#16a34a" />
                      <Text strong style={{ color: '#16a34a', fontSize: 13 }}>{lead.estimatedValue.toLocaleString('en-IN')}</Text>
                    </Space>
                  </Col>
                )}

                {lead.assignedTo && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Assigned To</Text>
                    <Space size={8}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#a8781f1f', color: '#a8781f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {lead.assignedTo.firstName?.[0]}
                      </div>
                      <Text strong style={{ fontSize: 13 }}>{lead.assignedTo.firstName} {lead.assignedTo.lastName}</Text>
                    </Space>
                  </Col>
                )}

                {lead.nextFollowUpAt && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Next Follow-Up</Text>
                    <Space size={6}>
                      <CalendarDays size={14} color="#ea580c" />
                      <Text strong style={{ color: '#ea580c', fontSize: 13 }}>{format(new Date(lead.nextFollowUpAt), 'dd MMM yyyy, h:mm a')}</Text>
                    </Space>
                  </Col>
                )}
              </Row>

              {lead.notes && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Notes</Text>
                  <Paragraph style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{lead.notes}</Paragraph>
                </div>
              )}
            </Card>
          </Space>
        </Col>

        {/* Right column: Activity Timeline */}
        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card>
              {(() => {
                const events = [];

                (lead.stageHistory || []).forEach((h) => {
                  events.push({ type: 'stage', ts: new Date(h.enteredAt), stage: h.stage, movedBy: h.movedBy, exitedAt: h.exitedAt });
                });
                (lead.followUps || []).forEach((fu) => {
                  events.push({ type: 'followup', ts: new Date(fu.scheduledAt || fu.createdAt), fuType: fu.type, notes: fu.notes, outcome: fu.outcome, nextAction: fu.nextAction, performedBy: fu.performedBy, isCompleted: fu.isCompleted });
                });
                (lead.sampleDetails?.teamUpdates || []).forEach((u) => {
                  events.push({ type: 'team_update', ts: new Date(u.postedAt), text: u.text, postedBy: u.postedBy });
                });
                (lead.sampleDetails?.clientNotes || []).forEach((n) => {
                  events.push({ type: 'client_note', ts: new Date(n.postedAt), text: n.text, postedBy: n.postedBy });
                });

                events.sort((a, b) => b.ts - a.ts);

                return (
                  <>
                    <Space size={6} style={{ marginBottom: 16 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Activity Timeline</Text>
                      {events.length > 0 && <Text strong style={{ color: '#a8781f', fontSize: 11 }}>({events.length})</Text>}
                    </Space>

                    {events.length === 0 ? (
                      <Empty description="No activity logged yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
                    ) : (
                      <div>
                        {events.map((ev, idx) => {
                          const isLast = idx === events.length - 1;
                          let dotColor = '#cbd5e1';
                          let Icon = CircleDot;
                          let title = '';
                          let subtitle = '';
                          let badge = null;

                          if (ev.type === 'stage') {
                            const m = STAGE_META_LOCAL[ev.stage] || { color: '#cbd5e1', icon: RefreshCw };
                            dotColor = m.color;
                            Icon = m.icon;
                            title = `Moved to ${ev.stage === 'In Progress' ? 'Production' : ev.stage}`;
                            if (ev.movedBy?.firstName) subtitle = `by ${ev.movedBy.firstName} ${ev.movedBy.lastName || ''}`;
                            if (ev.exitedAt) {
                              const mins = Math.round((new Date(ev.exitedAt) - ev.ts) / 60000);
                              const hrs = Math.round(mins / 60);
                              const days = Math.round(hrs / 24);
                              const spent = days > 1 ? `${days}d` : hrs > 1 ? `${hrs}h` : `${mins}m`;
                              badge = <Tag style={{ fontSize: 10, fontFamily: 'monospace' }}>{spent}</Tag>;
                            }
                          } else if (ev.type === 'followup') {
                            dotColor = '#a8781f';
                            Icon = FOLLOWUP_ICONS[ev.fuType] || FileText;
                            title = `Follow-up: ${ev.fuType}`;
                            subtitle = ev.notes || ev.outcome || '';
                            if (ev.performedBy?.firstName) subtitle = `${subtitle ? subtitle + ' · ' : ''}by ${ev.performedBy.firstName}`;
                            badge = ev.isCompleted ? <Tag color="green">done</Tag> : <Tag color="gold">pending</Tag>;
                          } else if (ev.type === 'team_update') {
                            dotColor = '#60a5fa';
                            Icon = Wrench;
                            title = 'Team Update';
                            subtitle = ev.text;
                            if (ev.postedBy?.firstName) subtitle = `${subtitle} · by ${ev.postedBy.firstName}`;
                          } else if (ev.type === 'client_note') {
                            dotColor = '#e879f9';
                            Icon = MessageCircle;
                            title = 'Client Note';
                            subtitle = ev.text;
                            if (ev.postedBy?.firstName) subtitle = `${subtitle} · by ${ev.postedBy.firstName}`;
                          }

                          return (
                            <div key={idx} style={{ display: 'flex', gap: 10 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: `2px solid ${dotColor}` }}>
                                  <Icon size={12} color={dotColor} />
                                </div>
                                {!isLast && <div style={{ width: 2, flex: 1, background: '#f1f5f9', margin: '4px 0' }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 4 : 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text strong style={{ fontSize: 13 }}>{title}</Text>
                                    {subtitle && <div><Text type="secondary" style={{ fontSize: 11 }} ellipsis>{subtitle}</Text></div>}
                                  </div>
                                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                    {badge}
                                    <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{isValid(ev.ts) ? format(ev.ts, 'dd MMM, h:mm a') : '—'}</Text>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>

            {/* Production Queries Thread */}
            <Card>
              <Space size={6} style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Technical Queries</Text>
                {leadQueries?.length > 0 && <Text style={{ fontSize: 11, color: '#d97706' }}>({leadQueries.length})</Text>}
              </Space>

              {!leadQueries?.length ? (
                <Empty
                  image={<HelpCircle size={32} color="#d1d5db" style={{ margin: '0 auto' }} />}
                  description={<><div><Text type="secondary" style={{ fontSize: 13 }}>No queries raised yet</Text></div><Text type="secondary" style={{ fontSize: 11 }}>Queries are raised from Sample Production</Text></>}
                />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  {leadQueries.map(q => (
                    <Card key={q._id} size="small" styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
                      <div style={{ background: '#fafafa', padding: 12 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Text strong style={{ color: '#b45309', fontSize: 11 }}>{q.raisedBy?.firstName?.[0]}</Text>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Space size={6} wrap style={{ marginBottom: 4 }}>
                              <Text strong style={{ fontSize: 12 }}>{q.raisedBy?.firstName} {q.raisedBy?.lastName}</Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>{format(new Date(q.createdAt), 'dd MMM, h:mm a')}</Text>
                              <Tag color={q.urgency === 'high' ? 'red' : q.urgency === 'medium' ? 'gold' : 'default'}>{q.urgency}</Tag>
                            </Space>
                            <div><Text strong style={{ fontSize: 13 }}>{q.title}</Text></div>
                            <Text type="secondary" style={{ fontSize: 12 }}>{q.description}</Text>
                            {q.assignedTo && <div><Text style={{ fontSize: 11, color: '#3b82f6' }}>Assigned to: {q.assignedTo.firstName} {q.assignedTo.lastName}</Text></div>}
                          </div>
                        </div>
                      </div>

                      {q.status === 'answered' && q.answer ? (
                        <div style={{ background: '#f6ffed', padding: 12, borderTop: '1px solid #d9f7be' }}>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#d9f7be', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Text strong style={{ color: '#389e0d', fontSize: 11 }}>{q.answeredBy?.firstName?.[0]}</Text>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Space size={6}>
                                <Text strong style={{ color: '#389e0d', fontSize: 12 }}>{q.answeredBy?.firstName} {q.answeredBy?.lastName}</Text>
                                {q.answeredAt && <Text type="secondary" style={{ fontSize: 11 }}>{format(new Date(q.answeredAt), 'dd MMM, h:mm a')}</Text>}
                              </Space>
                              <Paragraph style={{ fontSize: 13, color: '#237804', whiteSpace: 'pre-wrap', marginBottom: 0 }}>{q.answer}</Paragraph>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} />
                          <Text type="secondary" italic style={{ fontSize: 11 }}>Waiting for Production reply…</Text>
                        </div>
                      )}
                    </Card>
                  ))}
                </Space>
              )}
            </Card>

            {/* Communication History */}
            <Card data-section="comm-log">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Space size={6}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Communication History</Text>
                  {lead.communicationLogs?.length > 0 && <Text style={{ fontSize: 11, color: '#3b82f6' }}>({lead.communicationLogs.length})</Text>}
                </Space>
                <Button
                  size="small" icon={<Plus size={12} />}
                  onClick={() => { setCommType('call'); setCommTitle(''); setCommContent(''); setCommDate(''); setCommImages([]); setCommImagePreviews([]); setShowCommModal(true); }}
                >
                  Add Log
                </Button>
              </div>
              {!lead.communicationLogs?.length ? (
                <Empty
                  image={<MessageCircle size={32} color="#d1d5db" style={{ margin: '0 auto' }} />}
                  description={<><div><Text type="secondary" style={{ fontSize: 13 }}>No communication logs yet</Text></div><Text type="secondary" style={{ fontSize: 11 }}>Add call transcripts, WhatsApp chats, or meeting notes</Text></>}
                />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  {[...lead.communicationLogs].sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt)).map((log, i) => {
                    const TypeIcon = FOLLOWUP_ICONS[log.type] || FileText;
                    const TYPE_COLOR = { call: 'green', whatsapp: 'green', meeting: 'blue', email: 'purple', other: 'default' };
                    return (
                      <Card key={log._id || i} size="small">
                        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                          <Tag color={TYPE_COLOR[log.type] || 'default'} icon={<TypeIcon size={11} style={{ marginRight: 2 }} />} style={{ flexShrink: 0 }}>
                            {log.type === 'whatsapp' ? 'WhatsApp' : log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                          </Tag>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {log.title && <Text strong style={{ fontSize: 13 }} ellipsis>{log.title}</Text>}
                            <div><Text type="secondary" style={{ fontSize: 11 }}>{format(new Date(log.happenedAt), 'dd MMM yyyy, h:mm a')}{log.addedBy?.firstName && ` · ${log.addedBy.firstName}`}</Text></div>
                          </div>
                        </div>
                        {log.content && (
                          <Paragraph style={{ fontSize: 12, whiteSpace: 'pre-wrap', background: '#fafafa', borderRadius: 8, padding: 10, marginBottom: 8, lineHeight: 1.6 }}>{log.content}</Paragraph>
                        )}
                        {log.images?.length > 0 && (
                          <Space size={8} wrap>
                            {log.images.map((img, j) => (
                              <img key={j} src={img.url} alt={img.name || 'attachment'} onClick={() => setLightboxImg(img.url)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #f1f5f9', cursor: 'pointer' }} />
                            ))}
                          </Space>
                        )}
                      </Card>
                    );
                  })}
                </Space>
              )}
            </Card>

            {/* Lead metadata */}
            <Card size="small">
              <Space direction="vertical" size={2}>
                <Text type="secondary" style={{ fontSize: 12 }}>Created: {format(new Date(lead.createdAt), 'dd MMM yyyy')}</Text>
                {lead.lastContactedAt && <Text type="secondary" style={{ fontSize: 12 }}>Last contact: {format(new Date(lead.lastContactedAt), 'dd MMM yyyy')}</Text>}
                {lead.convertedAt && <Text style={{ fontSize: 12, color: '#16a34a' }}>Won: {format(new Date(lead.convertedAt), 'dd MMM yyyy')}</Text>}
                {lead.sheetRowId && <Text style={{ fontSize: 12, color: '#2563eb' }}>Synced from Google Sheets</Text>}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* Send WhatsApp Update Drawer */}
      <Drawer
        open={updateMode} onClose={() => setUpdateMode(false)} width={420}
        title="Send WhatsApp Update"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setUpdateMode(false)}>Cancel</Button>
            <Button
              type="primary" style={{ flex: 1 }} icon={<Send size={14} />}
              loading={updateMutation.isPending}
              onClick={() => {
                const msg = selectedMilestone === 'Custom message…' ? customMessage : selectedMilestone;
                if (!msg.trim()) return toast.error('Enter a message');
                updateMutation.mutate(msg);
              }}
            >
              Send via WhatsApp
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Text type="secondary" style={{ fontSize: 13 }}>Sending to: {lead.whatsapp || lead.phone}</Text>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Select Update</Text>
            <Select
              style={{ width: '100%' }} value={selectedMilestone}
              onChange={(v) => { setSelectedMilestone(v); setCustomMessage(''); }}
              options={MILESTONE_MESSAGES.map((m) => ({ label: m, value: m }))}
            />
          </div>

          {selectedMilestone === 'Custom message…' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Your Message *</Text>
              <Input.TextArea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={3} placeholder="Type your custom update here…" />
            </div>
          )}

          <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Text strong style={{ fontSize: 11, color: '#389e0d', display: 'block', marginBottom: 4 }}>WhatsApp Preview</Text>
            <Text style={{ fontSize: 12, color: '#237804', whiteSpace: 'pre-line' }}>
              {`Order Update — Backero\n\n${selectedMilestone === 'Custom message…' ? (customMessage || '…') : selectedMilestone}`}
            </Text>
          </Card>
        </Space>
      </Drawer>

      {/* Stage Shift Confirmation Drawer */}
      <Drawer
        open={!!pendingStage} onClose={() => setPendingStage(null)} width={420}
        title={`Move Lead to "${pendingStage}"`}
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setPendingStage(null)}>Cancel</Button>
            <Button
              type="primary" style={{ flex: 1 }}
              loading={statusMutation.isPending}
              onClick={() => {
                if (!stageShiftReason.trim()) { toast.error('Please provide a reason'); return; }
                statusMutation.mutate(pendingStage, { onSuccess: () => setPendingStage(null) });
              }}
            >
              {`Move to ${pendingStage}`}
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Please tell us why you're shifting this lead</Text>
        <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Reason for shifting *</Text>
        <Input.TextArea value={stageShiftReason} onChange={(e) => setStageShiftReason(e.target.value)} rows={3} placeholder={`e.g. Customer confirmed interest, moving to ${pendingStage}…`} autoFocus />
      </Drawer>

      {/* Lost Reason Drawer */}
      <Drawer
        open={showLostModal} onClose={() => setShowLostModal(false)} width={420}
        title="Mark as Lost"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setShowLostModal(false)}>Cancel</Button>
            <Button
              danger type="primary" style={{ flex: 1 }}
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate(
                { status: 'Lost', lostReason, ...(lostNotes.trim() ? { notes: lostNotes.trim() } : {}) },
                { onSuccess: () => setShowLostModal(false) }
              )}
            >
              Confirm Lost
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Why is this lead being closed?</Text>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Reason *</Text>
            <Select style={{ width: '100%' }} value={lostReason} onChange={setLostReason} options={LOST_REASONS.map((r) => ({ label: r, value: r }))} />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Additional notes (optional)</Text>
            <Input.TextArea value={lostNotes} onChange={(e) => setLostNotes(e.target.value)} rows={2} placeholder="e.g. Customer chose a local vendor…" />
          </div>
        </Space>
      </Drawer>

      {/* Deal Value Drawer */}
      <Drawer
        open={showDealValueModal} onClose={() => setShowDealValueModal(false)} width={420}
        title="Confirm Deal Value"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setShowDealValueModal(false)}>Cancel</Button>
            <Button
              type="primary" style={{ flex: 1 }}
              loading={statusMutation.isPending}
              onClick={() => {
                if (!dealValueInput || Number(dealValueInput) <= 0) { toast.error('Enter a valid deal value'); return; }
                statusMutation.mutate({ status: 'Payment Pending', dealValue: Number(dealValueInput) }, { onSuccess: () => setShowDealValueModal(false) });
              }}
            >
              Confirm
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Enter the final confirmed deal amount</Text>
        <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Deal Value (₹) *</Text>
        <Input type="number" min="1" value={dealValueInput} onChange={(e) => setDealValueInput(e.target.value)} prefix="₹" placeholder="e.g. 50000" autoFocus />
        {dealValueInput && Number(dealValueInput) > 0 && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>₹{Number(dealValueInput).toLocaleString('en-IN')}</Text>
        )}
      </Drawer>

      {/* Lightbox — not a form, stays as a plain overlay */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="attachment" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Add Communication Log Drawer */}
      <Drawer
        open={showCommModal} onClose={() => setShowCommModal(false)} width={480}
        title="Add Communication Log"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setShowCommModal(false)}>Cancel</Button>
            <Button
              type="primary" style={{ flex: 1 }}
              loading={commLogMutation.isPending}
              onClick={() => {
                if (!commContent.trim() && !commImages.length) { toast.error('Add content or attach an image'); return; }
                const fd = new FormData();
                fd.append('type', commType);
                fd.append('title', commTitle);
                fd.append('content', commContent);
                if (commDate) fd.append('happenedAt', new Date(commDate).toISOString());
                commImages.forEach(f => fd.append('images', f));
                commLogMutation.mutate(fd);
              }}
            >
              Save Log
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Record a call, paste a chat, or add meeting notes</Text>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Type</Text>
              <Select
                style={{ width: '100%' }} value={commType} onChange={setCommType}
                options={[
                  { label: 'Call', value: 'call' },
                  { label: 'WhatsApp', value: 'whatsapp' },
                  { label: 'Meeting', value: 'meeting' },
                  { label: 'Email', value: 'email' },
                  { label: 'Other', value: 'other' },
                ]}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Date & Time</Text>
              <Input type="datetime-local" value={commDate} onChange={(e) => setCommDate(e.target.value)} />
            </Col>
          </Row>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Title (optional)</Text>
            <Input value={commTitle} onChange={(e) => setCommTitle(e.target.value)} placeholder="e.g. Initial call — discussed pricing" />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Content — transcript / chat / notes</Text>
            <Input.TextArea
              value={commContent} onChange={(e) => setCommContent(e.target.value)} rows={6}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder={"Paste WhatsApp chat or type call notes here…\n\n[10:32 AM] Client: We need 500 units of lip balm\n[10:34 AM] Us: Sure, let me check stock and revert…"}
              autoFocus
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Screenshots / Photos (optional)</Text>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #d9d9d9', borderRadius: 10, padding: 16, cursor: 'pointer' }}>
              <input
                type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  setCommImages(prev => [...prev, ...files]);
                  files.forEach(f => {
                    const reader = new FileReader();
                    reader.onload = ev => setCommImagePreviews(prev => [...prev, { url: ev.target.result, name: f.name }]);
                    reader.readAsDataURL(f);
                  });
                }}
              />
              <ImagePlus size={22} color="#94a3b8" style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 13 }} type="secondary">Click to attach screenshots</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>PNG, JPG up to 10MB each</Text>
            </label>
            {commImagePreviews.length > 0 && (
              <Space size={8} wrap style={{ marginTop: 8 }}>
                {commImagePreviews.map((img, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={img.url} alt={img.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #f1f5f9' }} />
                    <button
                      type="button"
                      onClick={() => { setCommImagePreviews(prev => prev.filter((_, idx) => idx !== i)); setCommImages(prev => prev.filter((_, idx) => idx !== i)); }}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </Space>
      </Drawer>

      {/* Sample Stage Drawer — collect product interest + estimated value */}
      <Drawer
        open={showSampleModal} onClose={() => setShowSampleModal(false)} width={420}
        title="Move to Sample"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setShowSampleModal(false)}>Cancel</Button>
            <Button
              type="primary" style={{ flex: 1 }}
              loading={statusMutation.isPending}
              onClick={() => {
                if (!samplePiList.length) { toast.error('Add at least one product'); return; }
                if (!sampleEstValue || Number(sampleEstValue) <= 0) { toast.error('Enter an estimated value'); return; }
                statusMutation.mutate({ status: 'Sample', productInterest: samplePiList, estimatedValue: Number(sampleEstValue) }, { onSuccess: () => setShowSampleModal(false) });
              }}
            >
              Confirm & Move to Sample
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Confirm the products and value before sending a sample</Text>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Product Interest *</Text>
            <Space size={6} wrap style={{ marginBottom: 8 }}>
              {samplePiList.map((p, i) => (
                <Tag key={i} color="blue" closable onClose={() => setSamplePiList(prev => prev.filter((_, idx) => idx !== i))}>{p}</Tag>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={samplePiInput}
                onChange={(e) => setSamplePiInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && samplePiInput.trim()) {
                    e.preventDefault();
                    const val = samplePiInput.trim().replace(/,$/, '');
                    if (val && !samplePiList.includes(val)) setSamplePiList(prev => [...prev, val]);
                    setSamplePiInput('');
                  }
                }}
                placeholder="Type product name, press Enter to add…"
                autoFocus
              />
              <Button
                icon={<Plus size={13} />}
                onClick={() => {
                  const val = samplePiInput.trim();
                  if (val && !samplePiList.includes(val)) setSamplePiList(prev => [...prev, val]);
                  setSamplePiInput('');
                }}
              >
                Add
              </Button>
            </Space.Compact>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Estimated Value (₹) *</Text>
            <Input type="number" min="1" value={sampleEstValue} onChange={(e) => setSampleEstValue(e.target.value)} prefix="₹" placeholder="e.g. 5000" />
            {sampleEstValue && Number(sampleEstValue) > 0 && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>₹{Number(sampleEstValue).toLocaleString('en-IN')}</Text>
            )}
          </div>
        </Space>
      </Drawer>

      {/* Edit Lead Drawer */}
      <Drawer
        open={editMode} onClose={() => setEditMode(false)} width={560}
        title="Edit Lead"
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setEditMode(false)}>Cancel</Button>
            <Button type="primary" style={{ flex: 1 }} loading={editMutation.isPending} onClick={handleEditSubmit(onSubmitEdit)}>Save Changes</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Row gutter={12}>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Full Name</Text><Input {...regEdit('name')} defaultValue={lead.name} /></Col>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Phone</Text><Input {...regEdit('phone')} defaultValue={lead.phone} /></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Email</Text><Input {...regEdit('email')} defaultValue={lead.email} /></Col>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Company</Text><Input {...regEdit('company')} defaultValue={lead.company} /></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>City</Text><Input {...regEdit('city')} defaultValue={lead.city} /></Col>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>State</Text><Input {...regEdit('state')} defaultValue={lead.state} /></Col>
          </Row>
          <div><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Business Type</Text><Input {...regEdit('businessType')} defaultValue={lead.businessType} placeholder="e.g. Beauty Brand" /></div>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Priority</Text>
              <Controller
                name="priority" control={editControl} defaultValue={lead.priority}
                render={({ field }) => (
                  <Select {...field} style={{ width: '100%' }} options={['low', 'medium', 'high', 'critical'].map(p => ({ label: p, value: p }))} />
                )}
              />
            </Col>
            <Col span={12}><Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Estimated Value (₹)</Text><Input {...regEdit('estimatedValue')} type="number" defaultValue={lead.estimatedValue} /></Col>
          </Row>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Assign To</Text>
            <Controller
              name="assignedTo" control={editControl} defaultValue={lead.assignedTo?._id || ''}
              render={({ field }) => (
                <Select
                  {...field} style={{ width: '100%' }}
                  options={[{ label: 'Unassigned', value: '' }, ...((usersData?.data || []).map(u => ({ label: `${u.firstName} ${u.lastName}`, value: u._id })))]}
                />
              )}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Product Interest</Text>
            <Space size={6} wrap style={{ marginBottom: 8 }}>
              {editProductInterest.map((p, i) => (
                <Tag key={i} color="blue" closable onClose={() => setEditProductInterest(prev => prev.filter((_, idx) => idx !== i))}>{p}</Tag>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={piInput}
                onChange={(e) => setPiInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && piInput.trim()) {
                    e.preventDefault();
                    const val = piInput.trim().replace(/,$/, '');
                    if (val && !editProductInterest.includes(val)) setEditProductInterest(prev => [...prev, val]);
                    setPiInput('');
                  }
                }}
                placeholder="Type product name, press Enter to add…"
              />
              <Button
                icon={<Plus size={13} />}
                onClick={() => {
                  const val = piInput.trim();
                  if (val && !editProductInterest.includes(val)) setEditProductInterest(prev => [...prev, val]);
                  setPiInput('');
                }}
              >
                Add
              </Button>
            </Space.Compact>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Notes</Text>
            <Input.TextArea {...regEdit('notes')} defaultValue={lead.notes} rows={3} />
          </div>
        </Space>
      </Drawer>
    </div>
  );
}
