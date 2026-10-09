// Parses Amazon's "Detail Page Sales and Traffic By SKU" Business Report CSV export
// and spreads each SKU's range-total metrics evenly across the requested date range —
// the report gives one aggregated row per SKU with no date column, so a day-by-day
// breakdown isn't available from this source (Design Doc §3.4 manual-import fallback).
export type ListingDailyRecord = { asin: string; date: string; metrics: Record<string, number> }

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { fields.push(cur); cur = '' }
      else cur += c
    }
  }
  fields.push(cur)
  return fields
}

function parsePercent(s: string | undefined): number {
  if (!s) return 0
  return Number(s.replace('%', '').trim()) || 0
}

function parseCurrency(s: string | undefined): number {
  if (!s) return 0
  return Number(s.replace(/[^\d.-]/g, '')) || 0
}

function datesBetween(fromDate: string, toDate: string): string[] {
  const dates: string[] = []
  const d = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dates
}

export function parseBusinessReportCsv(csvText: string, fromDate: string, toDate: string): ListingDailyRecord[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0])
  const idx = (name: string) => header.indexOf(name)
  const childAsinIdx = idx('(Child) ASIN')
  const sessionsIdx = idx('Sessions - Total')
  const pageViewsIdx = idx('Page Views - Total')
  const featuredOfferIdx = idx('Featured Offer Percentage')
  const unitsIdx = idx('Units Ordered')
  const salesIdx = idx('Ordered Product Sales')

  if (childAsinIdx === -1) throw new Error('CSV is missing "(Child) ASIN" column — is this a Detail Page Sales and Traffic By SKU report?')

  const days = datesBetween(fromDate, toDate)
  if (days.length === 0) throw new Error('from_date must not be after to_date')

  const records: ListingDailyRecord[] = []
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const asin = cols[childAsinIdx]?.trim()
    if (!asin) continue

    const sessions = Number(cols[sessionsIdx]) || 0
    const pageViews = Number(cols[pageViewsIdx]) || 0
    const buyBoxPct = parsePercent(cols[featuredOfferIdx])
    const units = Number(cols[unitsIdx]) || 0
    const sales = parseCurrency(cols[salesIdx])

    for (const date of days) {
      records.push({
        asin,
        date,
        metrics: {
          sessions: sessions / days.length,
          page_views: pageViews / days.length,
          buy_box_pct: buyBoxPct,
          units_ordered: units / days.length,
          ordered_product_sales: sales / days.length,
        },
      })
    }
  }
  return records
}
