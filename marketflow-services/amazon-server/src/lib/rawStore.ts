import { sqlite } from '../db/client.js'

// Design Doc §5/§6: keep every payload exactly as received, and never silently drop a metric
// the warehouse has no column for — flag it, so a collector that starts sending something new
// (a new Amazon column, a typo, a renamed field) is noticed instead of vanishing.

/** Metric names each payload type maps onto real columns. */
const KNOWN_METRICS: Record<string, ReadonlySet<string>> = {
  listing_daily: new Set(['sessions', 'page_views', 'buy_box_pct', 'units_ordered', 'ordered_product_sales']),
  ads_daily: new Set(['impressions', 'clicks', 'spend', 'ad_orders', 'ad_sales']),
  price_snapshot: new Set(['price', 'coupon_deal_flag', 'bsr', 'category', 'rating', 'review_count', 'buy_box_seller']),
  keyword_rank: new Set(['organic_rank', 'sponsored_rank']),
  inventory_daily: new Set(['available', 'days_of_cover']),
  account_health: new Set([
    'at_risk', 'banner', 'ahr', 'odr_fbm_pct', 'odr_fbm_defects', 'odr_fbm_orders', 'odr_target_pct', 'odr_fba_pct', 'odr_fba_defects',
    'odr_fba_orders', 'late_dispatch_pct', 'late_dispatch_late', 'late_dispatch_orders', 'late_dispatch_target_pct', 'cancel_pct',
    'cancel_count', 'cancel_orders', 'cancel_target_pct', 'valid_tracking_pct', 'policy_issues', 'emergency_contact_verified',
  ]),
  ads_summary: new Set(['range_label', 'impressions', 'clicks', 'sales']),
  search_share: new Set(['top_n', 'organic_results', 'own_organic', 'sponsored_results', 'own_sponsored']),
  inventory_listing: new Set([
    'status', 'fulfilment', 'available', 'inbound', 'unfulfillable', 'price', 'featured_offer_price', 'sales_rank', 'sales_rank_category',
    'units_sold_30d', 'sales_30d', 'total_fees', 'fba_fee',
  ]),
}

/** Descriptive fields collectors echo into `metrics` next to the measurements — not measurements. */
const DESCRIPTIVE = new Set(['asin', 'sku', 'date', 'title', 'keyword', 'campaign_id', 'captured_at'])

const insertRaw = sqlite.prepare(`
  INSERT INTO raw_ingest (received_at, source, marketplace, payload_type, captured_at, idempotency_key, record_count, body_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const upsertUnknown = sqlite.prepare(`
  INSERT INTO unknown_metrics (payload_type, metric_key, seen_count, last_value, first_seen_at, last_seen_at)
  VALUES (?, ?, 1, ?, ?, ?)
  ON CONFLICT(payload_type, metric_key) DO UPDATE SET
    seen_count = seen_count + 1, last_value = excluded.last_value, last_seen_at = excluded.last_seen_at
`)

export function storeRawPayload(body: {
  source: string; marketplace: string; payload_type: string; captured_at: string; records: unknown[]
}, idempotencyKey: string | undefined) {
  insertRaw.run(
    new Date().toISOString(), body.source, body.marketplace, body.payload_type, body.captured_at,
    idempotencyKey ?? null, body.records.length, JSON.stringify(body),
  )
}

/** Records any metric name this payload type has no column for. Returns the names it flagged. */
export function flagUnknownMetrics(payloadType: string, metrics: Record<string, unknown>): string[] {
  const known = KNOWN_METRICS[payloadType]
  if (!known) return []
  const now = new Date().toISOString()
  const flagged: string[] = []
  for (const [key, value] of Object.entries(metrics)) {
    if (known.has(key) || DESCRIPTIVE.has(key)) continue
    upsertUnknown.run(payloadType, key, JSON.stringify(value), now, now)
    flagged.push(key)
  }
  return flagged
}
