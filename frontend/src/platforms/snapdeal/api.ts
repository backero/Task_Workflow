import axios from 'axios'

// Snapdeal's own FastAPI app (port 8300) - proxied at /api/snapdeal/* by vite.config.ts.
export const snapdealApi = axios.create({ baseURL: '/api/snapdeal' })

export type SnapdealOverview = {
  listings: number; live: number; oos: number
  week: { impressions: number; clicks: number; orders: number; revenue: number }
  open_alerts: Record<string, number>
  panel?: Record<string, number | string | null> | null
}

export type SnapdealListing = {
  sku: string; title: string; brand: string; price: number; mrp: number; stock: number; status: string
  rating: number; reviews: number; discount_pct: number; audit_score: number
  panel: { product_rating_pct: number | null; gross_payable: number | null; msp: number | null; orders_30d: number | null; sales_30d: number | null; bad_pct: number | null } | null
}

export type SnapdealAlert = {
  id: number; ts: string; severity: string; module: string; entity: string; code: string
  title: string; reason: string; fix: string; source: string; status: string
}

export type AiInsight = { id: number; ts: string; summary: string; model: string }

export type SnapdealRobotJob = {
  id: string; label: string; what: string; every_minutes: number
  last_run: string | null; last_status: string | null; detail: string | null
}

export type SnapdealRobot = {
  state: 'healthy' | 'attention' | 'needs_you' | 'error' | 'demo'
  message: string; beat: string | null; started_at: string | null; connector: string
  jobs: SnapdealRobotJob[]
  runs: { finished_at: string; job: string; status: string; detail: string }[]
}

export type ScorecardDay = {
  day: string; cancellation_pct: number | null; ontime_pct: number | null
  rating: number | null; dto_pct: number | null; rto_pct: number | null; dispatched_24h_pct: number | null
}
export type SnapdealHealth = { latest: ScorecardDay | null; history: ScorecardDay[] }

export type SnapdealRankRow = {
  listing_sku: string; keyword: string; position: number; page: number; day: string; title: string | null
}

export type SnapdealAdsCampaign = {
  campaign: string; sku: string; spend: number; impressions: number; clicks: number
  orders: number; revenue: number; cpc: number; acos: number; roas: number
}
export type SnapdealAdsDaily = { day: string; spend: number; revenue: number; clicks: number; orders: number }
export type SnapdealAds = {
  summary: { spend: number; impressions: number; clicks: number; orders: number; revenue: number; cpc: number; ctr: number; cvr: number; acos: number; roas: number }
  campaigns: SnapdealAdsCampaign[]; daily: SnapdealAdsDaily[]
}

export type SnapdealSettlement = { ref: string; date: string; amount: number; transactions: number; captured_at: string }
export type SnapdealPayments = { settlements: SnapdealSettlement[] }

export const getSnapdealOverview = () => snapdealApi.get<SnapdealOverview>('/overview').then((r) => r.data)
export const getSnapdealListings = () => snapdealApi.get<SnapdealListing[]>('/listings').then((r) => r.data)
export const getSnapdealAlerts = (status = 'open') => snapdealApi.get<SnapdealAlert[]>('/alerts', { params: { status } }).then((r) => r.data)
export const resolveSnapdealAlert = (id: number) => snapdealApi.post(`/alerts/${id}/resolve`)
export const getSnapdealAiInsights = () => snapdealApi.get<AiInsight[]>('/ai_insights').then((r) => r.data)
export const getSnapdealRobot = () => snapdealApi.get<SnapdealRobot>('/robot').then((r) => r.data)
export const getSnapdealHealth = () => snapdealApi.get<SnapdealHealth>('/health').then((r) => r.data)
export const getSnapdealRanks = () => snapdealApi.get<SnapdealRankRow[]>('/ranks').then((r) => r.data)
export const getSnapdealAds = () => snapdealApi.get<SnapdealAds>('/ads').then((r) => r.data)
export const getSnapdealPayments = () => snapdealApi.get<SnapdealPayments>('/payments').then((r) => r.data)
