import { sqlite } from './db/client.js'
import { daysOfCover } from './metrics.js'

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000)
}

function daysBefore(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Days of cover = units in stock ÷ average daily units sold over the last 14 days (Design Doc §4.1).
 * Amazon's inventory endpoint only reports the quantity, so nothing ever computed this — the
 * Stock-out guard could never fire on real data.
 *
 * Only real (non-estimate) sales count. The average is taken over the days we actually have real
 * sales coverage for (up to 14), otherwise a short history would look like slow sales and make
 * the cover look safely long. Returns null when there is no real sales history to divide by.
 */
export function deriveDaysOfCover(sku: string, date: string, available: number): number | null {
  const firstReal = sqlite
    .prepare("SELECT MIN(date) as d FROM fact_listing_daily WHERE data_quality != 'estimate'")
    .get() as { d: string | null }
  if (!firstReal.d) return null

  const coverageDays = Math.min(14, Math.max(1, daysBetween(firstReal.d, date)))
  const row = sqlite
    .prepare(`
      SELECT COALESCE(SUM(f.units_ordered), 0) as units
      FROM fact_listing_daily f JOIN dim_product p ON p.asin = f.asin
      WHERE p.sku = ? AND f.date >= ? AND f.date < ? AND f.data_quality != 'estimate'
    `)
    .get(sku, daysBefore(date, coverageDays), date) as { units: number }

  return daysOfCover(available, row.units / coverageDays)
}
