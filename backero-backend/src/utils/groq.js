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

module.exports = { transcribeAudio, extractLeadFieldsFromTranscript };
