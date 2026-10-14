import axios from 'axios'

// Meesho's own Flask app (port 8000) - proxied at /api/meesho/* by vite.config.ts. A real, separate app; this
// unified frontend only reads it, the same way its own dashboard does.
export const meeshoApi = axios.create({ baseURL: '/api/meesho' })

export type MeeshoOverview = {
  kpis: {
    listings: number; live: number; blocked: number; orders_7d: number; impressions_7d: number
    clicks_7d?: number; sales_7d?: number; conversion_pct_7d?: number | null; account_totals_read_at?: string
    avg_quality_score: number; avg_rating: number; open_critical_alerts: number; open_recs: number
  }
  top_issues: { id: number; severity: string; code: string; message: string; ts: string }[]
}

export type MeeshoListing = {
  id: number; catalog_id: string; name: string; category: string | null; price: number | null
  status: string; rating: number; stock: number | null; quality_score: number | null
  impressions_7d: number; orders_7d: number; ctr: number; cvr: number; open_recs: number; rag: 'green' | 'amber' | 'red'
}

export type AiInsight = { id: number; ts: string; summary: string; model: string }

export type MeeshoRobotJob = {
  id: string; label: string; what: string; every_minutes: number; enabled: boolean
  last_run: string | null; last_status: string | null; detail: string | null
}

export type MeeshoRobot = {
  state: 'healthy' | 'attention' | 'needs_you' | 'error' | 'demo' | 'manual'
  message: string; beat: string | null; started_at: string | null; mode: string
  jobs: MeeshoRobotJob[]
  runs: { finished_at: string; job: string; status: string; detail: string }[]
}

export type MeeshoRecommendation = {
  id: number; listing_id: number; listing_name: string; code: string; priority: string
  title: string; reason: string; action: string; source: string; status: string; ts: string
}

export type MeeshoAlert = {
  id: number; listing_id: number; severity: string; code: string; message: string
  acknowledged: number; sent: number; ts: string
}

export type MeeshoSourcesStatus = {
  ok: boolean; mode: string; session_exists: boolean
  last_events: { id: number; source: string; status: string; detail: string; ts: string }[]
}

export const getMeeshoOverview = () => meeshoApi.get<MeeshoOverview>('/overview').then((r) => r.data)
export const getMeeshoListings = () => meeshoApi.get<MeeshoListing[]>('/listings').then((r) => r.data)
export const getMeeshoAiInsights = () => meeshoApi.get<AiInsight[]>('/ai_insights').then((r) => r.data)
export const getMeeshoRobot = () => meeshoApi.get<MeeshoRobot>('/robot').then((r) => r.data)
export const getMeeshoRecommendations = () =>
  meeshoApi.get<MeeshoRecommendation[]>('/recommendations').then((r) => r.data)
export const markMeeshoRecommendationDone = (id: number) => meeshoApi.post(`/recommendations/${id}/done`)
export const getMeeshoAlerts = () => meeshoApi.get<MeeshoAlert[]>('/alerts').then((r) => r.data)
export const ackMeeshoAlert = (id: number) => meeshoApi.post(`/alerts/${id}/ack`)
export const getMeeshoSourcesStatus = () => meeshoApi.get<MeeshoSourcesStatus>('/sources/status').then((r) => r.data)
