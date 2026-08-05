import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';
import { FONT_IMPORT, PILL } from './SampleProduction';

const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };
const outlineBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-[13px] font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';
const successBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d7c4f] text-white text-[13px] font-semibold hover:brightness-95 transition disabled:opacity-50';
const extractBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#2e241b] text-white text-xs font-semibold hover:brightness-125 transition';
const fieldCls = 'w-full px-3.5 py-2.5 text-[13px] rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#2e241b] focus:shadow-[0_0_0_3px_rgba(46,36,27,0.08)] placeholder:text-[#968871] disabled:opacity-60 disabled:cursor-not-allowed';
const labelCls = 'text-xs font-semibold text-[#2e241b] mb-1 block';

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
      <label className={labelCls}>{label}{required && <span className="text-[#b6453a] ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function StepSection({ emoji, title, sub, children }) {
  return (
    <div className="pb-5 mb-5 border-b border-dashed border-[#d3c9b4] last:border-0 last:pb-0 last:mb-0">
      <p className="text-sm font-bold text-[#2e241b]">{emoji} {title}</p>
      <p className="text-[11px] text-[#968871] mb-3">{sub}</p>
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
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [kycPaste, setKycPaste] = useState('');
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

  const { data: productionTeam } = useQuery({
    queryKey: ['users', 'production-team'],
    queryFn: () => api.get('/users', { params: { department: 'Production', limit: 100 } }).then((r) => r.data.data || []),
  });

  const saveKycMutation = useMutation({
    mutationFn: (body) => (isCreate ? api.post('/crm/leads', body) : api.put(`/crm/leads/${lead._id}`, body)),
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full border border-[#d3c9b4] flex flex-col" style={{ maxWidth: '700px', maxHeight: '92vh' }}>
        <div className="px-6 py-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-bold text-[#2e241b]" style={displayFont}>🪪 Customer KYC — {isCreate ? 'New Lead' : (lead.customerId || lead.name)}{readOnly && ' (View Only)'}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-[10px] hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {readOnly && (
            <div className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-[#d9c08a] bg-[#f5ecd2] text-[#7a5c1e] text-[13px] font-medium px-4 py-3 mb-3.5">
              <span className="text-base leading-[1.4]">👁️</span>
              <span>CRM Pipeline is view-only. To edit details, log a follow-up, or raise a query, open this lead from <strong>Sample Production</strong>.</span>
            </div>
          )}
        <fieldset disabled={readOnly} className="contents">
          <div className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-[#a9bfcb] bg-[#dde5ea] text-[#33526b] text-[13px] font-medium px-4 py-3 mb-3.5">
            <span className="text-base leading-[1.4]">🪪</span>
            {isCreate ? (
              <span>Customer ID is <strong>auto-assigned</strong> on save — never typed by hand. It is the golden thread across Q&amp;A, samples, formulas &amp; handoffs.</span>
            ) : (
              <span>Updating <strong>{lead.customerId || lead.name}</strong> — pre-filled from the existing record; the Customer ID stays unchanged. KYC completion: <strong>{kycCompletion({ ...lead, ...form, productInterest: piText.split(',').map((s) => s.trim()).filter(Boolean) })}%</strong>.</span>
            )}
          </div>

          <div className="rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] mb-4">
            <button
              type="button"
              onClick={() => setAutofillOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-bold text-[#2e241b] flex-wrap text-left"
            >
              <span>⚡ Auto-fill assist</span>
              <span className="text-[#968871] font-normal text-[11px] flex-1">Paste a WhatsApp chat or ad-lead snippet — we'll pick out what we can. <em>Assist only — please verify.</em></span>
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
                {(productionTeam || []).map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
              </select>
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
              <label className={labelCls}>"Anything on your mind?" <span className="font-normal text-[#968871]">(totally optional)</span></label>
              <textarea value={form.rapportNote} onChange={set('rapportNote')} rows={1} placeholder="Free note — preferences, context, anything worth remembering..." className={fieldCls} />
            </div>
          </StepSection>

          <div>
            <p className="text-sm font-bold text-[#2e241b]">💬 Queries</p>
            <p className="text-[11px] text-[#968871] mb-3">The same Q&amp;A queries as the Queries tab — add or reply here and it updates in both places automatically.</p>

            {isCreate ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-1">💬</p>
                <p className="text-[13px] font-bold text-[#2e241b]">Save the KYC first</p>
                <p className="text-xs text-[#968871] mt-1">Once this lead is saved, queries can be logged here — and they'll appear in the Queries tab too.</p>
              </div>
            ) : (
            <>
            <div className="space-y-2 mb-3">
              {(queries || []).length === 0 && (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">💬</p>
                  <p className="text-[13px] font-bold text-[#2e241b]">No queries logged yet</p>
                </div>
              )}
              {(queries || []).map((q) => (
                <div key={q._id} className="rounded-[10px] border border-[#e2dac8] bg-[#f0eadd] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#2e241b]">{q.title}</p>
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                      q.status === 'answered' ? PILL.success : q.status === 'closed' ? PILL.gray : PILL.warning)}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#6d5f4c] mt-1">{q.description}</p>
                  {q.answer && <p className="text-xs text-[#3a5f3c] mt-2 bg-[#dce9d4] rounded-lg px-2 py-1.5">✓ {q.answer}</p>}
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

            <div className="rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] p-3 space-y-2">
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

        <div className="flex items-center gap-2.5 px-6 py-4 border-t border-[#e2dac8] flex-shrink-0 flex-wrap">
          <button type="button" onClick={onClose} className={outlineBtn}>{readOnly ? 'Close' : 'Cancel'}</button>
          <span className="flex-1" />
          {!readOnly && <span className="text-[11px] text-[#968871]">All sections on one page — scroll &amp; fill</span>}
          {!readOnly && (
          <button
            onClick={() => {
              if (!form.name.trim() || !form.company.trim()) { toast.error('We need at least your name and the brand/company to save the KYC'); return; }
              if (isCreate && !form.phone.trim()) { toast.error('Phone number is required to create a lead'); return; }
              const productInterest = piText.split(',').map((s) => s.trim()).filter(Boolean);
              const formWithPi = { ...form, productInterest };
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
