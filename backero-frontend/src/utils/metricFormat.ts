// A platform that does not report a figure gives null: show "n/a", never a made-up 0%.
export const fmtPct = (v: number | null | undefined): string => (v == null ? 'n/a' : `${Number(v).toFixed(2)}%`)

export type FreshnessLevel = 'fresh' | 'stale' | 'very_stale' | 'unknown'

export interface Freshness {
  level: FreshnessLevel
  label: string
}

// How often each scraper's full panel read actually runs by design (not a bug, an owner's-call
// trade-off against detection risk) — Meesho and Flipkart deliberately read only every 4h
// (python-service/meesho/app/connector/meesho_keeper.py READ_EVERY_MIN=240; flipkart/config.yaml
// sellerhub.minutes=240), while Snapdeal's browser connector reads roughly every 15-30 min. A
// single global "stale past 2h" cutoff would permanently flag the first two as stale even when
// working exactly as intended — the threshold has to scale with each platform's real cadence.
const EXPECTED_CADENCE_HOURS: Record<string, number> = { meesho: 4, flipkart: 4, snapdeal: 0.5 }
const DEFAULT_CADENCE_HOURS = 2

// last_scraped_at is when the underlying panel data actually last changed (MAX(captured_at)
// across the scraper's own tables) — not syncedAt, which the watchdog bumps every ~45s even
// while the scrape itself has been silently failing every cycle (e.g. an expired login session).
// That gap is exactly how Meesho/Snapdeal/Flipkart numbers went multiple days stale while the
// dashboard kept showing them as if current, with nothing anywhere flagging it.
export function scrapeFreshness(lastScrapedAt: string | null | undefined, platform?: string): Freshness {
  if (!lastScrapedAt) return { level: 'unknown', label: 'Last scrape: unknown' }
  const ageMs = Date.now() - new Date(lastScrapedAt).getTime()
  if (!Number.isFinite(ageMs)) return { level: 'unknown', label: 'Last scrape: unknown' }
  const ageHours = ageMs / 3_600_000
  const cadence = (platform && EXPECTED_CADENCE_HOURS[platform]) || DEFAULT_CADENCE_HOURS
  const label = ageHours < 1
    ? `Updated ${Math.max(1, Math.round(ageMs / 60_000))}m ago`
    : ageHours < 24
      ? `Updated ${ageHours.toFixed(1)}h ago`
      : `Updated ${(ageHours / 24).toFixed(1)}d ago`
  // 1.5x cadence buffer for jitter/scheduling slack; 24h is the outer "something's actually
  // wrong" line regardless of platform — nothing legitimately waits a full day between reads.
  if (ageHours < cadence * 1.5) return { level: 'fresh', label }
  if (ageHours < 24) return { level: 'stale', label: `Stale — ${label}` }
  return { level: 'very_stale', label: `STALE — ${label}` }
}
