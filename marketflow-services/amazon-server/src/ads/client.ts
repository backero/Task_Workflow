// India is served by Amazon Ads' EU endpoint, same as SP-API (Design Doc §3.3).
export const ADS_BASE_URL = process.env.ADS_BASE_URL ?? 'https://advertising-api-eu.amazon.com'

export async function adsFetch(
  accessToken: string,
  clientId: string,
  path: string,
  init: RequestInit = {},
  profileId?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Amazon-Advertising-API-ClientId': clientId,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (profileId) headers['Amazon-Advertising-API-Scope'] = profileId

  const res = await fetch(`${ADS_BASE_URL}${path}`, { ...init, headers })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Ads API ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : undefined
}

export async function fetchIndiaProfileId(accessToken: string, clientId: string): Promise<string> {
  const profiles = await adsFetch(accessToken, clientId, '/v2/profiles')
  const profile = (profiles ?? []).find((p: any) => p.countryCode === 'IN') ?? profiles?.[0]
  if (!profile) throw new Error('No advertising profiles returned for this account')
  return String(profile.profileId)
}
