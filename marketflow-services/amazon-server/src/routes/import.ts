import { Router } from 'express'
import { z } from 'zod'
import { parseBusinessReportCsv } from '../lib/businessReportCsv.js'
import { postIngest } from '../pollers/shared.js'

const router = Router()

const bodySchema = z.object({
  csv_text: z.string().min(1),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Manual-import fallback for when SP-API access isn't wired up yet (Design Doc §3.4):
// paste in a "Detail Page Sales and Traffic By SKU" CSV exported from Seller Central's
// Business Reports, and it flows through the same /v1/ingest gateway every other
// collector uses. Tagged 'business_report_import' (data_quality 'observed') rather than
// 'manual_import' ('api') since range-total-spread-across-days is an approximation, not
// a true daily figure.
router.post('/v1/import/business-report-sku', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const records = parseBusinessReportCsv(parsed.data.csv_text, parsed.data.from_date, parsed.data.to_date)
    if (records.length === 0) return res.status(400).json({ error: 'no rows parsed from CSV' })
    const result = await postIngest('business_report_import', 'listing_daily', records)
    res.json({ ok: true, rows_parsed: records.length, ...result })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'failed to parse CSV' })
  }
})

export default router
