import axios from 'axios'

export const myntraApi = axios.create({ baseURL: '/api/marketflow' })

export type MyntraMetrics = {
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
}

export type MyntraOverview = {
  timestamp: string
  snapshot_date: string
  platform: 'myntra'
  metrics: MyntraMetrics
  status: string
}

export async function getMyntraOverview(): Promise<MyntraOverview> {
  const res = await myntraApi.get('/myntra/overview')
  return res.data || { timestamp: new Date().toISOString(), snapshot_date: new Date().toISOString().split('T')[0], platform: 'myntra', metrics: {}, status: 'no_data' }
}
