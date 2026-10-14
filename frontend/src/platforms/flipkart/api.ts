import axios from 'axios'

// FK-Pulse's own FastAPI app (port 8600) - proxied at /api/flipkart/* by vite.config.ts.
export const flipkartApi = axios.create({ baseURL: '/api/flipkart' })

export type BusinessHealth = {
  impressions_7d: number; impressions_prev_7d: number
  conversion_7d_pct: number; conversion_prev_7d_pct: number
  units_7d: number; sales_7d: number; units_prev_7d: number
  buyer_returns_pct: number; pre_dispatch_cancel_pct: number; rto_pct: number
  seller_cancel_pct: number; dbd_breach_pct: number
  low_quality_listings: number; listings_scored: number
  f_assured_units_pct: number; out_of_stock_listings: number; low_stock_listings: number
}
export type Traffic = {
  impressions_30d: number; impressions_prev_30d: number
  conversion_30d_pct: number; conversion_prev_30d_pct: number
  units_30d: number; sales_30d: number; units_prev_30d: number
  impressions_from_search: number; impressions_change_pct: number
}
export type Ads = {
  range_label: string; spend: number; spend_prev: number; roi: number; roi_prev: number
  views: number; clicks: number; ctr_pct: number; units: number; cvr_pct: number
  revenue: number; wallet_balance: number; campaigns_total: number; campaigns_read: number
}
export type Orders = {
  to_accept: number; to_pack: number; to_dispatch: number; in_transit: number
  pending_service: number; completed: number; upcoming: number
}
export type Payments = { outstanding_amount: number; net_payable_negative: number }
export type AccountMetrics = {
  business_health: BusinessHealth; traffic: Traffic; ads: Ads; orders: Orders; payments: Payments
}

export type FlipkartOverview = {
  listings: number; active: number; avg_rating: number
  open_recommendations: Record<string, number>
  account_metrics: AccountMetrics & { home: Record<string, number> }
}

export type FlipkartListing = {
  fsn: string; sku: string; title: string; brand: string
  price: number; mrp: number; stock: number; status: string
  rating_avg: number | null; rating_count: number | null; review_count: number | null
  hub: { sku: string; days_on_hand: string | null; return_rate_pct: number | null; quality: string | null } | null
}

export type FlipkartRecommendation = {
  id: number; scope: string; fsn: string | null; rule_id: string; severity: string
  title: string; detail: string; status: string; created_at: string
}

export type AiInsight = { id: number; ts: string; summary: string; model: string }

export type FlipkartRobotJob = {
  id: string; label: string; what: string; every_minutes: number; enabled: boolean
  last_run: string | null; last_status: string | null; detail: string | null
  duration_s: number | null; overdue: boolean
}

export type FlipkartRobot = {
  state: 'healthy' | 'attention' | 'needs_you' | 'error' | 'demo'
  message: string; robot: string; name: string
  started_at: string | null; beat: string | null; pid: number | null
  jobs: FlipkartRobotJob[]
}

export type FlipkartAccountKpi = {
  key: string; label: string; value: number | null; threshold: number
  higher_is_better: boolean; within_threshold: boolean | null
}
export type FlipkartAccount = {
  kpis: FlipkartAccountKpi[]
  trends: { key: string; value: number; computed_at: string }[]
}

export type HubTrafficDrop = { sku: string; impressions_drop: number; units_lost: number }
export type HubAdsCampaign = { name: string; status: string; kind: string; spend: number; views: number; clicks: number; units: number; revenue: number; roi: number }
export type HubPendingOrderGroup = { sku: string; title: string; qty: number; orders: number; price_low: number; price_high: number }
export type HubListingRow = { sku: string; category: string; quality: string; rating: number | null; price: number; final_price: number; stock: number; return_rate_pct: number | null }
export type FlipkartSellerHub = {
  traffic_drops: HubTrafficDrop[]; ads_campaigns: HubAdsCampaign[]
  pending_order_groups: HubPendingOrderGroup[]; listing_rows: HubListingRow[]
}

export type FlipkartTrackedKeyword = { id: number; fsn: string; keyword: string; active: number; title: string | null }
export type FlipkartRankRow = { fsn: string; keyword: string; position: number; page: number; serp_median_price: number | null; fetched_at: string }
export type FlipkartRank = { keywords: FlipkartTrackedKeyword[]; history: FlipkartRankRow[]; latest: FlipkartRankRow[] }

export type FlipkartPriceRow = { fsn: string; title: string; price: number; serp_median_price: number; vs_median_pct: number; flag: string }
export type FlipkartPricing = {
  price_vs_median: FlipkartPriceRow[]; threshold_pct: number
  cliff: { cliff_price: number; commission_below: number; commission_above: number; reposition_target: number }
}

export type FlipkartCalendarEvent = { name: string; next_date: string; days: number; nominate_now: boolean }
export type FlipkartUsualPriceRow = { fsn: string; title: string; price: number; listed_date: string; window_ends: string; day: number; open: boolean }
export type FlipkartCalendar = { events: FlipkartCalendarEvent[]; usual_price_days: number; usual_price: FlipkartUsualPriceRow[] }

export type FlipkartReturnsBySku = { fsn: string; title: string; orders: number; rto: number; rto_rate_pct: number }
export type FlipkartReturnsByPincode = { pincode: string; rto_count: number }
export type FlipkartCodSplit = { payment_type: string; orders: number; rto: number; rto_rate_pct: number }
export type FlipkartReturns = { by_sku: FlipkartReturnsBySku[]; by_pincode: FlipkartReturnsByPincode[]; cod_split: FlipkartCodSplit[] }

export const getFlipkartOverview = () => flipkartApi.get<FlipkartOverview>('/overview').then((r) => r.data)
export const getFlipkartListings = () => flipkartApi.get<FlipkartListing[]>('/listings').then((r) => r.data)
export const getFlipkartRecommendations = () =>
  flipkartApi.get<FlipkartRecommendation[]>('/recommendations', { params: { status: 'open' } }).then((r) => r.data)
export const markFlipkartRecommendationDone = (id: number) => flipkartApi.post(`/recommendations/${id}/done`)
export const getFlipkartAiInsights = () => flipkartApi.get<AiInsight[]>('/ai_insights').then((r) => r.data)
export const getFlipkartRobot = () => flipkartApi.get<FlipkartRobot>('/robot').then((r) => r.data)
export const getFlipkartAccount = () => flipkartApi.get<FlipkartAccount>('/account').then((r) => r.data)
export const getFlipkartSellerHub = () => flipkartApi.get<FlipkartSellerHub>('/sellerhub').then((r) => r.data)
export const getFlipkartRank = () => flipkartApi.get<FlipkartRank>('/rank').then((r) => r.data)
export const getFlipkartPricing = () => flipkartApi.get<FlipkartPricing>('/pricing').then((r) => r.data)
export const getFlipkartCalendar = () => flipkartApi.get<FlipkartCalendar>('/calendar').then((r) => r.data)
export const getFlipkartReturns = () => flipkartApi.get<FlipkartReturns>('/returns').then((r) => r.data)
