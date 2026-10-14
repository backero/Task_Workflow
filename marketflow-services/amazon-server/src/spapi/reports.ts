import zlib from 'node:zlib'
import { spapiFetch } from './client.js'

export async function createReport(
  accessToken: string,
  reportType: string,
  marketplaceIds: string[],
  dataStartTime: string,
  dataEndTime: string,
  reportOptions?: Record<string, string>,
): Promise<string> {
  const res = await spapiFetch(accessToken, '/reports/2021-06-30/reports', {
    method: 'POST',
    body: JSON.stringify({ reportType, marketplaceIds, dataStartTime, dataEndTime, ...(reportOptions ? { reportOptions } : {}) }),
  })
  return res.reportId as string
}

/** Amazon reports are async — create, then poll until DONE (or give up). */
export async function waitForReportDocument(
  accessToken: string,
  reportId: string,
  { timeoutMs = 120_000, intervalMs = 5_000 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await spapiFetch(accessToken, `/reports/2021-06-30/reports/${reportId}`)
    if (res.processingStatus === 'DONE') return res.reportDocumentId as string
    if (res.processingStatus === 'CANCELLED' || res.processingStatus === 'FATAL') {
      throw new Error(`Report ${reportId} ended with status ${res.processingStatus}`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Report ${reportId} did not finish within ${timeoutMs}ms`)
}

export async function downloadReportDocument(accessToken: string, reportDocumentId: string): Promise<string> {
  const doc = await spapiFetch(accessToken, `/reports/2021-06-30/documents/${reportDocumentId}`)
  const fileRes = await fetch(doc.url)
  if (!fileRes.ok) throw new Error(`report document download failed (${fileRes.status})`)
  const buf = Buffer.from(await fileRes.arrayBuffer())
  const decompressed = doc.compressionAlgorithm === 'GZIP' ? zlib.gunzipSync(buf) : buf
  return decompressed.toString('utf-8')
}
