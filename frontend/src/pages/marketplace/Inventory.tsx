import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getAccountOverview, type AccountHealth, type AdsState, type ListingRow } from '../api'
import Card, { PageHeader } from '../components/Card'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

type Overview = { health: AccountHealth | null; ads: AdsState; listings_as_of: string | null; listings: ListingRow[] }

const inr = (n: number | null | undefined, d = 0) => (n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: d })}`)

function Metric({ label, value, target, detail, bad }: { label: string; value: string; target: string; detail?: string; bad: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${bad ? 'border-brick bg-brick-light' : 'border-sand bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone">{label}</div>
      <div className={`text-2xl font-bold ${bad ? 'text-brick-dark' : 'text-ink'}`}>{value}</div>
      <div className="text-xs text-stone">target {target}{detail ? ` · ${detail}` : ''}</div>
    </div>
  )
}

function HealthCard({ h }: { h: AccountHealth }) {
  const over = (v: number | null, t: number | null) => v != null && t != null && v > t
  return (
    <Card className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {h.at_risk ? <AlertTriangle size={18} className="text-brick-dark" /> : <CheckCircle2 size={18} className="text-leaf-dark" />}
          <h2 className="text-sm font-semibold text-ink">
            {h.at_risk ? 'Account health — seller-fulfilled offers at risk of deactivation' : 'Account health'}
          </h2>
        </div>
        <span className="text-xs text-stone">Account Health Rating {h.ahr ?? '—'} · policy issues {h.policy_issues ?? '—'} · read {new Date(h.captured_at).toLocaleString()}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Order defect rate" value={`${h.odr_fbm_pct ?? '—'}%`} target={`under ${h.odr_target_pct ?? 1}%`} detail={`${h.odr_fbm_defects} of ${h.odr_fbm_orders} orders, 60d`} bad={over(h.odr_fbm_pct, h.odr_target_pct)} />
        <Metric label="Late dispatch" value={`${h.late_dispatch_pct ?? '—'}%`} target={`under ${h.late_dispatch_target_pct ?? 2}%`} detail={`${h.late_dispatch_late} of ${h.late_dispatch_orders} orders, 30d`} bad={over(h.late_dispatch_pct, h.late_dispatch_target_pct)} />
        <Metric label="Cancellations" value={`${h.cancel_pct ?? '—'}%`} target={`under ${h.cancel_target_pct ?? 2}%`} detail={`${h.cancel_count} of ${h.cancel_orders} orders, 30d`} bad={over(h.cancel_pct, h.cancel_target_pct)} />
        <Metric label="Valid tracking" value={`${h.valid_tracking_pct ?? '—'}%`} target="over 95%" bad={h.valid_tracking_pct != null && h.valid_tracking_pct < 95} />
      </div>
      <p className="mt-3 text-xs text-stone">
        These are seller-fulfilled figures — Fulfilled-by-Amazon orders are at {h.odr_fba_pct ?? 0}% ({h.odr_fba_orders ?? 0} orders). The order counts are small,
        so a single late or cancelled order moves the rate a lot.
        {h.emergency_contact_verified === 0 && ' Your emergency contact is not verified yet.'}
      </p>
    </Card>
  )
}

export default function Inventory() {
  const [data, setData] = useState<Overview | null>(null)
  useAutoRefresh(() => {
    getAccountOverview().then(setData)
  }, [])

  if (!data) return <div className="text-stone">Loading…</div>
  const { health, ads, listings } = data
  const totalStock = listings.reduce((n, l) => n + (l.available ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Inventory & Account Health"
        subtitle={data.listings_as_of ? `Read from Seller Central on ${new Date(data.listings_as_of).toLocaleString()} — active listings only` : 'Waiting for Robo’s first read'}
      />

      {health ? <HealthCard h={health} /> : <Card className="mb-5 text-sm text-stone">No Account Health read yet.</Card>}

      <Card className="mb-5 text-sm">
        <span className="font-semibold text-ink">Ads: </span>
        {ads.state === 'none' && <span className="text-stone">no ads running — the Ads console shows 0 impressions, 0 clicks and ₹0 sales for {ads.range_label}. That is why ACOS / TACOS have no data.</span>}
        {ads.state === 'active' && <span className="text-brick-dark">ads are running ({ads.range_label}) but per-product ad performance is not collected yet.</span>}
        {ads.state === 'unknown' && <span className="text-stone">not checked yet.</span>}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Active listings ({listings.length}) · {totalStock.toLocaleString('en-IN')} units in stock</h2>
        </div>
        {listings.length === 0 ? (
          <div className="text-sm text-stone">No listing read yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-stone">
                  <th className="py-1">Product</th><th>Fulfilled</th><th>In stock</th><th>Cover</th><th>Sold 30d</th><th>Price</th><th>Buy Box price</th><th>Amazon fees</th><th>Sales rank</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const lowCover = l.days_of_cover != null && l.days_of_cover < 7
                  const feeShare = l.fulfilment === 'FBA' && l.total_fees != null && l.price ? l.total_fees / l.price : null
                  return (
                    <tr key={l.asin} className="border-t border-sand align-top">
                      <td className="py-1.5 pr-3">
                        <div className="max-w-[280px] truncate font-medium text-ink" title={l.name ?? l.asin}>{l.name ?? l.asin}</div>
                        <div className="text-xs text-stone">{l.sku ?? l.asin}</div>
                      </td>
                      <td>{l.fulfilment ?? '—'}</td>
                      <td className={l.available === 0 ? 'font-semibold text-brick-dark' : ''}>
                        {l.available ?? '—'}{l.inbound ? <span className="text-xs text-stone"> (+{l.inbound} inbound)</span> : null}
                      </td>
                      <td className={lowCover ? 'font-semibold text-brick-dark' : ''}>{l.days_of_cover != null ? `${l.days_of_cover} d` : '—'}</td>
                      <td>{l.units_sold_30d ?? '—'}</td>
                      <td>{inr(l.price)}</td>
                      <td className={l.featured_offer_differs ? 'font-semibold text-brick-dark' : ''} title={l.featured_offer_differs ? 'Someone else holds the featured offer at a different price' : undefined}>
                        {inr(l.featured_offer_price)}
                      </td>
                      <td className={feeShare != null && feeShare > 0.5 ? 'font-semibold text-brick-dark' : ''} title={feeShare != null ? `${Math.round(feeShare * 100)}% of the price` : 'Amazon only shows a partial fee for self-fulfilled listings'}>
                        {l.fulfilment === 'FBA' ? inr(l.total_fees, 2) : '—'}
                        {feeShare != null && feeShare > 0.5 ? <span className="text-xs"> ({Math.round(feeShare * 100)}%)</span> : null}
                      </td>
                      <td>{l.sales_rank != null ? `#${l.sales_rank.toLocaleString('en-IN')}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone">
          Cover = stock ÷ Amazon's own last-30-days sales pace. Fees are Seller Central's per-unit estimate and are shown for FBA listings only; red means fees take more than half the selling price.
        </p>
      </Card>
    </div>
  )
}
