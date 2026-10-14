import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCompetitors, getSkuScorecard, type Product } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import DataQualityBadge from '../components/DataQualityBadge.tsx'
import AiText from '../components/AiText.tsx'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'

type Scorecard = {
  product: Product
  unit_economics: Economics | null
  listing_series: any[]
  ads_series: any[]
  price_timeline: any[]
  keyword_ranks: any[]
  alert_history: any[]
}

const pct = (n: number | null, d = 1) => (n == null ? '—' : `${(n * 100).toFixed(d)}%`)
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
// Estimated days are spread fractions (1.75 sessions) — show at most one decimal.
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

type Economics = { price: number; fee: number; fee_source: 'seller_central' | 'estimate'; shipping: number; cogs: number | null; cogs_status: string; profit_before_ads: number | null; breakeven_acos: number | null }

function UnitEconomics({ e }: { e: Economics }) {
  const rupee = (n: number) => `₹${n.toFixed(0)}`
  const row = (label: string, value: string, note?: string, bad = false) => (
    <div className="flex items-baseline justify-between border-b border-sand/70 py-1.5 text-sm last:border-0">
      <span className="text-stone">{label}{note ? <span className="ml-2 text-xs">({note})</span> : null}</span>
      <span className={`font-semibold ${bad ? 'text-brick-dark' : 'text-ink'}`}>{value}</span>
    </div>
  )
  return (
    <div className="max-w-xl">
      {row('Selling price', rupee(e.price))}
      {row('− Amazon fees', rupee(e.fee), e.fee_source === 'seller_central' ? "Seller Central's own figure" : 'estimate: 18% of price')}
      {row('− Shipping', rupee(e.shipping), e.fee_source === 'seller_central' ? 'included in the fee' : 'estimate')}
      {row('− Your cost (COGS)', e.cogs != null ? rupee(e.cogs) : 'not entered', e.cogs != null ? undefined : 'enter it on Products & COGS')}
      {row('= Profit per unit before ads', e.profit_before_ads != null ? rupee(e.profit_before_ads) : '—', undefined, e.profit_before_ads != null && e.profit_before_ads < 0)}
      {row('Breakeven ACOS', e.breakeven_acos != null ? `${(e.breakeven_acos * 100).toFixed(1)}%` : '—', 'ads above this lose money')}
    </div>
  )
}

export default function SkuScorecard() {
  const { sku } = useParams()
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [data, setData] = useState<Scorecard | null>(null)
  const [selected, setSelected] = useState<string>(sku ?? '')

  useEffect(() => {
    getCompetitors().then((res) => {
      setProducts(res.own_products)
      if (!selected && res.own_products.length) setSelected(res.own_products[0].sku)
    })
  }, [])

  useAutoRefresh(() => {
    if (!selected) return
    getSkuScorecard(selected).then(setData)
  }, [selected])

  const last7Listing = data?.listing_series.slice(-7) ?? []
  const last7Ads = data?.ads_series.slice(-7) ?? []
  const priceHistory = data?.price_timeline.slice(-6) ?? []

  // Latest reading per keyword, compared with the most recent reading at least 5 days older.
  const keywordRows = (() => {
    const byKeyword = new Map<string, any[]>()
    for (const r of data?.keyword_ranks ?? []) byKeyword.set(r.keyword, [...(byKeyword.get(r.keyword) ?? []), r])
    return [...byKeyword.entries()].map(([keyword, rows]) => {
      const latest = rows[rows.length - 1]
      const cutoff = Date.parse(latest.date) - 5 * 86_400_000
      const earlier = [...rows].reverse().find((r) => Date.parse(r.date) <= cutoff)
      const move = earlier && earlier.organic_rank != null && latest.organic_rank != null ? earlier.organic_rank - latest.organic_rank : null
      return { ...latest, keyword, move }
    })
  })()

  return (
    <div>
      <PageHeader title="SKU Scorecard" subtitle="One page per product — traffic funnel, ad funnel, price/BSR/rating, keyword ranks, alert history" />

      <select
        className="mb-5 rounded-lg border border-sand bg-white px-3 py-2 text-sm"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          navigate(`/sku/${e.target.value}`)
        }}
      >
        {products.map((p) => (
          <option key={p.sku} value={p.sku}>
            {p.name} ({p.sku})
          </option>
        ))}
      </select>

      {!data ? (
        <div className="text-stone">Loading…</div>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{data.product.name}</div>
                <div className="text-xs text-stone">{data.product.asin} · {data.product.category}</div>
              </div>
              <div className="text-right text-sm">
                <div>Price: ₹{data.product.price}</div>
                <div className="text-stone">COGS: {data.product.cogs != null ? `₹${data.product.cogs}` : '—'}</div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Unit economics — where one sale's money goes</h2>
            {!data.unit_economics ? (
              <div className="text-sm text-stone">No price known for this product yet.</div>
            ) : (
              <UnitEconomics e={data.unit_economics} />
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Traffic funnel — last 7 days</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-stone">
                  <th className="py-1">Date</th><th>Sessions</th><th>Page views</th><th>Buy Box %</th><th>Units</th><th>CVR</th><th>Sales</th><th>DQ</th>
                </tr>
              </thead>
              <tbody>
                {last7Listing.map((r) => (
                  <tr key={r.date} className="border-t border-sand">
                    <td className="py-1">{r.date}</td>
                    <td>{num(r.sessions)}</td>
                    <td>{num(r.page_views)}</td>
                    <td>{r.buy_box_pct.toFixed(1)}%</td>
                    <td>{num(r.units_ordered)}</td>
                    <td>{pct(ratio(r.units_ordered, r.sessions))}</td>
                    <td>₹{r.ordered_product_sales.toFixed(0)}</td>
                    <td><DataQualityBadge quality={r.data_quality} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Ad funnel — last 7 days</h2>
            {last7Ads.length === 0 ? (
              <div className="text-sm text-stone">No ad data yet — the Amazon Advertising API is not connected, so impressions, clicks, CTR, ACOS and ROAS cannot be measured.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-stone">
                    <th className="py-1">Date</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Spend</th><th>Ad orders</th><th>CVR</th><th>Ad sales</th><th>ACOS</th><th>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {last7Ads.map((r) => (
                    <tr key={r.date} className="border-t border-sand">
                      <td className="py-1">{r.date}</td>
                      <td>{num(r.impressions)}</td>
                      <td>{num(r.clicks)}</td>
                      <td>{pct(ratio(r.clicks, r.impressions))}</td>
                      <td>₹{r.spend.toFixed(0)}</td>
                      <td>{num(r.ad_orders)}</td>
                      <td>{pct(ratio(r.ad_orders, r.clicks))}</td>
                      <td>₹{r.ad_sales.toFixed(0)}</td>
                      <td>{pct(ratio(r.spend, r.ad_sales))}</td>
                      <td>{ratio(r.ad_sales, r.spend)?.toFixed(2) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Keyword ranks</h2>
            {keywordRows.length === 0 ? (
              <div className="text-sm text-stone">This product was not found in the search results of any tracked keyword.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-stone">
                    <th className="py-1">Keyword</th><th>Organic</th><th>Sponsored</th><th>vs earlier</th><th>As of</th><th>DQ</th>
                  </tr>
                </thead>
                <tbody>
                  {keywordRows.map((k) => (
                    <tr key={k.keyword} className="border-t border-sand">
                      <td className="py-1">{k.keyword}</td>
                      <td>{k.organic_rank != null ? `#${k.organic_rank}` : '—'}</td>
                      <td>{k.sponsored_rank != null ? `Ad #${k.sponsored_rank}` : '—'}</td>
                      <td className={k.move != null && k.move < 0 ? 'text-brick-dark' : k.move != null && k.move > 0 ? 'text-leaf-dark' : ''}>
                        {k.move == null ? '—' : k.move === 0 ? 'no change' : k.move > 0 ? `▲ ${k.move}` : `▼ ${Math.abs(k.move)}`}
                      </td>
                      <td>{k.date}</td>
                      <td><DataQualityBadge quality={k.data_quality} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Price / BSR / rating timeline</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-stone">
                  <th className="py-1">Captured</th><th>Price</th><th>Deal?</th><th>BSR</th><th>Category</th><th>Rating</th><th>Reviews</th><th>Seller</th><th>DQ</th>
                </tr>
              </thead>
              <tbody>
                {priceHistory.map((r) => (
                  <tr key={r.captured_at} className="border-t border-sand">
                    <td className="py-1">{r.captured_at.slice(0, 10)}</td>
                    <td>₹{r.price}</td>
                    <td>{r.coupon_deal_flag ? 'Yes' : '—'}</td>
                    <td>{r.bsr != null ? `#${r.bsr}` : '—'}</td>
                    <td className="text-xs">{r.category ?? '—'}</td>
                    <td>{r.rating ?? '—'}</td>
                    <td>{r.review_count ?? '—'}</td>
                    <td className="text-xs">{r.buy_box_seller ?? '—'}</td>
                    <td><DataQualityBadge quality={r.data_quality} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Alert history</h2>
            {data.alert_history.length === 0 && <div className="text-sm text-stone">No alerts for this SKU.</div>}
            <ul className="space-y-2">
              {data.alert_history.map((a) => (
                <li key={a.id} className="rounded-lg border border-sand p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.title}</span>
                    <span className="text-xs text-stone">{a.status}</span>
                  </div>
                  <div className="text-stone">{a.message}</div>
                  {a.ai_analysis && (
                    <div className="mt-1 rounded-lg bg-clay/5 p-2 text-xs text-ink">
                      <div className="font-semibold text-ember">AI analysis</div>
                      <AiText text={a.ai_analysis} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
