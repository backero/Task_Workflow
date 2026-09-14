import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Zap, Mic, Paperclip, Square, MessageCircle, Eye, IdCard, CheckCircle2, Hand, Phone, Briefcase, Handshake, PartyPopper, UserPlus } from 'lucide-react';
import { Alert, Button, Col, Drawer, Input, Row, Select, Space, Tag, Typography } from 'antd';

const { Text, Title } = Typography;

const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Other'];
const BEST_TIMES = ['Anytime', 'Morning', 'Afternoon', 'Evening'];
const BUSINESS_TYPES = ['Beauty Brand', 'Retail Chain', 'Salon & Spa', 'Distributor', 'Startup', 'Other'];
const TEAM_SIZES = ['Just me', '2–10', '11–50', '50+'];
const SOURCES = ['Phone Call', 'WhatsApp', 'Email', 'Website', 'Referral', 'Walk-in', 'Exhibition', 'Instagram Ad', 'Google Ad', 'Other'];

const KYC_FIELDS = ['name', 'phone', 'email', 'company', 'city', 'businessType'];
function kycCompletion(lead) {
  const filled = KYC_FIELDS.filter((f) => lead[f]).length + ((lead.productInterest || []).length > 0 ? 1 : 0);
  return Math.round((filled / (KYC_FIELDS.length + 1)) * 100);
}

function Field({ label, required, children }) {
  return (
    <div>
      <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{label}{required && <Text type="danger"> *</Text>}</Text>
      {children}
    </div>
  );
}

function StepSection({ icon: Icon, title, sub, children }) {
  return (
    <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: '1px dashed #e5e7eb' }}>
      <Text strong style={{ fontSize: 14 }}><Space size={6}>{Icon && <Icon size={14} />}{title}</Space></Text>
      <div><Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text></div>
      <Row gutter={16} style={{ marginTop: 12 }}>{children}</Row>
    </div>
  );
}

// Sample Production's "➕ New Lead" / ✏️ / "➕ New KYC" wizard — replicated field-for-field
// from the "Sample Development" reference file's openKycModal()/saveKyc().
// Shared between Sample Production and the CRM Lead Pipeline so a lead card opens the
// identical form in both places. Fields map onto the real Lead schema: reference's
// "kContact" = our contact-person `name`, reference's "kName" (brand/company) = our `company`.
// Omitting `lead` switches the modal into create mode (POST instead of PUT) — same form,
// same styling, no pre-fill — used for the "➕ New Lead" / "Add Lead" buttons.
export default function EditKycModal({ lead, onClose, readOnly = false }) {
  const isCreate = !lead;
  const qc = useQueryClient();
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [kycPaste, setKycPaste] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState(lead?.intakeAudio?.transcript || '');
  const [audioAttachment, setAudioAttachment] = useState(lead?.intakeAudio || null);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [piText, setPiText] = useState((lead?.productInterest || []).join(', '));
  const [form, setForm] = useState({
    name: lead?.name || '', company: lead?.company || '', designation: lead?.designation || '', preferredName: lead?.preferredName || '',
    language: lead?.language || '', bestTime: lead?.bestTime || '',
    phone: lead?.phone || '', phone2: lead?.phone2 || '', whatsapp: lead?.whatsapp || '', email: lead?.email || '',
    businessType: lead?.businessType || '', city: lead?.city || '', teamSize: lead?.teamSize || '',
    source: lead?.source || '', rapportNote: lead?.rapportNote || '', assignedTo: lead?.assignedTo?._id || lead?.assignedTo || '',
  });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setSel = (field) => (value) => setForm((f) => ({ ...f, [field]: value || '' }));

  const [newQueryDesc, setNewQueryDesc] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});

  const { data: orgUsers } = useQuery({
    queryKey: ['users', 'org', 'all'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then((r) => r.data.data || []),
  });
  // A brand-new lead (still New Lead/Follow-up, or being created here) can only go to the two
  // intake reps who do first contact; once it's moved on, the handoff is Production-dept only.
  const isNewIntake = isCreate || !lead?.status || ['New Lead', 'Follow-up'].includes(lead.status);
  // startsWith, not includes — avoids false-positives on names that merely contain the hint
  // (e.g. "Krisnaveni" contains "naven" but isn't Naventhra).
  const INTAKE_NAME_HINTS = ['naven', 'vignesh'];
  const assignableUsers = isNewIntake
    ? (orgUsers || []).filter((u) => INTAKE_NAME_HINTS.some((h) => (u.firstName || '').toLowerCase().startsWith(h)))
    : (orgUsers || []).filter((u) => u.department === 'Production');

  const originalAssignedTo = lead?.assignedTo?._id || lead?.assignedTo || '';

  const saveKycMutation = useMutation({
    mutationFn: async (body) => {
      const res = isCreate ? await api.post('/crm/leads', body) : await api.put(`/crm/leads/${lead._id}`, body);
      // The generic update above already persists assignedTo, but only the dedicated /assign
      // endpoint sends the "you're now in charge" notification and hands off this lead's open
      // Q&A queries to the new owner — so route a real reassignment through it too, same as the
      // KYC-tab dropdown does, instead of letting it silently happen with no handoff.
      if (!isCreate && body.assignedTo !== originalAssignedTo) {
        if (body.assignedTo) await api.post(`/crm/leads/${lead._id}/assign`, { assignedTo: body.assignedTo });
        else await api.put(`/crm/leads/${lead._id}`, { assignedTo: '' });
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      if (isCreate) toast.success(`Lead created for ${form.name}`);
      else toast.success(`KYC updated for ${lead.customerId || lead.name} (${kycCompletion({ ...lead, ...form })}% complete)`);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || `Failed to ${isCreate ? 'create' : 'update'} KYC`),
  });

  const { data: queries } = useQuery({
    queryKey: ['crm', 'leads', lead?._id, 'queries'],
    queryFn: () => api.get(`/crm/leads/${lead._id}/queries`).then((r) => r.data.queries || []),
    enabled: !isCreate,
  });

  const raiseQueryMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${lead._id}/query`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', lead._id, 'queries'] });
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      setNewQueryDesc('');
      toast.success('Query added');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add query'),
  });

  const replyQueryMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', lead._id, 'queries'] });
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      setReplyDrafts((d) => ({ ...d, [vars.queryId]: '' }));
      toast.success('Reply sent');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reply'),
  });

  const extractFromPaste = () => {
    const text = kycPaste;
    if (!text.trim()) { toast.error('Paste a WhatsApp chat or ad-lead snippet first'); return; }
    const found = [];
    setForm((f) => {
      const next = { ...f };
      const phoneMatches = [...text.matchAll(/(\+?\d[\d\s-]{8,}\d)/g)].map((m) => ({
        num: m[0].replace(/\s+/g, ''),
        wa: /whatsapp/i.test(text.slice(Math.max(0, text.lastIndexOf('\n', m.index) + 1), text.indexOf('\n', m.index) === -1 ? text.length : text.indexOf('\n', m.index))),
      }));
      const waPhone = phoneMatches.find((p) => p.wa);
      const plain = phoneMatches.filter((p) => p !== waPhone);
      if (waPhone && !next.whatsapp) { next.whatsapp = waPhone.num; found.push('WhatsApp number'); }
      if (plain[0] && !next.phone) { next.phone = plain[0].num; found.push('phone'); }
      if (plain[1] && !next.phone2) { next.phone2 = plain[1].num; found.push('alternate number'); }
      if (!next.email) {
        const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (m) { next.email = m[0]; found.push('email'); }
      }
      if (!next.name) {
        let m = text.match(/(?:^|[\r\n])\s*(?:name|contact(?:\s*person)?)\s*[:\-]\s*([^\r\n]+)/i);
        if (!m) m = text.match(/(?:\bi am\b|\bthis is\b|\bi'?m\b)\s+([A-Za-z][A-Za-z .]{1,40})/i);
        if (m) { next.name = m[1].trim().replace(/[.,;:!]+$/, ''); found.push('name'); }
      }
      return next;
    });
    if (found.length) toast.success('Auto-fill found: ' + found.join(', ') + ' — please verify');
    else toast('Nothing new found (or those fields are already filled)');
  };

  const transcribeMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('audio', file, file.name || 'voice-note.webm');
      return api.post('/crm/leads/transcribe', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
    },
    onSuccess: ({ transcript, fields, audio }) => {
      setVoiceTranscript(transcript || '');
      setAudioAttachment(audio || null);
      const found = [];
      setForm((f) => {
        const next = { ...f };
        for (const [key, val] of Object.entries(fields || {})) {
          if (key === 'productInterest' || !val) continue;
          if (!next[key]) { next[key] = val; found.push(key); }
        }
        return next;
      });
      if (fields?.productInterest?.length && !piText.trim()) {
        setPiText(fields.productInterest.join(', '));
        found.push('product interest');
      }
      if (found.length) toast.success('Voice note auto-fill found: ' + found.join(', ') + ' — please verify');
      else toast('Transcribed — no clear fields found, please fill in manually');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to transcribe audio'),
  });

  const handleAudioFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast.error('Please attach an audio file'); return; }
    transcribeMutation.mutate(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        handleAudioFile(new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' }));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const QUERY_STATUS_COLOR = { answered: 'green', closed: 'default', pending: 'orange' };

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={<>{isCreate ? 'New Lead' : (lead.customerId || lead.name)}{readOnly && ' (View Only)'}</>}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          <span style={{ flex: 1 }} />
          {!readOnly && <Text type="secondary" style={{ fontSize: 11 }}>All sections on one page — scroll &amp; fill</Text>}
          {!readOnly && (
            <Button
              type="primary"
              icon={<CheckCircle2 size={14} />}
              loading={saveKycMutation.isPending}
              onClick={() => {
                if (!form.name.trim() || !form.company.trim()) { toast.error('We need at least your name and the brand/company to save the KYC'); return; }
                if (isCreate && !form.phone.trim()) { toast.error('Phone number is required to create a lead'); return; }
                const productInterest = piText.split(',').map((s) => s.trim()).filter(Boolean);
                const formWithPi = { ...form, productInterest };
                if (audioAttachment) formWithPi.intakeAudio = audioAttachment;
                const payload = isCreate ? Object.fromEntries(Object.entries(formWithPi).filter(([, v]) => v !== '')) : formWithPi;
                saveKycMutation.mutate(payload);
              }}
            >
              Save KYC
            </Button>
          )}
        </div>
      }
    >
      {readOnly && (
        <Alert
          type="info" showIcon icon={<Eye size={16} />} style={{ marginBottom: 14 }}
          message="CRM Pipeline is view-only. To edit details, log a follow-up, or raise a query, open this lead from Sample Production."
        />
      )}

      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
        <Alert
          type="warning" showIcon icon={<IdCard size={16} />} style={{ marginBottom: 14 }}
          message={isCreate ? (
            <>Customer ID is <strong>auto-assigned</strong> on save — never typed by hand. It is the golden thread across Q&amp;A, samples, formulas &amp; handoffs.</>
          ) : (
            <>Updating <strong>{lead.customerId || lead.name}</strong> — pre-filled from the existing record; the Customer ID stays unchanged. KYC completion: <strong>{kycCompletion({ ...lead, ...form, productInterest: piText.split(',').map((s) => s.trim()).filter(Boolean) })}%</strong>.</>
          )}
        />

        <div style={{ border: '1px dashed #e5e7eb', borderRadius: 10, background: '#fafafa', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setAutofillOpen((o) => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, flexWrap: 'wrap', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Zap size={14} /> Auto-fill assist
            <span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 11, flex: 1 }}>Paste a WhatsApp chat or ad-lead snippet — we'll pick out what we can. <em>Assist only — please verify.</em></span>
            <span>{autofillOpen ? '▾' : '▸'}</span>
          </button>
          {autofillOpen && (
            <div style={{ padding: '0 14px 14px' }}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Input.TextArea value={kycPaste} onChange={(e) => setKycPaste(e.target.value)} rows={3} placeholder="Paste the WhatsApp chat, website enquiry or ad-lead email here..." />
                <Button size="small" icon={<Zap size={12} />} onClick={extractFromPaste}>Extract</Button>
              </Space>
            </div>
          )}
        </div>

        <div style={{ border: '1px dashed #e5e7eb', borderRadius: 10, background: '#fafafa', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setVoiceOpen((o) => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, flexWrap: 'wrap', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Mic size={14} /> Voice-note auto-fill
            <span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 11, flex: 1 }}>Record or attach an audio file — we'll transcribe it and pick out what we can. <em>Assist only — please verify.</em></span>
            <span>{voiceOpen ? '▾' : '▸'}</span>
          </button>
          {voiceOpen && (
            <div style={{ padding: '0 14px 14px' }}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Space wrap>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleAudioFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <Button size="small" icon={<Paperclip size={12} />} disabled={transcribeMutation.isPending || isRecording} onClick={() => fileInputRef.current?.click()}>Attach audio file</Button>
                  {!isRecording ? (
                    <Button size="small" icon={<Mic size={12} />} disabled={transcribeMutation.isPending} onClick={startRecording}>Record</Button>
                  ) : (
                    <Button size="small" danger icon={<Square size={12} />} onClick={stopRecording}>Stop &amp; transcribe</Button>
                  )}
                  {transcribeMutation.isPending && <Text type="secondary" style={{ fontSize: 11 }}>Transcribing…</Text>}
                </Space>
                {audioAttachment && (
                  <div style={{ fontSize: 11, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px' }}>
                    <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{audioAttachment.name}</Text>
                    <audio controls src={audioAttachment.url} style={{ width: '100%', height: 32 }} />
                    {voiceTranscript && <p style={{ marginTop: 6, fontStyle: 'italic' }}>"{voiceTranscript}"</p>}
                  </div>
                )}
              </Space>
            </div>
          )}
        </div>

        <StepSection icon={Hand} title="Intro" sub="Just the basics — no interrogation.">
          <Col span={12}><Field label='"May I have your good name?"' required><Input value={form.name} onChange={set('name')} placeholder="Contact person" /></Field></Col>
          <Col span={12}><Field label='"Which brand/company am I speaking with?"' required><Input value={form.company} onChange={set('company')} placeholder="Brand / company name" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label='"Your role there?"'><Input value={form.designation} onChange={set('designation')} placeholder="e.g., Founder, Purchase Head" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label='"What should we call you casually?"'><Input value={form.preferredName} onChange={set('preferredName')} placeholder="e.g., Priya, Arjun bhai" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label='"Preferred language for our chats?"'><Select style={{ width: '100%' }} allowClear value={form.language || undefined} onChange={setSel('language')} placeholder="— select —" options={LANGUAGES.map((v) => ({ label: v, value: v }))} /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label='"Best time to reach you?"'><Select style={{ width: '100%' }} allowClear value={form.bestTime || undefined} onChange={setSel('bestTime')} placeholder="— select —" options={BEST_TIMES.map((v) => ({ label: v, value: v }))} /></Field></Col>
        </StepSection>

        <StepSection icon={Phone} title="Contact" sub="Only what helps us reach you — nothing more.">
          <Col span={12}><Field label="Mobile"><Input value={form.phone} onChange={set('phone')} placeholder="e.g., +91 98200 12345" /></Field></Col>
          <Col span={12}><Field label='"An alternate number, just in case?"'><Input value={form.phone2} onChange={set('phone2')} placeholder="Alternate contact number" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label='"WhatsApp, if different?"'><Input value={form.whatsapp} onChange={set('whatsapp')} placeholder="WhatsApp number" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label="Email"><Input type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" /></Field></Col>
        </StepSection>

        <StepSection icon={Briefcase} title="Work" sub="Helps us pitch at the right level.">
          <Col span={12}><Field label="Business type"><Select style={{ width: '100%' }} allowClear value={form.businessType || undefined} onChange={setSel('businessType')} placeholder="— select —" options={BUSINESS_TYPES.map((v) => ({ label: v, value: v }))} /></Field></Col>
          <Col span={12}><Field label="City"><Input value={form.city} onChange={set('city')} placeholder="e.g., Mumbai" /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}><Field label="Team size"><Select style={{ width: '100%' }} allowClear value={form.teamSize || undefined} onChange={setSel('teamSize')} placeholder="— select —" options={TEAM_SIZES.map((v) => ({ label: v, value: v }))} /></Field></Col>
          <Col span={12} style={{ marginTop: 12 }}>
            <Field label="Assigned to">
              <Select style={{ width: '100%' }} allowClear value={form.assignedTo || undefined} onChange={setSel('assignedTo')} placeholder="Unassigned"
                options={assignableUsers.map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u._id }))} />
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                {isNewIntake
                  ? 'New leads can only go to the intake reps — once shifted to Production below, that person becomes the end-to-end owner through to dispatch.'
                  : "Production-dept only from here — whoever's set becomes this client's end-to-end owner: Q&A, samples, payment, production, dispatch."}
              </Text>
            </Field>
          </Col>
          <Col span={24} style={{ marginTop: 12 }}>
            <Field label='"What product(s) are you interested in?"'>
              <Input value={piText} onChange={(e) => setPiText(e.target.value)} placeholder="e.g., Herbal Face Wash, Vitamin C Serum (comma-separated)" />
            </Field>
          </Col>
        </StepSection>

        <StepSection icon={Handshake} title="Rapport" sub="Almost done — this bit is just for rapport.">
          <Col span={12}><Field label='"How did you hear about us?"'><Select style={{ width: '100%' }} allowClear value={form.source || undefined} onChange={setSel('source')} placeholder="— select —" options={SOURCES.map((v) => ({ label: v, value: v }))} /></Field></Col>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>"Anything on your mind?" <Text type="secondary" style={{ fontWeight: 400 }}>(totally optional)</Text></Text>
            <Input.TextArea value={form.rapportNote} onChange={set('rapportNote')} rows={1} placeholder="Free note — preferences, context, anything worth remembering..." />
          </Col>
        </StepSection>

        <div>
          <Text strong style={{ fontSize: 14 }}><MessageCircle size={14} style={{ marginRight: 4 }} />Queries</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>The same Q&amp;A queries as the Queries tab — add or reply here and it updates in both places automatically.</Text></div>

          {isCreate ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Text strong style={{ fontSize: 13, display: 'block' }}>Save the KYC first</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Once this lead is saved, queries can be logged here — and they'll appear in the Queries tab too.</Text>
            </div>
          ) : (
            <>
              <Space direction="vertical" style={{ width: '100%', marginTop: 12, marginBottom: 12 }}>
                {(queries || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', width: '100%' }}>
                    <Text strong style={{ fontSize: 13 }}>No queries logged yet</Text>
                  </div>
                )}
                {(queries || []).map((q) => (
                  <div key={q._id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text strong style={{ fontSize: 13 }}>{q.title}</Text>
                      <Tag color={QUERY_STATUS_COLOR[q.status] || 'default'}>{q.status}</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{q.description}</Text>
                    {q.answer && (
                      <Text style={{ fontSize: 12, color: '#237804', background: '#f6ffed', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                        <CheckCircle2 size={12} />{q.answer}
                      </Text>
                    )}
                    {q.status === 'pending' && (
                      <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                        <Input
                          value={replyDrafts[q._id] || ''}
                          onChange={(e) => setReplyDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                          placeholder="Type a reply…"
                        />
                        <Button
                          type="primary"
                          loading={replyQueryMutation.isPending}
                          onClick={() => {
                            const answer = (replyDrafts[q._id] || '').trim();
                            if (!answer) { toast.error('Reply cannot be empty'); return; }
                            replyQueryMutation.mutate({ queryId: q._id, answer });
                          }}
                        >
                          Reply
                        </Button>
                      </Space.Compact>
                    )}
                  </div>
                ))}
              </Space>

              <div style={{ border: '1px dashed #e5e7eb', borderRadius: 10, padding: 12 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Input.TextArea value={newQueryDesc} onChange={(e) => setNewQueryDesc(e.target.value)} rows={2} placeholder="Describe the question…" />
                  <Button
                    size="small"
                    loading={raiseQueryMutation.isPending}
                    onClick={() => {
                      if (!newQueryDesc.trim()) { toast.error('Question is required'); return; }
                      raiseQueryMutation.mutate({ description: newQueryDesc.trim() });
                    }}
                  >
                    + Add query
                  </Button>
                </Space>
              </div>
            </>
          )}
        </div>
      </fieldset>
    </Drawer>
  );
}
