# WhatsApp Chats + client chat summary (feature/whatsapp-chats, PR #2)

Hand-off notes for anyone (person or Claude Code session) continuing this work.

## What it does
- Backs up every customer chat on Backero's business WhatsApp numbers (first: the CRO line
  +91 89037 90400) inside the workflow platform.
- **WhatsApp Chats page** (`/crm/whatsapp-chats`, sidebar → Work): all chats, search, read-only.
- **Client Q&A tab** (Product Development → client → Q&A, also reached from the Q&A Inbox's
  "Open in Q&A"): a "💬 WhatsApp chat" panel at the top with that client's full conversation and
  an **AI summary** (Client need / Questions asked / What Backero promised / Status and next step).
  Chats are matched to the client by the lead's `phone`, `phone2` and `whatsapp` numbers.

## Where the chats come from (not in this repo)
```
CRO phone (WhatsApp Business app)
   └─ Meta "coexistence" (Cloud API mirror of the same number; 6-month history import once)
        └─ Bounce Guard  /opt/bounce-guard on the droplet, https://calls-157-230-47-159.sslip.io
             - POST /webhooks/meta  (Meta-signed; stores in its own SQLite)
             - queues every change in wa_outbox, posts in order, retries until accepted
        └─ THIS backend  POST /api/wa-chats/ingest  (header x-bounce-guard-secret)
```
Bounce Guard is a separate project (owner's local copy: E:\Downloads\Pictures\CRO\bounce-guard).
Do not change it from this repo.

## Files in this repo
| Area | File |
|---|---|
| Models | `backero-backend/src/models/WaChatMessage.js`, `WaChatContact.js`, `WaChatSummary.js` |
| API | `backero-backend/src/routes/waChats.routes.js` (mounted at `/api/wa-chats` in `server.js`) |
| AI summary | `summarizeWhatsAppChat()` in `backero-backend/src/utils/groq.js` (Groq, same model as call summaries) |
| Page | `backero-frontend/src/pages/crm/WhatsAppChats.jsx` (route in `App.jsx`, link in `Sidebar.jsx`) |
| Q&A panel | `backero-frontend/src/components/crm/LeadWhatsAppChat.jsx`, used in `pages/crm/SampleLeadDetail.jsx` Q&A tab |

## API
| Method | Path | Who |
|---|---|---|
| POST | `/api/wa-chats/ingest` | Bounce Guard only (`x-bounce-guard-secret`); body `{ ops: [...] }`, ops: message, status, edit, revoke, contact; idempotent |
| GET | `/api/wa-chats/threads?business=&q=` | manager+ or permission `whatsapp_chats:read` |
| GET | `/api/wa-chats/threads/:business/:contact` | same |
| GET | `/api/wa-chats/lead/:leadId` | same; messages + saved summary (`outdated` when newer messages exist) |
| POST | `/api/wa-chats/lead/:leadId/summary` | same; (re)generates the summary, needs `GROQ_API_KEY` |

All data is scoped by `organizationId`.

## Server settings (`backero-backend/.env` on the droplet)
```
BOUNCE_GUARD_SECRET=<same value as WORKFLOW_CHATS_SECRET in /opt/bounce-guard/.env>
WA_CHATS_ORG_ID=<Backero Organization _id>
GROQ_API_KEY=<already set for call summaries>
```
Until both new settings exist, `/ingest` answers 503 and Bounce Guard keeps the chats queued.

## Status (2026-11-04)
- Done: backend, page, Q&A panel, AI summary; tested against an in-memory MongoDB (access rules,
  org isolation, duplicates, edits/deletes, client matching, summary + "outdated" flag); frontend
  `npm run build` passes. Owner reviewed the page on a local demo.
- Waiting on: merge of PR #2 (merging to main auto-deploys), the two `.env` settings, and Meta
  approving the "Bounce Guard Alerts" app as a Tech Provider so the CRO number can be connected.
  Until then there are no real chats.
- Limits: WhatsApp gives at most the last 6 months of 1:1 chats at connection time (no group
  chats). Older chats would need a manual "Export chat" import (not built yet).
