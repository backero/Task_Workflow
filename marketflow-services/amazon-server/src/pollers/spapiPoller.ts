import { getLwaAccessToken } from '../lwa.js'
import { INDIA_MARKETPLACE_ID } from '../spapi/client.js'
import { createReport, waitForReportDocument, downloadReportDocument } from '../spapi/reports.js'
import { parseSalesAndTrafficReport } from '../spapi/salesAndTraffic.js'
import { fetchInventorySummaries, mapInventoryToRecords } from '../spapi/inventory.js'
import { getCredentials, setHeartbeat, postIngest, isoDateDaysAgo, isAuthError } from './shared.js'

export async function runSpapiPoller() {
  const creds = getCredentials('spapi')
  if (!creds) return { skipped: true, reason: 'not_connected' as const }
  if (!creds.client_id || !creds.client_secret) {
    setHeartbeat('spapi', 'needs_reauth', 'Missing client_id/client_secret — re-save credentials with the LWA app values from Seller Central → Develop Apps.')
    return { skipped: true, reason: 'missing_client_credentials' as const }
  }

  try {
    const accessToken = await getLwaAccessToken('spapi', creds.refresh_token, creds.client_id, creds.client_secret)
    const yesterday = isoDateDaysAgo(1)

    const reportId = await createReport(
      accessToken,
      'GET_SALES_AND_TRAFFIC_REPORT',
      [INDIA_MARKETPLACE_ID],
      `${yesterday}T00:00:00Z`,
      `${yesterday}T23:59:59Z`,
      // CHILD so rows key on the same child ASINs as the catalog; Amazon doesn't return per-day
      // rows for a multi-day range (amzn/selling-partner-api-models#426), hence one report per day.
      { dateGranularity: 'DAY', asinGranularity: 'CHILD' },
    )
    const docId = await waitForReportDocument(accessToken, reportId)
    const raw = await downloadReportDocument(accessToken, docId)
    const listingRecords = parseSalesAndTrafficReport(JSON.parse(raw), yesterday)
    const listingResult = await postIngest('spapi_poller', 'listing_daily', listingRecords)

    const summaries = await fetchInventorySummaries(accessToken, INDIA_MARKETPLACE_ID)
    const inventoryRecords = mapInventoryToRecords(summaries, isoDateDaysAgo(0))
    const inventoryResult = await postIngest('spapi_poller', 'inventory_daily', inventoryRecords)

    setHeartbeat('spapi', 'healthy')
    return {
      ok: true as const,
      listing: { fetched: listingRecords.length, ...listingResult },
      inventory: { fetched: inventoryRecords.length, ...inventoryResult },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    setHeartbeat('spapi', isAuthError(message) ? 'needs_reauth' : 'error', message)
    return { ok: false as const, error: message }
  }
}
