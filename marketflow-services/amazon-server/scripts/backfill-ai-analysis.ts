import 'dotenv/config'
import { sqlite } from '../src/db/client.js'
import { analyzeAndStoreAlerts } from '../src/ai/analyze.js'

const rows = sqlite.prepare(`
  SELECT id, scope_type, scope_id, title, message, evidence_json FROM alerts WHERE status = 'open' AND ai_analysis IS NULL
`).all() as { id: string; scope_type: string; scope_id: string; title: string; message: string; evidence_json: string }[]

console.log(`backfilling ${rows.length} open alert(s)`)

await analyzeAndStoreAlerts(
  rows.map((r) => ({
    id: r.id,
    scopeType: r.scope_type as 'asin' | 'sku' | 'keyword',
    scopeId: r.scope_id,
    title: r.title,
    message: r.message,
    evidence: JSON.parse(r.evidence_json),
  })),
)

console.log('done')
