// One-off backfill: imports a WhatsApp "Export Chat" .txt file (no media) into
// WaChatMessage as source:'history', so old conversations show up in the
// WhatsApp Chats page alongside live-synced messages from Bounce Guard.
//
// Usage:
//   node scripts/importWhatsAppHistory.js --file ./cro-export.txt \
//     --business 918903790400 --contact 91XXXXXXXXXX --me "Backero CRO" [--dry-run]
//
// --me must match the sender name EXACTLY as it appears in the export for our
// side of the conversation (WhatsApp shows the device owner's own saved name).
// Everything from any other sender is treated as the customer's ("in") message.
//
// Re-running with the same file is safe — messages are upserted on a stable
// synthetic id derived from (business, contact, timestamp, body), not inserted
// blindly, so duplicates are skipped rather than doubled.

require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const WaChatMessage = require('../src/models/WaChatMessage');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') { args.dryRun = true; continue; }
    if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return args;
}

const digits = (s) => (s || '').replace(/\D/g, '');

// Matches both common export line-start formats:
//   Android: "5/11/26, 14:32 - Name: message"
//   iOS:     "[5/11/26, 14:32:07] Name: message"
// Accepts 2 or 4-digit years, optional seconds, optional am/pm.
const LINE_START = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)\]?\s*[-–]?\s*([^:]+):\s(.*)$/i;

function parseTimestamp(dateStr, timeStr) {
  const [d, m, yRaw] = dateStr.split('/').map((n) => parseInt(n, 10));
  const y = yRaw < 100 ? 2000 + yRaw : yRaw;
  let hh = 0, mm = 0;
  const ampmMatch = timeStr.match(/([ap])\.?m\.?/i);
  const timePart = timeStr.replace(/\s?[ap]\.?m\.?/i, '').trim();
  const [hStr, mStr] = timePart.split(':');
  hh = parseInt(hStr, 10);
  mm = parseInt(mStr, 10);
  if (ampmMatch) {
    const isPM = ampmMatch[1].toLowerCase() === 'p';
    if (isPM && hh !== 12) hh += 12;
    if (!isPM && hh === 12) hh = 0;
  }
  // WhatsApp exports in the device's local time — assume IST (UTC+5:30), same
  // as the rest of this project's scheduling.
  return new Date(Date.UTC(y, m - 1, d, hh - 5, mm - 30));
}

const SYSTEM_LINE_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created this group/i,
  /changed the subject/i,
  /security code changed/i,
  /you deleted this message/i,
];

function parseExport(text, meName) {
  const lines = text.split(/\r?\n/);
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(LINE_START);
    if (match) {
      if (current) messages.push(current);
      const [, dateStr, timeStr, sender, body] = match;
      current = {
        sentAt: parseTimestamp(dateStr, timeStr),
        sender: sender.trim(),
        body: body.trim(),
      };
    } else if (current && line.trim()) {
      current.body += '\n' + line.trim();
    }
  }
  if (current) messages.push(current);

  return messages
    .filter((m) => !SYSTEM_LINE_PATTERNS.some((p) => p.test(m.body)))
    .map((m) => {
      const isMedia = /<media omitted>|‎image omitted|‎video omitted|‎audio omitted|‎document omitted|‎sticker omitted/i.test(m.body);
      return {
        sentAt: m.sentAt,
        direction: m.sender.toLowerCase() === meName.toLowerCase() ? 'out' : 'in',
        type: isMedia ? 'media' : 'text',
        body: isMedia ? '' : m.body,
      };
    });
}

async function main() {
  const args = parseArgs();
  if (!args.file || !args.business || !args.contact || !args.me) {
    console.error('Usage: node scripts/importWhatsAppHistory.js --file <path> --business <digits> --contact <digits> --me "<name>" [--dry-run]');
    process.exit(1);
  }

  const orgId = process.env.WA_CHATS_ORG_ID;
  if (!orgId || !mongoose.isValidObjectId(orgId)) {
    console.error('WA_CHATS_ORG_ID is not set (or invalid) in .env — cannot determine which organization to import into.');
    process.exit(1);
  }

  const text = fs.readFileSync(args.file, 'utf8');
  const business = digits(args.business);
  const contact = digits(args.contact);
  const parsed = parseExport(text, args.me);

  console.log(`Parsed ${parsed.length} messages from ${args.file}`);
  console.log(`  in:  ${parsed.filter((m) => m.direction === 'in').length}`);
  console.log(`  out: ${parsed.filter((m) => m.direction === 'out').length}`);
  if (parsed.length) {
    console.log(`  first: ${parsed[0].sentAt.toISOString()}`);
    console.log(`  last:  ${parsed[parsed.length - 1].sentAt.toISOString()}`);
  }

  if (args.dryRun) {
    console.log('\n--dry-run set, not writing to the database. Sample of first 5 parsed messages:');
    console.log(JSON.stringify(parsed.slice(0, 5), null, 2));
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let inserted = 0, skipped = 0;
  for (const m of parsed) {
    const waMessageId = 'history-' + crypto
      .createHash('sha1')
      .update(`${business}:${contact}:${m.sentAt.getTime()}:${m.body}`)
      .digest('hex');

    const res = await WaChatMessage.updateOne(
      { organizationId: orgId, waMessageId },
      {
        $setOnInsert: {
          organizationId: orgId,
          waMessageId,
          business,
          contact,
          direction: m.direction,
          type: m.type,
          body: m.body,
          sentAt: m.sentAt,
          source: 'history',
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) inserted++; else skipped++;
  }

  console.log(`\nDone. Inserted ${inserted} new messages, skipped ${skipped} already-imported duplicates.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
