import { spapiFetch } from './client.js'

export async function fetchInventorySummaries(accessToken: string, marketplaceId: string): Promise<any[]> {
  const params = new URLSearchParams({
    granularityType: 'Marketplace',
    granularityId: marketplaceId,
    marketplaceIds: marketplaceId,
    details: 'true',
  })
  const res = await spapiFetch(accessToken, `/fba/inventory/v1/summaries?${params.toString()}`)
  return res?.payload?.inventorySummaries ?? []
}

// inventory_daily has no direct "days of cover" from this endpoint — that's derived
// downstream once we have a 14-day average daily units figure (Design Doc §4.1). We
// only populate `available` here; days_of_cover stays null until that derivation exists.
export function mapInventoryToRecords(summaries: any[], date: string) {
  return summaries
    .filter((s) => !!s.sellerSku)
    .map((s) => ({
      sku: s.sellerSku as string,
      date,
      metrics: {
        available: s.totalQuantity ?? s.inventoryDetails?.fulfillableQuantity ?? 0,
      },
    }))
}
