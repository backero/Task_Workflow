// Maps GET_SALES_AND_TRAFFIC_REPORT (asin granularity) onto the ingest contract's
// listing_daily shape (Design Doc §4.1 / §6).
export type IngestRecord = { asin: string; date: string; metrics: Record<string, number> }

export function parseSalesAndTrafficReport(report: any, date: string): IngestRecord[] {
  const rows: any[] = report?.salesAndTrafficByAsin ?? []
  const records: IngestRecord[] = []
  for (const r of rows) {
    const asin = r.childAsin || r.parentAsin
    if (!asin) continue
    const traffic = r.trafficByAsin ?? {}
    const sales = r.salesByAsin ?? {}
    records.push({
      asin,
      date,
      metrics: {
        sessions: traffic.sessions ?? 0,
        page_views: traffic.pageViews ?? 0,
        buy_box_pct: traffic.buyBoxPercentage ?? 0,
        units_ordered: sales.unitsOrdered ?? 0,
        ordered_product_sales: sales.orderedProductSales?.amount ?? 0,
      },
    })
  }
  return records
}
