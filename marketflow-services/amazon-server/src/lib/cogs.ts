// Cost of goods per SKU — the one manual input the system needs (Design Doc §8). Margin and
// breakeven-ACOS are wrong without it, and go stale as supplier prices move, so the doc asks
// for SKUs whose COGS is older than 90 days to be flagged (§12 risk register).
export const COGS_STALE_DAYS = 90

export type CogsStatus = 'missing' | 'estimate' | 'stale' | 'ok'

export function cogsStatus(cogs: number | null, updatedAt: string | null, now = Date.now()): { status: CogsStatus; age_days: number | null } {
  if (cogs == null) return { status: 'missing', age_days: null }
  // Seed data used this sentinel for a placeholder "30% of price" guess.
  if (updatedAt === 'ESTIMATE-30PCT') return { status: 'estimate', age_days: null }
  const t = updatedAt ? Date.parse(updatedAt) : NaN
  if (Number.isNaN(t)) return { status: 'stale', age_days: null }
  const age = Math.floor((now - t) / 86_400_000)
  return { status: age > COGS_STALE_DAYS ? 'stale' : 'ok', age_days: age }
}
