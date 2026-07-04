import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeftIcon, PhoneIcon, EnvelopeIcon, BuildingOfficeIcon,
  MapPinIcon, CurrencyRupeeIcon, UserIcon, CalendarDaysIcon,
  ClockIcon, CheckCircleIcon, PencilIcon, XMarkIcon, ChatBubbleLeftIcon,
  QuestionMarkCircleIcon, PaperAirplaneIcon,
  ClipboardDocumentListIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { clsx } from 'clsx';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';

const FOLLOWUP_ICONS = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', demo: '🖥️', other: '📝' };

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'Sample', 'In Progress', 'Ready to Dispatch', 'Dispatched', 'Payment Pending', 'Lost'];
const LOST_REASONS = ['Price too high', 'Chose competitor', 'No budget', 'No response / Ghosted', 'Timeline mismatch', 'Product not suitable', 'Changed requirements', 'Other'];

const STAGE_BADGE = {
  'New Lead': 'bg-gray-100 text-gray-700',
  'Contacted': 'bg-blue-100 text-blue-700',
  'Interested': 'bg-indigo-100 text-indigo-700',
  'Follow-up': 'bg-yellow-100 text-yellow-700',
  'Proposal Sent': 'bg-orange-100 text-orange-700',
  'Negotiation': 'bg-purple-100 text-purple-700',
  'Query Pending': 'bg-amber-100 text-amber-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Ready to Dispatch': 'bg-violet-100 text-violet-700',
  'Dispatched': 'bg-indigo-100 text-indigo-700',
  'Payment Pending': 'bg-green-100 text-green-700',
  'Lost': 'bg-red-100 text-red-700',
};

const URGENCY_OPTIONS = ['low', 'medium', 'high'];

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

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'];

export default function LeadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editProductInterest, setEditProductInterest] = useState([]);
  const [piInput, setPiInput] = useState('');

  const { register: regFollowUp, handleSubmit: handleFollowUpSubmit, reset: resetFollowUp, formState: { errors: fuErrors } } = useForm();
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm();
  const { register: regQuery, handleSubmit: handleQuerySubmit, reset: resetQuery } = useForm();
  const [queryMode, setQueryMode] = useState(false);
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

  const followUpMutation = useMutation({
    mutationFn: (data) => api.post(`/crm/leads/${id}/followup`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Follow-up logged');
      resetFollowUp();
    },
    onError: () => toast.error('Failed to save follow-up'),
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

  const queryMutation = useMutation({
    mutationFn: (data) => api.post(`/crm/leads/${id}/query`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      qc.invalidateQueries({ queryKey: ['crm', 'lead', id, 'queries'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Query raised — Production team has been notified');
      setQueryMode(false);
      resetQuery();
    },
    onError: () => toast.error('Failed to raise query'),
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

  const onSubmitFollowUp = (data) => {
    followUpMutation.mutate({
      scheduledAt: data.scheduledAt || new Date().toISOString(),
      type: data.type || 'call',
      notes: data.notes || '',
      outcome: data.notes || '',
      nextAction: '',
    });
    if (data.nextFollowUpAt) {
      api.put(`/crm/leads/${id}`, { nextFollowUpAt: data.nextFollowUpAt }).then(() => {
        qc.invalidateQueries({ queryKey: ['crm', 'lead', id] });
      }).catch(() => {});
    }
  };

  const onSubmitEdit = (data) => {
    editMutation.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      city: data.city,
      state: data.state,
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
        <p className="text-gray-500">Lead not found</p>
        <button onClick={() => navigate('/crm/pipeline')} className="btn-secondary mt-4">Back to Pipeline</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/crm/pipeline')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d] flex-shrink-0 mt-1"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title mb-0">{lead.name}</h1>
            <span className={clsx('text-sm px-3 py-1 rounded-full font-medium', STAGE_BADGE[lead.status] || 'bg-gray-100 text-gray-700')}>
              {lead.status}
            </span>
            <button
              onClick={() => { setEditMode(true); resetEdit(lead); setEditProductInterest(lead?.productInterest || []); setPiInput(''); }}
              className="btn-secondary gap-1.5 text-sm"
            >
              <PencilIcon className="w-4 h-4" /> Edit
            </button>
            {lead.isConverted ? (
              <button
                onClick={() => navigate(`/workflow/${lead.convertedToTask?._id || ''}`)}
                className="btn-secondary gap-1.5 text-sm text-green-700 border-green-300 bg-green-50 hover:bg-green-100"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" /> View Project
              </button>
            ) : (lead.status === 'Payment Pending' || lead.status === 'In Progress') ? (
              <button
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
                className="btn-primary gap-1.5 text-sm"
              >
                <ClipboardDocumentListIcon className="w-4 h-4" /> Convert to Project
              </button>
            ) : null}
            {(lead.status === 'Payment Pending' || lead.status === 'Dispatched') && (
              <button
                onClick={() => navigate(`/finance/invoices?fromLead=${lead._id}`)}
                className="btn-secondary gap-1.5 text-sm text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/20"
              >
                <DocumentTextIcon className="w-4 h-4" /> Create Invoice
              </button>
            )}
            <button
              onClick={() => setUpdateMode(true)}
              className="btn-secondary gap-1.5 text-sm text-green-700 border-green-300 hover:bg-green-50"
            >
              <PaperAirplaneIcon className="w-4 h-4" /> Send Update
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Added {format(new Date(lead.createdAt), 'dd MMM yyyy')}
            {lead.source && ` • ${lead.source}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info + pipeline */}
        <div className="lg:col-span-2 space-y-6">

          {/* Pipeline stage mover */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline Stage</p>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_STAGES.map((stage, idx) => (
                <button
                  key={stage}
                  onClick={() => {
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
                  disabled={statusMutation.isPending}
                  className={clsx(
                    'text-sm px-3 py-1.5 rounded-full font-medium transition-all border-2 flex items-center gap-1.5',
                    lead.status === stage
                      ? 'border-brand-500 ' + STAGE_BADGE[stage] + ' ring-2 ring-brand-200 ring-offset-1'
                      : 'border-transparent ' + (STAGE_BADGE[stage] || 'bg-gray-100 text-gray-700') + ' opacity-60 hover:opacity-100 hover:border-gray-300'
                  )}
                >
                  {lead.status === stage && <CheckCircleIcon className="w-3.5 h-3.5" />}
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {/* Contact details */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Contact Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Phone</p>
                <div className="flex items-center gap-2">
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white hover:text-green-600 transition-colors">
                    <PhoneIcon className="w-4 h-4 text-gray-400" />
                    {lead.phone}
                  </a>
                  <a
                    href={`https://wa.me/91${lead.phone?.replace(/\D/g, '').slice(-10)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <ChatBubbleLeftIcon className="w-3.5 h-3.5" /> WA
                  </a>
                </div>
              </div>

              {lead.email && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 transition-colors">
                    <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                    {lead.email}
                  </a>
                </div>
              )}

              {lead.company && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Company</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                    {lead.company}
                    {lead.designation && <span className="text-gray-400 font-normal">({lead.designation})</span>}
                  </div>
                </div>
              )}

              {(lead.city || lead.state) && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Location</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <MapPinIcon className="w-4 h-4 text-gray-400" />
                    {[lead.city, lead.state].filter(Boolean).join(', ')}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-400 mb-1">Priority</p>
                <span className={clsx(
                  'text-xs px-2 py-1 rounded-full font-medium',
                  lead.priority === 'critical' ? 'bg-red-100 text-red-700' :
                  lead.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                  lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                )}>
                  {lead.priority}
                </span>
              </div>

              {lead.estimatedValue > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Estimated Value</p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-green-600">
                    <CurrencyRupeeIcon className="w-4 h-4" />
                    {lead.estimatedValue.toLocaleString('en-IN')}
                  </div>
                </div>
              )}

              {lead.assignedTo && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Assigned To</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                      {lead.assignedTo.firstName?.[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {lead.assignedTo.firstName} {lead.assignedTo.lastName}
                    </span>
                  </div>
                </div>
              )}

              {lead.nextFollowUpAt && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Next Follow-Up</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                    <CalendarDaysIcon className="w-4 h-4" />
                    {format(new Date(lead.nextFollowUpAt), 'dd MMM yyyy, h:mm a')}
                  </div>
                </div>
              )}
            </div>

            {lead.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#1b2e4a]">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </div>

        </div>

        {/* Right column: Activity Timeline */}
        <div className="space-y-4">
          <div className="card p-5">
            {/* Build unified timeline */}
            {(() => {
              const events = [];

              // Stage transitions
              (lead.stageHistory || []).forEach((h) => {
                events.push({
                  type: 'stage',
                  ts: new Date(h.enteredAt),
                  stage: h.stage,
                  movedBy: h.movedBy,
                  exitedAt: h.exitedAt,
                });
              });

              // Follow-ups
              (lead.followUps || []).forEach((fu) => {
                events.push({
                  type: 'followup',
                  ts: new Date(fu.scheduledAt || fu.createdAt),
                  fuType: fu.type,
                  notes: fu.notes,
                  outcome: fu.outcome,
                  nextAction: fu.nextAction,
                  performedBy: fu.performedBy,
                  isCompleted: fu.isCompleted,
                });
              });

              // Sample team updates
              (lead.sampleDetails?.teamUpdates || []).forEach((u) => {
                events.push({
                  type: 'team_update',
                  ts: new Date(u.postedAt),
                  text: u.text,
                  postedBy: u.postedBy,
                });
              });

              // Sample client notes
              (lead.sampleDetails?.clientNotes || []).forEach((n) => {
                events.push({
                  type: 'client_note',
                  ts: new Date(n.postedAt),
                  text: n.text,
                  postedBy: n.postedBy,
                });
              });

              events.sort((a, b) => b.ts - a.ts);

              const STAGE_META_LOCAL = {
                'New Lead': { color: 'bg-slate-200 dark:bg-slate-700', dot: 'bg-slate-400', icon: '🏁' },
                'Follow-up': { color: 'bg-amber-100 dark:bg-amber-900/40', dot: 'bg-amber-400', icon: '🔄' },
                'Sample': { color: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', dot: 'bg-fuchsia-400', icon: '📦' },
                'In Progress': { color: 'bg-blue-100 dark:bg-blue-900/40', dot: 'bg-blue-500', icon: '⚙️' },
                'Ready to Dispatch': { color: 'bg-violet-100 dark:bg-violet-900/40', dot: 'bg-violet-500', icon: '✅' },
                'Dispatched': { color: 'bg-teal-100 dark:bg-teal-900/40', dot: 'bg-teal-500', icon: '🚚' },
                'Payment Pending': { color: 'bg-green-100 dark:bg-green-900/40', dot: 'bg-green-500', icon: '💰' },
                'Lost': { color: 'bg-rose-100 dark:bg-rose-900/40', dot: 'bg-rose-500', icon: '❌' },
              };

              return (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    Activity Timeline
                    {events.length > 0 && (
                      <span className="font-bold text-brand-600">({events.length})</span>
                    )}
                  </p>

                  {events.length === 0 ? (
                    <div className="text-center py-6">
                      <ClockIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400">No activity logged yet</p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {events.map((ev, idx) => {
                        const isLast = idx === events.length - 1;
                        let dotColor = 'bg-gray-300';
                        let icon = '📌';
                        let title = '';
                        let subtitle = '';
                        let badge = null;

                        if (ev.type === 'stage') {
                          const m = STAGE_META_LOCAL[ev.stage] || { dot: 'bg-gray-300', icon: '🔀' };
                          dotColor = m.dot;
                          icon = m.icon;
                          title = `Moved to ${ev.stage === 'In Progress' ? 'Production' : ev.stage}`;
                          if (ev.movedBy?.firstName) subtitle = `by ${ev.movedBy.firstName} ${ev.movedBy.lastName || ''}`;
                          if (ev.exitedAt) {
                            const mins = Math.round((new Date(ev.exitedAt) - ev.ts) / 60000);
                            const hrs = Math.round(mins / 60);
                            const days = Math.round(hrs / 24);
                            const spent = days > 1 ? `${days}d` : hrs > 1 ? `${hrs}h` : `${mins}m`;
                            badge = <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-[#132035] text-gray-400 font-mono">{spent}</span>;
                          }
                        } else if (ev.type === 'followup') {
                          dotColor = 'bg-brand-500';
                          icon = FOLLOWUP_ICONS[ev.fuType] || '📝';
                          title = `Follow-up: ${ev.fuType}`;
                          subtitle = ev.notes || ev.outcome || '';
                          if (ev.performedBy?.firstName) subtitle = `${subtitle ? subtitle + ' · ' : ''}by ${ev.performedBy.firstName}`;
                          badge = ev.isCompleted
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">done</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">pending</span>;
                        } else if (ev.type === 'team_update') {
                          dotColor = 'bg-blue-400';
                          icon = '🔧';
                          title = 'Team Update';
                          subtitle = ev.text;
                          if (ev.postedBy?.firstName) subtitle = `${subtitle} · by ${ev.postedBy.firstName}`;
                        } else if (ev.type === 'client_note') {
                          dotColor = 'bg-fuchsia-400';
                          icon = '💬';
                          title = 'Client Note';
                          subtitle = ev.text;
                          if (ev.postedBy?.firstName) subtitle = `${subtitle} · by ${ev.postedBy.firstName}`;
                        }

                        return (
                          <div key={idx} className="flex gap-3">
                            <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                              <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-sm', 'bg-gray-100 dark:bg-[#0f1a2e] border-2', dotColor.replace('bg-', 'border-'))}>
                                <span>{icon}</span>
                              </div>
                              {!isLast && <div className="w-0.5 flex-1 bg-gray-100 dark:bg-[#132035] my-1" />}
                            </div>
                            <div className={clsx('flex-1 min-w-0', !isLast ? 'pb-3' : 'pb-1')}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                                  {subtitle && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{subtitle}</p>}
                                </div>
                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                  {badge}
                                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                    {isValid(ev.ts) ? format(ev.ts, 'dd MMM, h:mm a') : '—'}
                                  </span>
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
          </div>

          {/* Production Queries Thread */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Technical Queries
                {leadQueries?.length > 0 && <span className="ml-2 text-amber-600">({leadQueries.length})</span>}
              </p>
              <button
                onClick={() => setQueryMode(true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium flex items-center gap-1 transition-colors"
              >
                <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
                Raise Query
              </button>
            </div>

            {!leadQueries?.length ? (
              <div className="text-center py-6">
                <QuestionMarkCircleIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No queries raised yet</p>
                <p className="text-xs text-gray-300 mt-1">Use "Raise Query" to ask Production team a technical question</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leadQueries.map(q => (
                  <div key={q._id} className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] overflow-hidden">
                    {/* Question bubble */}
                    <div className="bg-gray-50 dark:bg-[#0f1a2e] p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-amber-700 dark:text-amber-400 text-xs font-bold">
                            {q.raisedBy?.firstName?.[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {q.raisedBy?.firstName} {q.raisedBy?.lastName}
                            </span>
                            <span className="text-xs text-gray-400">{format(new Date(q.createdAt), 'dd MMM, h:mm a')}</span>
                            <span className={clsx(
                              'text-xs px-1.5 py-0.5 rounded-full font-medium',
                              q.urgency === 'high' ? 'bg-red-100 text-red-600' :
                              q.urgency === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                            )}>
                              {q.urgency}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{q.title}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{q.description}</p>
                          {q.assignedTo && (
                            <p className="text-xs text-blue-500 mt-1">
                              Assigned to: <span className="font-medium">{q.assignedTo.firstName} {q.assignedTo.lastName}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Answer bubble */}
                    {q.status === 'answered' && q.answer ? (
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 border-t border-green-100 dark:border-green-800">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-green-700 dark:text-green-400 text-xs font-bold">
                              {q.answeredBy?.firstName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                                {q.answeredBy?.firstName} {q.answeredBy?.lastName}
                              </span>
                              {q.answeredAt && (
                                <span className="text-xs text-gray-400">{format(new Date(q.answeredAt), 'dd MMM, h:mm a')}</span>
                              )}
                            </div>
                            <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{q.answer}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 py-2 border-t border-gray-100 dark:border-[#1b2e4a] flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <p className="text-xs text-gray-400 italic">Waiting for Production reply…</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Communication History */}
          <div className="card p-5" data-section="comm-log">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Communication History
                {lead.communicationLogs?.length > 0 && (
                  <span className="ml-2 text-blue-500">({lead.communicationLogs.length})</span>
                )}
              </p>
              <button
                onClick={() => { setCommType('call'); setCommTitle(''); setCommContent(''); setCommDate(''); setCommImages([]); setCommImagePreviews([]); setShowCommModal(true); }}
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-medium flex items-center gap-1 transition-colors"
              >
                + Add Log
              </button>
            </div>
            {!lead.communicationLogs?.length ? (
              <div className="text-center py-6">
                <ChatBubbleLeftIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No communication logs yet</p>
                <p className="text-xs text-gray-300 mt-1">Add call transcripts, WhatsApp chats, or meeting notes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...lead.communicationLogs].sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt)).map((log, i) => {
                  const TYPE_ICON = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', other: '📝' };
                  const TYPE_COLOR = { call: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', whatsapp: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', meeting: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', email: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' };
                  return (
                    <div key={log._id || i} className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-3.5">
                      <div className="flex items-start gap-2.5 mb-2">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0', TYPE_COLOR[log.type] || TYPE_COLOR.other)}>
                          {TYPE_ICON[log.type]} {log.type === 'whatsapp' ? 'WhatsApp' : log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                        </span>
                        <div className="flex-1 min-w-0">
                          {log.title && <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{log.title}</p>}
                          <p className="text-xs text-gray-400">{format(new Date(log.happenedAt), 'dd MMM yyyy, h:mm a')}{log.addedBy?.firstName && ` · ${log.addedBy.firstName}`}</p>
                        </div>
                      </div>
                      {log.content && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-[#0f1a2e] rounded-lg p-2.5 text-xs leading-relaxed mb-2">{log.content}</p>
                      )}
                      {log.images?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {log.images.map((img, j) => (
                            <img
                              key={j}
                              src={img.url}
                              alt={img.name || 'attachment'}
                              onClick={() => setLightboxImg(img.url)}
                              className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-[#1b2e4a] cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lead metadata */}
          <div className="card p-4 text-xs text-gray-500 space-y-1">
            <p>Created: {format(new Date(lead.createdAt), 'dd MMM yyyy')}</p>
            {lead.lastContactedAt && <p>Last contact: {format(new Date(lead.lastContactedAt), 'dd MMM yyyy')}</p>}
            {lead.convertedAt && <p className="text-green-600">Won: {format(new Date(lead.convertedAt), 'dd MMM yyyy')}</p>}
            {lead.sheetRowId && <p className="text-blue-600">Synced from Google Sheets</p>}
          </div>
        </div>
      </div>

      {/* Raise Production Query Modal */}
      {queryMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setQueryMode(false)} />
          <div className="relative card w-full max-w-lg shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Raise Technical Query</h3>
                <p className="text-sm text-gray-500 mt-0.5">Assign to a Production team member for a technical answer</p>
              </div>
              <button onClick={() => setQueryMode(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleQuerySubmit(data => queryMutation.mutate(data))} className="p-5 space-y-4">
              <div>
                <label className="label">Query Title *</label>
                <input
                  {...regQuery('title', { required: true })}
                  className="input"
                  placeholder="e.g. Formulation details for Product X"
                />
              </div>
              <div>
                <label className="label">Detailed Question *</label>
                <textarea
                  {...regQuery('description', { required: true })}
                  rows={4}
                  className="input resize-none"
                  placeholder="Describe exactly what the customer asked or what technical information you need..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Assign To *</label>
                  <select {...regQuery('assignedTo', { required: true })} className="input">
                    <option value="">Select person</option>
                    {(usersData?.data || []).map(u => (
                      <option key={u._id} value={u._id}>
                        {u.firstName} {u.lastName}{u.department ? ` (${u.department})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Urgency</label>
                  <select {...regQuery('urgency')} defaultValue="medium" className="input">
                    {URGENCY_OPTIONS.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400">The assigned person will be notified via WhatsApp and in-app.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setQueryMode(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={queryMutation.isPending} className="btn-primary flex-1 justify-center disabled:opacity-50">
                  {queryMutation.isPending ? 'Sending…' : 'Send Query'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send WhatsApp Update Modal */}
      {updateMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setUpdateMode(false)} />
          <div className="relative card w-full max-w-md shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Send WhatsApp Update</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Sending to: {lead.whatsapp || lead.phone}
                </p>
              </div>
              <button onClick={() => setUpdateMode(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Select Update</label>
                <select
                  value={selectedMilestone}
                  onChange={(e) => { setSelectedMilestone(e.target.value); setCustomMessage(''); }}
                  className="input"
                >
                  {MILESTONE_MESSAGES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {selectedMilestone === 'Custom message…' && (
                <div>
                  <label className="label">Your Message *</label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={3}
                    className="input resize-none"
                    placeholder="Type your custom update here…"
                  />
                </div>
              )}

              {/* Preview */}
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">WhatsApp Preview</p>
                <p className="text-xs text-green-800 dark:text-green-300 whitespace-pre-line">
                  {`📦 Order Update — Backero\n\n${selectedMilestone === 'Custom message…' ? (customMessage || '…') : selectedMilestone}`}
                </p>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setUpdateMode(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const msg = selectedMilestone === 'Custom message…' ? customMessage : selectedMilestone;
                    if (!msg.trim()) return toast.error('Enter a message');
                    updateMutation.mutate(msg);
                  }}
                  disabled={updateMutation.isPending}
                  className="btn-primary flex-1 justify-center gap-2 disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  {updateMutation.isPending ? 'Sending…' : 'Send via WhatsApp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage Shift Confirmation (New Lead → any other stage) */}
      {pendingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setPendingStage(null)} />
          <div className="relative card w-full max-w-md shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Move Lead to "{pendingStage}"</h3>
                <p className="text-sm text-gray-500 mt-0.5">Please tell us why you're shifting this lead</p>
              </div>
              <button onClick={() => setPendingStage(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Reason for shifting *</label>
                <textarea
                  value={stageShiftReason}
                  onChange={(e) => setStageShiftReason(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder={`e.g. Customer confirmed interest, moving to ${pendingStage}…`}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPendingStage(null)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!stageShiftReason.trim()) { toast.error('Please provide a reason'); return; }
                    statusMutation.mutate(pendingStage, {
                      onSuccess: () => setPendingStage(null),
                    });
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : `Move to ${pendingStage}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowLostModal(false)} />
          <div className="relative card w-full max-w-md shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Mark as Lost</h3>
                <p className="text-sm text-gray-500 mt-0.5">Why is this lead being closed?</p>
              </div>
              <button onClick={() => setShowLostModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Reason *</label>
                <select value={lostReason} onChange={e => setLostReason(e.target.value)} className="input">
                  {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Additional notes (optional)</label>
                <textarea value={lostNotes} onChange={e => setLostNotes(e.target.value)} rows={2} className="input resize-none" placeholder="e.g. Customer chose a local vendor…" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowLostModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    statusMutation.mutate(
                      { status: 'Lost', lostReason, ...(lostNotes.trim() ? { notes: lostNotes.trim() } : {}) },
                      { onSuccess: () => setShowLostModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm Lost'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal Value Modal (→ Payment Pending) */}
      {showDealValueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowDealValueModal(false)} />
          <div className="relative card w-full max-w-md shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Confirm Deal Value</h3>
                <p className="text-sm text-gray-500 mt-0.5">Enter the final confirmed deal amount</p>
              </div>
              <button onClick={() => setShowDealValueModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Deal Value (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    value={dealValueInput}
                    onChange={e => setDealValueInput(e.target.value)}
                    className="input pl-7"
                    placeholder="e.g. 50000"
                    autoFocus
                  />
                </div>
                {dealValueInput && Number(dealValueInput) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">₹{Number(dealValueInput).toLocaleString('en-IN')}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDealValueModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    if (!dealValueInput || Number(dealValueInput) <= 0) { toast.error('Enter a valid deal value'); return; }
                    statusMutation.mutate(
                      { status: 'Payment Pending', dealValue: Number(dealValueInput) },
                      { onSuccess: () => setShowDealValueModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="attachment" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Add Communication Log Modal */}
      {showCommModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowCommModal(false)} />
          <div className="relative card w-full max-w-lg shadow-modal max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between sticky top-0 bg-white dark:bg-[#0d1b2e] z-10">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Add Communication Log</h3>
                <p className="text-sm text-gray-500 mt-0.5">Record a call, paste a chat, or add meeting notes</p>
              </div>
              <button onClick={() => setShowCommModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select value={commType} onChange={e => setCommType(e.target.value)} className="input">
                    <option value="call">📞 Call</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="meeting">🤝 Meeting</option>
                    <option value="email">✉️ Email</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={commDate}
                    onChange={e => setCommDate(e.target.value)}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Title (optional)</label>
                <input
                  value={commTitle}
                  onChange={e => setCommTitle(e.target.value)}
                  className="input"
                  placeholder="e.g. Initial call — discussed pricing"
                />
              </div>
              <div>
                <label className="label">Content — transcript / chat / notes</label>
                <textarea
                  value={commContent}
                  onChange={e => setCommContent(e.target.value)}
                  rows={6}
                  className="input resize-none text-xs leading-relaxed font-mono"
                  placeholder={"Paste WhatsApp chat or type call notes here…\n\n[10:32 AM] Client: We need 500 units of lip balm\n[10:34 AM] Us: Sure, let me check stock and revert…"}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Screenshots / Photos (optional)</label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-[#1b2e4a] rounded-xl p-4 cursor-pointer hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files);
                      setCommImages(prev => [...prev, ...files]);
                      files.forEach(f => {
                        const reader = new FileReader();
                        reader.onload = ev => setCommImagePreviews(prev => [...prev, { url: ev.target.result, name: f.name }]);
                        reader.readAsDataURL(f);
                      });
                    }}
                  />
                  <PaperAirplaneIcon className="w-6 h-6 text-gray-400 mb-1 rotate-45" />
                  <span className="text-sm text-gray-500">Click to attach screenshots</span>
                  <span className="text-xs text-gray-400 mt-0.5">PNG, JPG up to 10MB each</span>
                </label>
                {commImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {commImagePreviews.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={img.url} alt={img.name} className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-[#1b2e4a]" />
                        <button
                          type="button"
                          onClick={() => {
                            setCommImagePreviews(prev => prev.filter((_, idx) => idx !== i));
                            setCommImages(prev => prev.filter((_, idx) => idx !== i));
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCommModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
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
                  disabled={commLogMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {commLogMutation.isPending ? 'Uploading…' : 'Save Log'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sample Stage Modal — collect product interest + estimated value */}
      {showSampleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowSampleModal(false)} />
          <div className="relative card w-full max-w-md shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Move to Sample</h3>
                <p className="text-sm text-gray-500 mt-0.5">Confirm the products and value before sending a sample</p>
              </div>
              <button onClick={() => setShowSampleModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Product Interest *</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {samplePiList.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                      {p}
                      <button type="button" onClick={() => setSamplePiList(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={samplePiInput}
                    onChange={e => setSamplePiInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && samplePiInput.trim()) {
                        e.preventDefault();
                        const val = samplePiInput.trim().replace(/,$/, '');
                        if (val && !samplePiList.includes(val)) setSamplePiList(prev => [...prev, val]);
                        setSamplePiInput('');
                      }
                    }}
                    className="input flex-1 text-sm"
                    placeholder="Type product name, press Enter to add…"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = samplePiInput.trim();
                      if (val && !samplePiList.includes(val)) setSamplePiList(prev => [...prev, val]);
                      setSamplePiInput('');
                    }}
                    className="px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-200 flex-shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Estimated Value (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    value={sampleEstValue}
                    onChange={e => setSampleEstValue(e.target.value)}
                    className="input pl-7"
                    placeholder="e.g. 5000"
                  />
                </div>
                {sampleEstValue && Number(sampleEstValue) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">₹{Number(sampleEstValue).toLocaleString('en-IN')}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowSampleModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    if (!samplePiList.length) { toast.error('Add at least one product'); return; }
                    if (!sampleEstValue || Number(sampleEstValue) <= 0) { toast.error('Enter an estimated value'); return; }
                    statusMutation.mutate(
                      { status: 'Sample', productInterest: samplePiList, estimatedValue: Number(sampleEstValue) },
                      { onSuccess: () => setShowSampleModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm & Move to Sample'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setEditMode(false)} />
          <div className="relative card w-full max-w-lg shadow-modal max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Edit Lead</h3>
              <button onClick={() => setEditMode(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit(onSubmitEdit)} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name</label>
                  <input {...regEdit('name')} defaultValue={lead.name} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input {...regEdit('phone')} defaultValue={lead.phone} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input {...regEdit('email')} defaultValue={lead.email} className="input" />
                </div>
                <div>
                  <label className="label">Company</label>
                  <input {...regEdit('company')} defaultValue={lead.company} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">City</label>
                  <input {...regEdit('city')} defaultValue={lead.city} className="input" />
                </div>
                <div>
                  <label className="label">State</label>
                  <input {...regEdit('state')} defaultValue={lead.state} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select {...regEdit('priority')} defaultValue={lead.priority} className="input">
                    {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Estimated Value (₹)</label>
                  <input {...regEdit('estimatedValue')} type="number" defaultValue={lead.estimatedValue} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Assign To</label>
                <select {...regEdit('assignedTo')} defaultValue={lead.assignedTo?._id} className="input">
                  <option value="">Unassigned</option>
                  {(usersData?.data || []).map(u => (
                    <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Product Interest</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editProductInterest.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                      {p}
                      <button type="button" onClick={() => setEditProductInterest(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={piInput}
                    onChange={e => setPiInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && piInput.trim()) {
                        e.preventDefault();
                        const val = piInput.trim().replace(/,$/, '');
                        if (val && !editProductInterest.includes(val)) setEditProductInterest(prev => [...prev, val]);
                        setPiInput('');
                      }
                    }}
                    className="input flex-1 text-sm"
                    placeholder="Type product name, press Enter to add…"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = piInput.trim();
                      if (val && !editProductInterest.includes(val)) setEditProductInterest(prev => [...prev, val]);
                      setPiInput('');
                    }}
                    className="px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-200 flex-shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea {...regEdit('notes')} defaultValue={lead.notes} rows={3} className="input resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditMode(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={editMutation.isPending} className="btn-primary flex-1 justify-center disabled:opacity-50">
                  {editMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
