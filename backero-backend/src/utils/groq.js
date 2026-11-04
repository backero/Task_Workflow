const axios = require('axios');
const FormData = require('form-data');

const GROQ_BASE = 'https://api.groq.com/openai/v1';

// Whisper-large-v3 on Groq's free/cheap tier — handles code-switched Tamil/English speech well.
async function transcribeAudio(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('file', buffer, { filename: filename || 'audio.webm', contentType: mimetype || 'application/octet-stream' });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');

  const { data } = await axios.post(`${GROQ_BASE}/audio/transcriptions`, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    maxBodyLength: Infinity,
  });
  return data.text || '';
}

const LEAD_FIELD_KEYS = [
  'name', 'company', 'designation', 'preferredName', 'language', 'bestTime',
  'phone', 'phone2', 'whatsapp', 'email', 'businessType', 'city', 'teamSize',
  'source', 'rapportNote', 'productInterest',
];

// Pulls structured lead-intake fields out of a freeform transcript (spoken conversation,
// not a form) — regex can't handle that, so we hand it to an LLM instead.
async function extractLeadFieldsFromTranscript(transcript) {
  const prompt = `You are extracting customer lead details from a transcribed sales call/voice note (may mix Tamil and English). Return ONLY a compact JSON object with any of these keys you can confidently fill: ${LEAD_FIELD_KEYS.join(', ')}. "productInterest" must be an array of strings. Omit keys you can't confidently determine — do not guess or fabricate. Transcript:\n\n${transcript}`;

  const { data } = await axios.post(`${GROQ_BASE}/chat/completions`, {
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  }, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
  });

  const raw = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }

  const fields = {};
  for (const key of LEAD_FIELD_KEYS) {
    if (parsed[key] === undefined || parsed[key] === null || parsed[key] === '') continue;
    if (key === 'productInterest' && !Array.isArray(parsed[key])) continue;
    fields[key] = parsed[key];
  }
  return fields;
}

// Produces a short human-readable summary of a call/meeting transcript for the comm-log timeline.
// Clients call in whatever language they're comfortable with (Tamil, Telugu, Hindi, English,
// or mixed) — the summary must always come back in English no matter the input language.
async function summarizeTranscript(transcript) {
  const prompt = `The following is a transcribed sales call/meeting. The speakers may be talking in Tamil, Telugu, Hindi, English, or a mix of these — whatever language it's in, translate fully. Write the summary ONLY in English, regardless of the transcript's language. Never leave any non-English words or phrases untranslated.\n\nSummarize in 2-4 concise sentences: what was discussed, any commitments made, and next steps. Do not add information that isn't in the transcript.\n\nTranscript:\n${transcript}`;

  const { data } = await axios.post(`${GROQ_BASE}/chat/completions`, {
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  }, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
  });

  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Summarises a client's WhatsApp conversation with our business number for the lead's Q&A tab.
// `chat` is plain text, one message per line: "[date time] Customer|Backero: text".
async function summarizeWhatsAppChat(chat) {
  const prompt = `The following is a WhatsApp conversation between a client and Backero (a cosmetics/skincare manufacturer; brands Treyfa and Kymarie). Messages may be in Tamil, Telugu, Hindi, English, or a mix — translate fully and write ONLY in English.\n\nWrite a short summary for the sales and production team using exactly these four headings, each followed by 1-3 short bullet points:\nClient need:\nQuestions asked:\nWhat Backero promised or sent:\nStatus and next step:\n\nUse only what is in the conversation; write "None" under a heading if nothing applies. Do not invent prices, dates or products.\n\nConversation:\n${chat}`;

  const { data } = await axios.post(`${GROQ_BASE}/chat/completions`, {
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  }, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
  });

  return data.choices?.[0]?.message?.content?.trim() || '';
}

module.exports = { transcribeAudio, extractLeadFieldsFromTranscript, summarizeTranscript, summarizeWhatsAppChat };
