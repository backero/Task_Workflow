import zlib from 'node:zlib'
import { adsFetch } from './client.js'

// Reporting v3, asin-level Sponsored Products report. Amazon's reportTypeId/column
// enums shift occasionally — if this 400s after Amazon ships an API change, check
// the current spAdvertisedProduct schema in the Ads API reporting v3 docs and adjust
// `columns`/`groupBy` here; nothing else in the pipeline needs to change.
export async function createReport(accessToken: string, clientId: string, profileId: string, date: string): Promise<string> {
  const body = {
    name: `mcc-sp-advertised-product-${date}`,
    startDate: date,
    endDate: date,
    configuration: {
      adProduct: 'SPONSORED_PRODUCTS',
      groupBy: ['advertiser'],
      columns: ['date', 'campaignId', 'advertisedAsin', 'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d'],
      reportTypeId: 'spAdvertisedProduct',
      timeUnit: 'DAILY',
      format: 'GZIP_JSON',
    },
  }
  const res = await adsFetch(
    accessToken,
    clientId,
    '/reporting/reports',
    {
      method: 'POST',
      body: JSON.stringify(body),
      // Reporting v3 create-report requires this vendor content type, not plain application/json.
      headers: { 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' },
    },
    profileId,
  )
  return res.reportId as string
}

export async function waitForReportUrl(
  accessToken: string,
  clientId: string,
  profileId: string,
  reportId: string,
  { timeoutMs = 180_000, intervalMs = 8_000 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await adsFetch(accessToken, clientId, `/reporting/reports/${reportId}`, {}, profileId)
    if (res.status === 'COMPLETED') return res.url as string
    if (res.status === 'FAILED') throw new Error(`Ads report ${reportId} failed`)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Ads report ${reportId} did not finish within ${timeoutMs}ms`)
}

export async function downloadReport(url: string): Promise<any[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Ads report download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const text = zlib.gunzipSync(buf).toString('utf-8')
  return JSON.parse(text)
}

// Maps the spAdvertisedProduct rows onto the ingest contract's ads_daily shape
// (Design Doc §4.1 / §6). Keyword-level detail isn't in this report — that comes
// from a separate spTargeting report if/when keyword-level ad performance is needed.
export function mapAdsReportToRecords(rows: any[]) {
  return rows
    .filter((r) => r.advertisedAsin && r.campaignId && r.date)
    .map((r) => ({
      asin: String(r.advertisedAsin),
      campaign_id: String(r.campaignId),
      date: String(r.date),
      metrics: {
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        spend: r.cost ?? 0,
        ad_orders: r.purchases14d ?? 0,
        ad_sales: r.sales14d ?? 0,
      },
    }))
}
