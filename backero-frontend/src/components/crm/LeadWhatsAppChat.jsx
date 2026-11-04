import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';

// WhatsApp chat with one client (matched by the lead's phone / phone2 / WhatsApp
// number) plus an AI summary, shown at the top of the lead's Q&A tab. Chats come
// from Bounce Guard; see /api/wa-chats.

const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#ddd6c4] text-[#6b6155] text-xs font-semibold hover:bg-[#f1ede4] hover:border-[#8a8171] hover:text-[#1c1917] transition disabled:opacity-50 disabled:cursor-not-allowed';
const TICKS = { sent: '✓', delivered: '✓✓', read: '✓✓ read', failed: 'failed', edited: 'edited' };

export default function LeadWhatsAppChat({ leadId }) {
  const qc = useQueryClient();
  const [showChat, setShowChat] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['wa-chats', 'lead', leadId],
    queryFn: () => api.get(`/wa-chats/lead/${leadId}`).then((r) => r.data),
    enabled: !!leadId,
    retry: (count, err) => err?.response?.status !== 403 && count < 2,
    refetchInterval: 60000,
  });

  const summarize = useMutation({
    mutationFn: () => api.post(`/wa-chats/lead/${leadId}/summary`).then((r) => r.data.summary),
    onSuccess: (summary) => {
      qc.setQueryData(['wa-chats', 'lead', leadId], (old) => (old ? { ...old, summary } : old));
      toast.success('Summary updated');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not make the summary'),
  });

  const days = useMemo(() => {
    const groups = [];
    for (const m of data?.messages || []) {
      const day = format(new Date(m.sentAt), 'd MMM yyyy');
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1).items.push(m);
    }
    return groups;
  }, [data]);

  // People without chat access simply don't see this panel.
  if (error?.response?.status === 403) return null;

  const messages = data?.messages || [];
  const summary = data?.summary;
  const last = messages.at(-1);

  return (
    <div className="p-3 rounded-[10px] border-[1.5px] border-[#ddd6c4] bg-[#fbfaf7] space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-[#8a8171] uppercase tracking-wide">
          💬 WhatsApp chat {messages.length > 0 && `· ${messages.length} message${messages.length === 1 ? '' : 's'}`}
          {last && ` · last ${format(new Date(last.sentAt), 'd MMM, h:mm a')}`}
        </p>
        {messages.length > 0 && (
          <div className="flex gap-2">
            <button type="button" className={outlineBtn} disabled={summarize.isPending} onClick={() => summarize.mutate()}>
              {summarize.isPending ? '✨ Summarising…' : summary ? '✨ Refresh summary' : '✨ Summarise chat'}
            </button>
            <button type="button" className={outlineBtn} onClick={() => setShowChat((v) => !v)}>
              {showChat ? 'Hide chat' : 'Show full chat'}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-[#8a8171]">Loading WhatsApp chat…</p>
      ) : error ? (
        <p className="text-xs text-[#8a8171]">WhatsApp chat could not be loaded.</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-[#8a8171]">No WhatsApp messages with this client on our business numbers yet.</p>
      ) : (
        <>
          {summary ? (
            <div className="rounded-[8px] bg-white border border-[#e8e2d4] p-2.5">
              <p className="text-[11px] text-[#8a8171] mb-1">
                AI summary · {format(new Date(summary.generatedAt), 'd MMM, h:mm a')}
                {summary.outdated && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">new messages since — refresh</span>}
              </p>
              <div className="text-sm text-[#1c1917] whitespace-pre-wrap">{summary.text}</div>
            </div>
          ) : (
            <p className="text-xs text-[#8a8171]">Tap “Summarise chat” for a short AI summary of this conversation.</p>
          )}

          {showChat && (
            <div className="max-h-96 overflow-y-auto flex flex-col gap-1.5 pt-1">
              {days.map((g) => (
                <React.Fragment key={g.day}>
                  <p className="self-center text-[11px] text-[#8a8171] py-1">{g.day}</p>
                  {g.items.map((m) => {
                    const out = m.direction === 'out';
                    const meta = [format(new Date(m.sentAt), 'h:mm a'), out ? TICKS[m.status] : null, m.source === 'history' ? 'imported' : null].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={m.waMessageId}
                        className={clsx(
                          'max-w-[80%] px-2.5 py-1.5 rounded-[10px] text-sm whitespace-pre-wrap break-words text-[#1c1917]',
                          out ? 'self-end bg-[#dcf8c6]' : 'self-start bg-[#f1ede4]',
                          m.status === 'deleted' && 'italic opacity-70',
                        )}
                      >
                        {m.body}
                        <div className="text-[10px] text-[#8a8171] text-right mt-0.5">{meta}</div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
