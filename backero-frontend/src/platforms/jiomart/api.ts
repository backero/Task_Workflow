import axios from 'axios'

export const jiomartApi = axios.create({ baseURL: '/api/marketflow' })

export type JioMartMetrics = {
  impressions: number
  clicks: number
  orders: number
  revenue: number
  ctr_pct: number
  cvr_pct: number
  avg_order_value: number
  margin_pct: number
  avg_rating: number
  return_rate: number
  dispatch_sla_met: number
}

export type JioMartOverview = {
  timestamp: string
  snapshot_date: string
  platform: 'jiomart'
  metrics: JioMartMetrics
  status: string
}

export async function getJioMartOverview(): Promise<JioMartOverview> {
  const res = await jiomartApi.get('/jiomart/overview')
  return res.data || { timestamp: new Date().toISOString(), snapshot_date: new Date().toISOString().split('T')[0], platform: 'jiomart', metrics: {}, status: 'no_data' }
}
