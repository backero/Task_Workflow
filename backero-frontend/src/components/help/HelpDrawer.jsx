import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Collapse, Drawer, FloatButton, Input, Tabs, Typography } from 'antd';
import {
  QuestionCircleOutlined, MessageOutlined, SendOutlined, BookOutlined,
} from '@ant-design/icons';
import HELP from './HelpContent';
import { useAuthStore } from '../../store/useAuthStore';

const { Text, Paragraph } = Typography;

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

function ChatMessage({ role, content, streaming }) {
  return (
    <div style={{ display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: 16,
          fontSize: 13,
          lineHeight: 1.5,
          background: role === 'user' ? '#a8781f' : 'rgba(15,23,42,0.06)',
          color: role === 'user' ? '#fff' : '#1c1917',
          borderBottomRightRadius: role === 'user' ? 4 : 16,
          borderBottomLeftRadius: role === 'user' ? 16 : 4,
        }}
      >
        {content}
        {streaming && (
          <span
            style={{
              display: 'inline-block', width: 6, height: 14, marginLeft: 2,
              background: 'rgba(0,0,0,0.3)', borderRadius: 2, verticalAlign: 'middle',
            }}
          />
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

  const guideItems = (content?.sections || []).map((sec, i) => ({
    key: String(i),
    label: <Text strong style={{ fontSize: 13 }}>{sec.title}</Text>,
    children: (
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
        {sec.steps.map((step, j) => (
          <li key={j} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: '50%', background: 'rgba(168,120,31,0.14)',
                color: '#a8781f', fontSize: 10, fontWeight: 700, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }}
            >
              {j + 1}
            </span>
            <Text style={{ fontSize: 13, lineHeight: 1.6 }}>{step}</Text>
          </li>
        ))}
      </ol>
    ),
  }));

  return (
    <>
      <FloatButton
        icon={<QuestionCircleOutlined />}
        type="primary"
        style={{ insetInlineEnd: 24, insetBlockEnd: 24 }}
        onClick={() => setOpen((p) => !p)}
      />

      <Drawer
        title={content?.page || 'Help'}
        open={open}
        onClose={() => setOpen(false)}
        width={340}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          centered
          style={{ padding: '0 12px' }}
          items={[
            { key: 'guide', label: <span><BookOutlined /> Guide</span> },
            { key: 'ask', label: <span><MessageOutlined /> Ask AI</span> },
          ]}
        />

        {tab === 'guide' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
            {content?.intro && (
              <Paragraph style={{ background: 'rgba(168,120,31,0.08)', padding: 12, borderRadius: 10, fontSize: 13 }}>
                {content.intro}
              </Paragraph>
            )}
            {guideItems.length > 0 ? (
              <Collapse items={guideItems} defaultActiveKey={['0']} ghost />
            ) : (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
                No instructions available for this page yet.
              </Text>
            )}
          </div>
        )}

        {tab === 'ask' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <MessageOutlined style={{ fontSize: 28, color: '#a8781f' }} />
                  <Text strong style={{ fontSize: 13 }}>Ask anything about Backero</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>I'll help you navigate and use the platform</Text>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 8 }}>
                    {['How do I create a task?', 'How does approval workflow work?', 'How to import marketplace plans?'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); inputRef.current?.focus(); }}
                        style={{
                          textAlign: 'left', fontSize: 12, padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(15,23,42,0.04)', border: '1px solid rgba(15,23,42,0.06)', cursor: 'pointer',
                        }}
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

            <div style={{ padding: 12, borderTop: '1px solid rgba(15,23,42,0.06)' }}>
              <Input.TextArea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question…"
                autoSize={{ minRows: 1, maxRows: 3 }}
                disabled={streaming}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                style={{
                  marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                  background: !input.trim() || streaming ? 'rgba(168,120,31,0.3)' : '#a8781f', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: !input.trim() || streaming ? 'not-allowed' : 'pointer',
                }}
              >
                <SendOutlined /> Send
              </button>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', textAlign: 'center', marginTop: 6 }}>
                Press Enter to send · Shift+Enter for new line
              </Text>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
