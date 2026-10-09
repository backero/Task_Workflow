// India, along with the rest of EU/UK/MEA, is served by SP-API's "EU" regional
// endpoint — there is no separate "IN" region. See Design Doc §3.2.
export const SPAPI_BASE_URL = process.env.SPAPI_BASE_URL ?? 'https://sellingpartnerapi-eu.amazon.com'
export const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV'

export async function spapiFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SPAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      'x-amz-access-token': accessToken,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SP-API ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : undefined
}
