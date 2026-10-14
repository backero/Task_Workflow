import { useState } from 'react'
import { getCompetitors, type Product } from '../api'
import Card, { PageHeader } from '../components/Card'
import DataQualityBadge from '../components/DataQualityBadge'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

type CompetitorRow = Product & { latest_snapshot: any; review_velocity_7d: number | null }
type OwnRow = Product & { review_velocity_7d: number | null }

// Reviews gained per week; a decline is a real signal, so keep the sign ("+-3" would be wrong).
const velocity = (v: number | null | undefined) => (v == null ? '—' : v > 0 ? `+${v}` : String(v))

export default function CompetitorWatchlist() {
  const [own, setOwn] = useState<OwnRow[]>([])
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([])

  useAutoRefresh(() => {
    getCompetitors().then((res) => {
      setOwn(res.own_products)
      setCompetitors(res.competitors)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Competitor Watchlist" subtitle="Price, deals, rating, and review velocity vs your hero SKUs" />
      <div className="space-y-5">
        {own.map((p) => {
          const rivals = competitors.filter((c) => c.watches_asin === p.asin)
          if (rivals.length === 0) return null
          return (
            <Card key={p.asin}>
              <h2 className="mb-3 text-sm font-semibold text-ink">
                {p.name} <span className="font-normal text-stone">· ₹{p.price} · your reviews {velocity(p.review_velocity_7d)}/wk</span>
              </h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-stone">
                    <th className="py-1">Rival</th><th>Price</th><th>Deal?</th><th>BSR</th><th>Rating</th><th>Reviews / wk</th><th>DQ</th>
                  </tr>
                </thead>
                <tbody>
                  {rivals.map((r) => {
                    const cheaper = r.latest_snapshot && p.price != null && r.latest_snapshot.price < p.price
                    return (
                      <tr key={r.asin} className="border-t border-sand">
                        <td className="py-1">{r.name}</td>
                        <td className={cheaper ? 'font-semibold text-brick-dark' : ''}>
                          {r.latest_snapshot ? `₹${r.latest_snapshot.price}` : '—'}
                        </td>
                        <td>{r.latest_snapshot?.coupon_deal_flag ? 'Active' : '—'}</td>
                        <td>{r.latest_snapshot?.bsr != null ? `#${r.latest_snapshot.bsr}` : '—'}</td>
                        <td>{r.latest_snapshot?.rating ?? '—'}</td>
                        <td>{velocity(r.review_velocity_7d)}</td>
                        <td>{r.latest_snapshot && <DataQualityBadge quality={r.latest_snapshot.data_quality} />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
