// Derived KPI formulas — Design Doc §4.1. Kept in one place so the rules engine
// and every dashboard route compute the same numbers the same way.

export function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

export function organicCvr(unitsOrdered: number, sessions: number) {
  return safeDiv(unitsOrdered, sessions)
}

export function ctr(clicks: number, impressions: number) {
  return safeDiv(clicks, impressions)
}

export function adCvr(adOrders: number, clicks: number) {
  return safeDiv(adOrders, clicks)
}

export function acos(spend: number, adSales: number) {
  return safeDiv(spend, adSales)
}

export function roas(adSales: number, spend: number) {
  return safeDiv(adSales, spend)
}

export function tacos(spend: number, orderedProductSales: number) {
  return safeDiv(spend, orderedProductSales)
}

export function organicSalesShare(orderedProductSales: number, adSales: number) {
  if (!orderedProductSales) return null
  return (orderedProductSales - adSales) / orderedProductSales
}

/** Breakeven ACOS = (price − Amazon fees − COGS − shipping) ÷ price — Design Doc §8 */
export function breakevenAcos(price: number, amazonFees: number, cogs: number, shipping: number) {
  if (!price) return null
  return (price - amazonFees - cogs - shipping) / price
}

export function daysOfCover(available: number, avgDailyUnits: number) {
  return safeDiv(available, avgDailyUnits)
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return (current - previous) / previous
}

// Parameter Reference §2.7: breakeven ACOS = (price x 0.82 - 65 - COGS) / price — 18% Amazon fees and a flat Rs 65 shipping/fulfilment.
// A real per-unit fee from Seller Central (FBA) already includes fulfilment, so then no shipping is added on top.
export const ESTIMATED_FEE_RATE = 0.18
export const ESTIMATED_SHIPPING = 65

/** Where one unit's price goes. `profit_before_ads` and `breakeven_acos` are null until a COGS is known — never guessed. */
export function unitEconomics(price: number | null, feePerUnit: number | null, cogs: number | null) {
  if (!price) return null
  const realFee = feePerUnit != null
  const fee = realFee ? feePerUnit : price * ESTIMATED_FEE_RATE
  const shipping = realFee ? 0 : ESTIMATED_SHIPPING
  const profitBeforeAds = cogs != null ? price - fee - shipping - cogs : null
  return {
    price, fee, fee_source: realFee ? ('seller_central' as const) : ('estimate' as const), shipping, cogs,
    profit_before_ads: profitBeforeAds,
    breakeven_acos: profitBeforeAds != null ? profitBeforeAds / price : null,
  }
}
