import { getLwaAccessToken } from '../lwa.js'
import { fetchIndiaProfileId } from '../ads/client.js'
import { createReport, waitForReportUrl, downloadReport, mapAdsReportToRecords } from '../ads/reports.js'
import { getCredentials, patchCredentials, setHeartbeat, postIngest, isoDateDaysAgo, isAuthError } from './shared.js'

export async function runAdsPoller() {
  const creds = getCredentials('ads_api')
  if (!creds) return { skipped: true, reason: 'not_connected' as const }
  if (!creds.client_id || !creds.client_secret) {
    setHeartbeat('ads_api', 'needs_reauth', 'Missing client_id/client_secret — re-save credentials with the LWA app values from the Ads API console.')
    return { skipped: true, reason: 'missing_client_credentials' as const }
  }

  try {
    const accessToken = await getLwaAccessToken('ads_api', creds.refresh_token, creds.client_id, creds.client_secret)

    let profileId = creds.profile_id
    if (!profileId) {
      profileId = await fetchIndiaProfileId(accessToken, creds.client_id)
      patchCredentials('ads_api', { profile_id: profileId })
    }

    const yesterday = isoDateDaysAgo(1)
    const reportId = await createReport(accessToken, creds.client_id, profileId, yesterday)
    const url = await waitForReportUrl(accessToken, creds.client_id, profileId, reportId)
    const rows = await downloadReport(url)
    const records = mapAdsReportToRecords(rows)
    const result = await postIngest('ads_api_poller', 'ads_daily', records)

    setHeartbeat('ads_api', 'healthy')
    return { ok: true as const, fetched: records.length, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    setHeartbeat('ads_api', isAuthError(message) ? 'needs_reauth' : 'error', message)
    return { ok: false as const, error: message }
  }
}
