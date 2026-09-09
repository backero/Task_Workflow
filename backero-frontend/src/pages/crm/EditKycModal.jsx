import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';
import { FONT_IMPORT, PILL } from './SampleProduction';

const displayFont = { fontFamily: "'Zilla Slab', Georgia, serif" };
const bodyFont = { fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" };
const outlineBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-[1.5px] border-[#ddd6c4] text-[#6b6155] text-[13px] font-semibold hover:bg-[#f1ede4] hover:border-[#8a8171] hover:text-[#1c1917] transition';
const successBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2f6b4f] text-white text-[13px] font-semibold hover:brightness-95 transition disabled:opacity-50';
const extractBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1c1917] text-white text-xs font-semibold hover:brightness-125 transition';
const fieldCls = 'w-full px-3.5 py-2.5 text-[13px] rounded-[10px] border-[1.5px] border-[#ddd6c4] bg-[#fbfaf7] text-[#1c1917] focus:outline-none focus:border-[#1c1917] focus:shadow-[0_0_0_3px_rgba(46,36,27,0.08)] placeholder:text-[#8a8171] disabled:opacity-60 disabled:cursor-not-allowed';
const labelCls = 'text-xs font-semibold text-[#1c1917] mb-1 block';

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
      <label className={labelCls}>{label}{required && <span className="text-[#7c2b23] ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function StepSection({ emoji, title, sub, children }) {
  return (
    <div className="pb-5 mb-5 border-b border-dashed border-[#ddd6c4] last:border-0 last:pb-0 last:mb-0">
      <p className="text-sm font-bold text-[#1c1917]">{emoji} {title}</p>
      <p className="text-[11px] text-[#8a8171] mb-3">{sub}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

// Sample Production's "➕ New Lead" / ✏️ / "➕ New KYC" wizard — replicated field-for-field,
// color-for-color from the "Sample Development" reference file's openKycModal()/saveKyc().
// Shared between Sample Production and the CRM Lead Pipeline so a lead card opens the
// identical form in both places. Fields map onto the real Lead schema: reference's
// "kContact" = our contact-person `name`, reference's "kName" (brand/company) = our `company`.
// Omitting `lead` switches the modal into create mode (POST instead of PUT) — same form,
// same styling, no pre-fill — used for the "➕ New Lead" / "Add Lead" buttons.
export default function EditKycModal({ lead, onClose, readOnly = false }) {
  const isCreate = !lead;
  const qc = useQueryClient();
  const [maximized, setMaximized] = useState(false);
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

  const [newQueryDesc, setNewQueryDesc] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});

  const { data: orgUsers } = useQuery({
    queryKey: ['users', 'org', 'all'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then((r) => r.data.data || []),
  });
  // A brand-new lead (still New Lead/Follow-up, or being created here) can go to any org member
  // doing first contact; once it's moved on, the handoff is Production-dept only.
  const isNewIntake = isCreate || !lead?.status || ['New Lead', 'Follow-up'].includes(lead.status);
  const assignableUsers = isNewIntake
    ? (orgUsers || []).filter((u) => u.isActive !== false)
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
      if (isCreate) toast.success(`Lead created for ${form.name} 🎉`);
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

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center', maximized ? 'p-0' : 'p-4')} style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#1c1917]/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative bg-[#fbfaf7] shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full border border-[#ddd6c4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'rounded-2xl')}
        style={maximized ? undefined : { maxWidth: '700px', maxHeight: '92vh' }}>
        <div className={clsx('px-6 py-5 border-b border-[#e7e2d6] bg-[#f1ede4] flex items-center justify-between flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="text-base font-bold text-[#1c1917]" style={displayFont}>🪪 Customer KYC — {isCreate ? 'New Lead' : (lead.customerId || lead.name)}{readOnly && ' (View Only)'}</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-[10px] hover:bg-[#e7e2d6] flex items-center justify-center text-[#8a8171] hover:text-[#1c1917] text-base transition-colors">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="w-9 h-9 rounded-[10px] hover:bg-[#e7e2d6] flex items-center justify-center text-[#8a8171] hover:text-[#1c1917] text-lg transition-colors">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {readOnly && (
            <div className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-[#d8c391] bg-[#f3e6c8] text-[#7c5a17] text-[13px] font-medium px-4 py-3 mb-3.5">
              <span className="text-base leading-[1.4]">👁️</span>
              <span>CRM Pipeline is view-only. To edit details, log a follow-up, or raise a query, open this lead from <strong>Sample Production</strong>.</span>
            </div>
          )}
        <fieldset disabled={readOnly} className="contents">
          <div className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-[#a39c8c] bg-[#f3e6c8] text-[#a8781f] text-[13px] font-medium px-4 py-3 mb-3.5">
            <span className="text-base leading-[1.4]">🪪</span>
            {isCreate ? (
              <span>Customer ID is <strong>auto-assigned</strong> on save — never typed by hand. It is the golden thread across Q&amp;A, samples, formulas &amp; handoffs.</span>
            ) : (
              <span>Updating <strong>{lead.customerId || lead.name}</strong> — pre-filled from the existing record; the Customer ID stays unchanged. KYC completion: <strong>{kycCompletion({ ...lead, ...form, productInterest: piText.split(',').map((s) => s.trim()).filter(Boolean) })}%</strong>.</span>
            )}
          </div>

          <div className="rounded-[10px] border-[1.5px] border-dashed border-[#ddd6c4] bg-[#f1ede4] mb-4">
            <button
              type="button"
              onClick={() => setAutofillOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-bold text-[#1c1917] flex-wrap text-left"
            >
              <span>⚡ Auto-fill assist</span>
              <span className="text-[#8a8171] font-normal text-[11px] flex-1">Paste a WhatsApp chat or ad-lead snippet — we'll pick out what we can. <em>Assist only — please verify.</em></span>
              <span>{autofillOpen ? '▾' : '▸'}</span>
            </button>
            {autofillOpen && (
              <div className="px-3.5 pb-3.5 space-y-2">
                <textarea
                  value={kycPaste}
                  onChange={(e) => setKycPaste(e.target.value)}
                  rows={3}
                  placeholder="Paste the WhatsApp chat, website enquiry or ad-lead email here..."
                  className={fieldCls}
                />
                <button type="button" onClick={extractFromPaste} className={extractBtn}>⚡ Extract</button>
              </div>
            )}
          </div>

          <div className="rounded-[10px] border-[1.5px] border-dashed border-[#ddd6c4] bg-[#f1ede4] mb-4">
            <button
              type="button"
              onClick={() => setVoiceOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-bold text-[#1c1917] flex-wrap text-left"
            >
              <span>🎙️ Voice-note auto-fill</span>
              <span className="text-[#8a8171] font-normal text-[11px] flex-1">Record or attach an audio file — we'll transcribe it and pick out what we can. <em>Assist only — please verify.</em></span>
              <span>{voiceOpen ? '▾' : '▸'}</span>
            </button>
            {voiceOpen && (
              <div className="px-3.5 pb-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => { handleAudioFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={transcribeMutation.isPending || isRecording} className={outlineBtn}>
                    📎 Attach audio file
                  </button>
                  {!isRecording ? (
                    <button type="button" onClick={startRecording} disabled={transcribeMutation.isPending} className={outlineBtn}>🎙️ Record</button>
                  ) : (
                    <button type="button" onClick={stopRecording} className={clsx(outlineBtn, 'border-[#7c2b23] text-[#7c2b23]')}>⏹ Stop &amp; transcribe</button>
                  )}
                  {transcribeMutation.isPending && <span className="text-[11px] text-[#8a8171]">Transcribing…</span>}
                </div>
                {audioAttachment && (
                  <div className="text-[11px] text-[#6b6155] bg-[#fbfaf7] border border-[#e7e2d6] rounded-lg px-2.5 py-2">
                    <p className="font-semibold text-[#1c1917] mb-1">🎧 {audioAttachment.name}</p>
                    <audio controls src={audioAttachment.url} className="w-full h-8" />
                    {voiceTranscript && <p className="mt-1.5 italic">"{voiceTranscript}"</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <StepSection emoji="👋" title="Intro" sub="Just the basics — no interrogation. 😊">
            <Field label='"May I have your good name?"' required>
              <input value={form.name} onChange={set('name')} placeholder="Contact person" className={fieldCls} />
            </Field>
            <Field label='"Which brand/company am I speaking with?"' required>
              <input value={form.company} onChange={set('company')} placeholder="Brand / company name" className={fieldCls} />
            </Field>
            <Field label='"Your role there?"'>
              <input value={form.designation} onChange={set('designation')} placeholder="e.g., Founder, Purchase Head" className={fieldCls} />
            </Field>
            <Field label='"What should we call you casually?"'>
              <input value={form.preferredName} onChange={set('preferredName')} placeholder="e.g., Priya, Arjun bhai" className={fieldCls} />
            </Field>
            <Field label='"Preferred language for our chats?"'>
              <select value={form.language} onChange={set('language')} className={fieldCls}>
                <option value="">— select —</option>
                {LANGUAGES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label='"Best time to reach you?"'>
              <select value={form.bestTime} onChange={set('bestTime')} className={fieldCls}>
                <option value="">— select —</option>
                {BEST_TIMES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </StepSection>

          <StepSection emoji="📞" title="Contact" sub="Only what helps us reach you — nothing more.">
            <Field label="Mobile">
              <input value={form.phone} onChange={set('phone')} placeholder="e.g., +91 98200 12345" className={fieldCls} />
            </Field>
            <Field label='"An alternate number, just in case?"'>
              <input value={form.phone2} onChange={set('phone2')} placeholder="Alternate contact number" className={fieldCls} />
            </Field>
            <Field label='"WhatsApp, if different?"'>
              <input value={form.whatsapp} onChange={set('whatsapp')} placeholder="WhatsApp number" className={fieldCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" className={fieldCls} />
            </Field>
          </StepSection>

          <StepSection emoji="💼" title="Work" sub="Helps us pitch at the right level.">
            <Field label="Business type">
              <select value={form.businessType} onChange={set('businessType')} className={fieldCls}>
                <option value="">— select —</option>
                {BUSINESS_TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="City">
              <input value={form.city} onChange={set('city')} placeholder="e.g., Mumbai" className={fieldCls} />
            </Field>
            <Field label="Team size">
              <select value={form.teamSize} onChange={set('teamSize')} className={fieldCls}>
                <option value="">— select —</option>
                {TEAM_SIZES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Assigned to">
              <select value={form.assignedTo} onChange={set('assignedTo')} className={fieldCls}>
                <option value="">Unassigned</option>
                {assignableUsers.map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
              </select>
              <p className="text-[10px] text-[#8a8171] mt-1">
                {isNewIntake
                  ? 'Any team member can do first-contact/intake — once shifted to Production below, that person becomes the end-to-end owner through to dispatch.'
                  : 'Production-dept only from here — whoever\'s set becomes this client\'s end-to-end owner: Q&A, samples, payment, production, dispatch.'}
              </p>
            </Field>
            <div className="col-span-2">
              <label className={labelCls}>"What product(s) are you interested in?"</label>
              <input value={piText} onChange={(e) => setPiText(e.target.value)} placeholder="e.g., Herbal Face Wash, Vitamin C Serum (comma-separated)" className={fieldCls} />
            </div>
          </StepSection>

          <StepSection emoji="🤝" title="Rapport" sub="Almost done — this bit is just for rapport.">
            <Field label='"How did you hear about us?"'>
              <select value={form.source} onChange={set('source')} className={fieldCls}>
                <option value="">— select —</option>
                {SOURCES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <div>
              <label className={labelCls}>"Anything on your mind?" <span className="font-normal text-[#8a8171]">(totally optional)</span></label>
              <textarea value={form.rapportNote} onChange={set('rapportNote')} rows={1} placeholder="Free note — preferences, context, anything worth remembering..." className={fieldCls} />
            </div>
          </StepSection>

          <div>
            <p className="text-sm font-bold text-[#1c1917]">💬 Queries</p>
            <p className="text-[11px] text-[#8a8171] mb-3">The same Q&amp;A queries as the Queries tab — add or reply here and it updates in both places automatically.</p>

            {isCreate ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-1">💬</p>
                <p className="text-[13px] font-bold text-[#1c1917]">Save the KYC first</p>
                <p className="text-xs text-[#8a8171] mt-1">Once this lead is saved, queries can be logged here — and they'll appear in the Queries tab too.</p>
              </div>
            ) : (
            <>
            <div className="space-y-2 mb-3">
              {(queries || []).length === 0 && (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">💬</p>
                  <p className="text-[13px] font-bold text-[#1c1917]">No queries logged yet</p>
                </div>
              )}
              {(queries || []).map((q) => (
                <div key={q._id} className="rounded-[10px] border border-[#e7e2d6] bg-[#fbfaf7] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#1c1917]">{q.title}</p>
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                      q.status === 'answered' ? PILL.success : q.status === 'closed' ? PILL.gray : PILL.warning)}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b6155] mt-1">{q.description}</p>
                  {q.answer && <p className="text-xs text-[#2f6b4f] mt-2 bg-[#e2ece5] rounded-lg px-2 py-1.5">✓ {q.answer}</p>}
                  {q.status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <input
                        value={replyDrafts[q._id] || ''}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                        placeholder="Type a reply…"
                        className={clsx(fieldCls, 'flex-1 !py-1.5')}
                      />
                      <button
                        onClick={() => {
                          const answer = (replyDrafts[q._id] || '').trim();
                          if (!answer) { toast.error('Reply cannot be empty'); return; }
                          replyQueryMutation.mutate({ queryId: q._id, answer });
                        }}
                        disabled={replyQueryMutation.isPending}
                        className={successBtn}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-[10px] border-[1.5px] border-dashed border-[#ddd6c4] p-3 space-y-2">
              <textarea value={newQueryDesc} onChange={(e) => setNewQueryDesc(e.target.value)} rows={2} placeholder="Describe the question…" className={fieldCls} />
              <button
                type="button"
                onClick={() => {
                  if (!newQueryDesc.trim()) { toast.error('Question is required'); return; }
                  raiseQueryMutation.mutate({ description: newQueryDesc.trim() });
                }}
                disabled={raiseQueryMutation.isPending}
                className={outlineBtn}
              >
                + Add query
              </button>
            </div>
            </>
            )}
          </div>
        </fieldset>
        </div>

        <div className="flex items-center gap-2.5 px-6 py-4 border-t border-[#e7e2d6] flex-shrink-0 flex-wrap">
          <button type="button" onClick={onClose} className={outlineBtn}>{readOnly ? 'Close' : 'Cancel'}</button>
          <span className="flex-1" />
          {!readOnly && <span className="text-[11px] text-[#8a8171]">All sections on one page — scroll &amp; fill</span>}
          {!readOnly && (
          <button
            onClick={() => {
              if (!form.name.trim() || !form.company.trim()) { toast.error('We need at least your name and the brand/company to save the KYC'); return; }
              if (isCreate && !form.phone.trim()) { toast.error('Phone number is required to create a lead'); return; }
              const productInterest = piText.split(',').map((s) => s.trim()).filter(Boolean);
              const formWithPi = { ...form, productInterest };
              if (audioAttachment) formWithPi.intakeAudio = audioAttachment;
              const payload = isCreate ? Object.fromEntries(Object.entries(formWithPi).filter(([, v]) => v !== '')) : formWithPi;
              saveKycMutation.mutate(payload);
            }}
            disabled={saveKycMutation.isPending}
            className={successBtn}
          >
            {saveKycMutation.isPending ? 'Saving…' : '✅ Save KYC'}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
