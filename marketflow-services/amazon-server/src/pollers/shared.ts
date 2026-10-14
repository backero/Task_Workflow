import { sqlite } from '../db/client.js'

export type StoredCredentials = {
  refresh_token: string
  client_id?: string
  client_secret?: string
  profile_id?: string
}

export function getCredentials(source: string): StoredCredentials | null {
  const row = sqlite.prepare('SELECT credentials_json FROM connections WHERE source = ?').get(source) as
    | { credentials_json: string | null }
    | undefined
  if (!row?.credentials_json) return null
  return JSON.parse(row.credentials_json) as StoredCredentials
}

/** Merges a discovered value (e.g. the Ads API profile_id) back into stored credentials so future polls skip the lookup. */
export function patchCredentials(source: string, patch: Partial<StoredCredentials>) {
  const existing = getCredentials(source) ?? ({} as StoredCredentials)
  sqlite
    .prepare('UPDATE connections SET credentials_json = ? WHERE source = ?')
    .run(JSON.stringify({ ...existing, ...patch }), source)
}

export function setHeartbeat(source: string, status: 'healthy' | 'needs_reauth' | 'error', error?: string) {
  const now = new Date().toISOString()
  sqlite
    .prepare('UPDATE connections SET status = ?, last_seen_at = ?, last_error = ?, updated_at = ? WHERE source = ?')
    .run(status, now, error ?? null, now, source)
}

const INGEST_API_KEY = process.env.INGEST_API_KEY ?? 'mcc-demo-ingest-key'
const INTERNAL_INGEST_URL = process.env.INTERNAL_INGEST_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4000}/v1/ingest`

/**
 * Pollers push through the same /v1/ingest gateway every other collector uses
 * (Design Doc §5/§6) rather than writing to the warehouse directly — that keeps
 * schema validation, idempotency and data_quality tagging in one place regardless
 * of whether a collector runs in-process or as a separate worker later.
 */
export async function postIngest(source: string, payloadType: string, records: unknown[]) {
  if (records.length === 0) return { accepted: 0, rejected: 0 }
  const res = await fetch(INTERNAL_INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INGEST_API_KEY}` },
    body: JSON.stringify({
      source,
      marketplace: 'amazon_in',
      captured_at: new Date().toISOString(),
      payload_type: payloadType,
      records,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`ingest ${payloadType} failed (${res.status}): ${JSON.stringify(body)}`)
  return body as { accepted: number; rejected: number; errors?: string[] }
}

export function isoDateDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export function isAuthError(message: string): boolean {
  return /invalid_grant|unauthorized_client|401|invalid_client/i.test(message)
}
