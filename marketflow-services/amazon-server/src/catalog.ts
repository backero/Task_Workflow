import { sqlite } from './db/client.js'

// Seller Central's Business Report lists every ASIN that had traffic, including
// variations nobody hand-entered into dim_product. Those rows used to be stored but
// then ignored by every dashboard (which only sums own catalog ASINs) — 13 of 23
// listings were invisible. Registering them here keeps the catalog in step with what
// Amazon reports.

function guessCategory(title: string): string {
  const t = title.toLowerCase()
  if (/face\s?wash/.test(t)) return 'face_wash'
  if (/shampoo|conditioner/.test(t)) return 'shampoo'
  if (/\boil\b/.test(t)) return 'hair_oil'
  return 'other'
}

/** Amazon titles are long marketing strings ("Name | benefit | benefit…"); keep the name part. */
function shortName(title: string): string {
  const head = title.split(/\s[|–—]\s/)[0].trim()
  return head.length > 90 ? `${head.slice(0, 87)}…` : head
}

/**
 * Adds an own-catalog row for an ASIN the report mentions but dim_product doesn't have.
 * The SKU isn't in this report, so the ASIN stands in until SP-API supplies the real one.
 * Returns true when a row was created.
 */
export function ensureOwnProduct(asin: string, title: string, price: number | null): boolean {
  const exists = sqlite.prepare('SELECT 1 FROM dim_product WHERE asin = ?').get(asin)
  if (exists) return false
  sqlite
    .prepare(
      `INSERT INTO dim_product (asin, sku, name, category, marketplace_code, price, is_hero, is_own)
       VALUES (?, ?, ?, ?, 'amazon_in', ?, 0, 1)`,
    )
    .run(asin, asin, shortName(title), guessCategory(title), price)
  return true
}
