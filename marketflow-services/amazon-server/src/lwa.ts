// Login-with-Amazon token exchange, shared by the SP-API and Ads API pollers —
// both self-authorized private apps hand back a refresh_token that must be
// exchanged for a short-lived access_token before every batch of calls.
const LWA_TOKEN_URL = process.env.LWA_TOKEN_URL ?? 'https://api.amazon.com/auth/o2/token'

type CachedToken = { accessToken: string; expiresAt: number }
const tokenCache = new Map<string, CachedToken>()

export async function getLwaAccessToken(cacheKey: string, refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken

  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LWA token exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number }
  tokenCache.set(cacheKey, { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 })
  return json.access_token
}
