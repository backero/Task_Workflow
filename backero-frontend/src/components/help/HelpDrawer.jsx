import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  XMarkIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import HELP from './HelpContent';
import { useAuthStore } from '../../store/useAuthStore';

function matchRoute(pathname) {
  if (HELP[pathname]) return HELP[pathname];

  const parts = pathname.split('/');
  if (parts.length >= 3) {
    const paramKey = Object.keys(HELP).find(k => {
      const kParts = k.split('/');
      if (kParts.length !== parts.length) return false;
      return kParts.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
    });
    if (paramKey) return HELP[paramKey];
  }

  const sorted = Object.keys(HELP).sort((a, b) => b.length - a.length);
  const prefix = sorted.find(k => !k.includes(':') && pathname.startsWith(k) && k !== '/');
  if (prefix) return HELP[prefix];

  return HELP['/'];
}

function Section({ title, steps }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {open
          ? <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <ol className="px-4 py-3 space-y-2.5 bg-white">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChatMessage({ role, content, streaming }) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          role === 'user'
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {content}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-gray-400 animate-pulse rounded-sm align-middle" />
        )}
      </div>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');

export default function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('guide');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();
  const content = matchRoute(location.pathname);
  const token = useAuthStore(s => s.token);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (open && tab === 'ask') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, tab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    const userMsg = { role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setStreaming(true);

    const assistantIdx = newHistory.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${API_BASE}/api/help/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          currentPage: content?.page,
          history: messages.slice(-10),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text: chunk, error } = JSON.parse(payload);
            if (error) throw new Error(error);
            if (chunk) {
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIdx] = {
                  role: 'assistant',
                  content: updated[assistantIdx].content + chunk,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: 'assistant',
          content: `Sorry, I couldn't get a response. ${err.message || 'Please try again.'}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Floating ? button */}
      <button
        onClick={() => setOpen(p => !p)}
        className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Help"
        aria-label="Open help"
      >
        <QuestionMarkCircleIcon className="w-6 h-6" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full z-50 w-80 bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-600 flex-shrink-0">
          <div className="flex items-center gap-2">
            <QuestionMarkCircleIcon className="w-5 h-5 text-indigo-200" />
            <div>
              <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wider">Backero Help</p>
              <h2 className="text-sm font-bold text-white">{content?.page || 'Help'}</h2>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setTab('guide')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'guide'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BookOpenIcon className="w-3.5 h-3.5" />
            Guide
          </button>
          <button
            onClick={() => setTab('ask')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'ask'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
            Ask AI
          </button>
        </div>

        {/* Guide Tab */}
        {tab === 'guide' && (
          <>
            {content?.intro && (
              <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
                <p className="text-sm text-indigo-800 leading-relaxed">{content.intro}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {content?.sections?.map((sec, i) => (
                <Section key={i} title={sec.title} steps={sec.steps} />
              ))}
              {!content?.sections?.length && (
                <p className="text-sm text-gray-400 text-center py-8">No instructions available for this page yet.</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
              <p className="text-[11px] text-gray-400 text-center">Instructions update automatically based on the page you're on.</p>
            </div>
          </>
        )}

        {/* Ask AI Tab */}
        {tab === 'ask' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <ChatBubbleLeftRightIcon className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Ask anything about Backero</p>
                    <p className="text-xs text-gray-400 mt-1">I'll help you navigate and use the platform</p>
                  </div>
                  <div className="flex flex-col gap-1.5 w-full mt-2">
                    {['How do I create a task?', 'How does approval workflow work?', 'How to import marketplace plans?'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); inputRef.current?.focus(); }}
                        className="text-xs text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 transition-colors border border-gray-100"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  streaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  rows={1}
                  disabled={streaming}
                  className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 max-h-28 overflow-y-auto"
                  style={{ lineHeight: '1.4' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || streaming}
                  className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
