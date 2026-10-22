import api from './api/axios.js'

export { api }

export type DataQuality = 'api' | 'observed' | 'derived' | 'estimate'

export type Tile = {
  label: string
  unit: string
  value: number
  previous_value: number
  wow_change: number | null
  data_quality: DataQuality
  status: 'green' | 'amber' | 'red'
  no_data?: boolean
}

export type RoboHealth = {
  state: 'healthy' | 'silent' | 'needs_reauth' | 'error' | 'never'
  last_seen_at: string | null
  silent_business_minutes: number | null
  message: string | null
}

export type CommandDashboard = {
  as_of: string | null
  tiles: Tile[]
  rule_status: { red: number; amber: number }
  cogs: { total: number; missing: number; estimate: number; stale: number; ok: number }
  robo: RoboHealth
  account_health: AccountHealth | null
  ads: AdsState
}

export type AccountHealth = {
  captured_at: string
  at_risk: number
  banner: string | null
  ahr: number | null
  odr_fbm_pct: number | null; odr_fbm_defects: number | null; odr_fbm_orders: number | null; odr_target_pct: number | null
  odr_fba_pct: number | null; odr_fba_orders: number | null
  late_dispatch_pct: number | null; late_dispatch_late: number | null; late_dispatch_orders: number | null; late_dispatch_target_pct: number | null
  cancel_pct: number | null; cancel_count: number | null; cancel_orders: number | null; cancel_target_pct: number | null
  valid_tracking_pct: number | null
  policy_issues: number | null
  emergency_contact_verified: number | null
}

export type AdsState = { state: 'none' | 'active' | 'unknown'; last_checked: string | null; range_label: string | null }

export type ListingRow = {
  asin: string; sku: string | null; name: string | null; status: string | null; fulfilment: 'FBA' | 'FBM' | null
  available: number | null; inbound: number | null; price: number | null; featured_offer_price: number | null
  sales_rank: number | null; sales_rank_category: string | null; units_sold_30d: number | null; sales_30d: number | null
  total_fees: number | null; fba_fee: number | null; cogs: number | null; is_hero: number | null
  days_of_cover: number | null; featured_offer_differs: boolean
}

export type CogsStatus = 'missing' | 'estimate' | 'stale' | 'ok'

export type OwnProduct = {
  asin: string
  sku: string
  name: string
  category: string
  price: number | null
  cogs: number | null
  cogs_updated_at: string | null
  cogs_status: CogsStatus
  cogs_age_days: number | null
  is_hero: number
  fulfilment: string | null
  fee_per_unit: number | null
}

export type Product = {
  asin: string
  sku: string
  name: string
  category: string
  price: number | null
  cogs: number | null
  cogs_updated_at: string | null
  watches_asin: string | null
  is_hero: number
  is_own: number
}

export type Alert = {
  id: string
  rule_id: string
  scope_type: string
  scope_id: string
  title: string
  message: string
  suggested_action: string
  ai_analysis?: string | null
  evidence_json?: string
  evidence?: Record<string, unknown>
  severity: 'red' | 'amber'
  fired_at: string
  status: 'open' | 'snoozed' | 'dismissed' | 'applied'
}

export type Connection = {
  source: string
  status: 'not_connected' | 'healthy' | 'needs_reauth' | 'error'
  last_seen_at: string | null
  last_error: string | null
  updated_at: string | null
  has_credentials: boolean
  health: RoboHealth | null
}

export async function getCommandDashboard() {
  const { data } = await api.get<CommandDashboard>('/marketflow/v1/dashboard/command')
  return data
}

export async function getSkuScorecard(sku: string) {
  const { data } = await api.get(`/marketflow/v1/dashboard/sku/${encodeURIComponent(sku)}`)
  return data
}

export async function getKeywordBoard() {
  const { data } = await api.get('/marketflow/v1/dashboard/keywords')
  return data
}

export async function getCompetitors() {
  const { data } = await api.get<{ own_products: (Product & { review_velocity_7d: number | null })[]; competitors: (Product & { latest_snapshot: any; review_velocity_7d: number | null })[] }>(
    '/marketflow/v1/dashboard/competitors',
  )
  return data
}

export async function getRecommendations(status = 'open') {
  const { data } = await api.get<{ recommendations: Alert[] }>('/marketflow/v1/dashboard/recommendations', { params: { status } })
  return data.recommendations
}

export async function actOnRecommendation(id: string, action: 'apply' | 'snooze' | 'dismiss') {
  const { data } = await api.post(`/marketflow/v1/dashboard/recommendations/${id}/${action}`)
  return data
}

export async function getConnections() {
  const { data } = await api.get<{ connections: Connection[] }>('/marketflow/v1/connections')
  return data.connections
}

export async function saveCredentials(source: 'spapi' | 'ads_api', payload: { refresh_token: string; client_id?: string; client_secret?: string }) {
  const { data } = await api.post(`/marketflow/v1/connections/${source}/credentials`, payload)
  return data
}

export async function syncConnection(source: 'spapi' | 'ads_api') {
  const { data } = await api.post<{ ok?: boolean; skipped?: boolean; reason?: string; error?: string }>(`/marketflow/v1/connections/${source}/sync`)
  return data
}

export async function importBusinessReportCsv(csv_text: string, from_date: string, to_date: string) {
  const { data } = await api.post<{ ok?: boolean; rows_parsed?: number; accepted?: number; rejected?: number; error?: string }>(
    '/marketflow/v1/import/business-report-sku',
    { csv_text, from_date, to_date },
  )
  return data
}

export async function getProducts() {
  const { data } = await api.get<{ stale_after_days: number; fee_rate: number; shipping: number; products: OwnProduct[] }>('/marketflow/v1/products')
  return data
}

export async function saveCogs(items: { asin: string; cogs: number }[]) {
  const { data } = await api.post<{ ok: boolean; updated: number }>('/marketflow/v1/products/cogs', { items })
  return data
}

export async function getAccountOverview() {
  const { data } = await api.get<{ health: AccountHealth | null; ads: AdsState; listings_as_of: string | null; listings: ListingRow[] }>('/marketflow/v1/account/overview')
  return data
}

export type TrackedKeyword = { id: number; keyword: string; is_hero_target: number }
export type TrackedCompetitor = { asin: string; name: string; watches_asin: string | null; watches_name: string | null }

export async function getTracking() {
  const { data } = await api.get<{ keywords: TrackedKeyword[]; competitors: TrackedCompetitor[]; own_products: { asin: string; name: string }[] }>('/marketflow/v1/tracking')
  return data
}
export async function addKeyword(keyword: string, is_hero_target: boolean) {
  const { data } = await api.post<{ ok: boolean; added: boolean }>('/marketflow/v1/tracking/keywords', { keyword, is_hero_target })
  return data
}
export async function setKeywordHero(id: number, is_hero_target: boolean) {
  await api.put('/marketflow/v1/tracking/keywords/' + id, { is_hero_target })
}
export async function removeKeyword(id: number) {
  await api.delete('/marketflow/v1/tracking/keywords/' + id)
}
export async function addCompetitor(asin: string, watches_asin: string, name?: string) {
  const { data } = await api.post<{ ok: boolean }>('/marketflow/v1/tracking/competitors', { asin, watches_asin, name: name || undefined })
  return data
}
export async function removeCompetitor(asin: string) {
  await api.delete('/marketflow/v1/tracking/competitors/' + asin)
}

// Amazon Robo
export type RobotState = 'healthy' | 'attention' | 'needs_you' | 'error' | 'silent' | 'never'
export type RobotJob = {
  id: string; label: string; what: string; every_minutes: number | null; enabled: boolean
  last_run: string | null; last_status: string | null; detail: string | null; duration_s: number | null; overdue: boolean
}
export type RobotRun = { finished_at: string; job: string; status: string; detail: string | null; duration_s: number | null }
export type Robot = {
  id: string; name: string; platform: string; how: string
  state: RobotState; message: string; beat: string | null
  jobs: RobotJob[]; runs: RobotRun[]
}
export async function getRobot(platform: string = 'amazon') {
  const { data } = await api.get<Robot>(`/marketflow/v1/robot?platform=${platform}`)
  return data
}
