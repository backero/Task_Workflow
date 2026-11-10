import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../components/Card.tsx'
import api from '../api/axios.js'
import { StatTile } from '../components/charts/index.ts'
import { PLATFORM_LABELS, platformColor } from '../theme/colors.ts'

type PlatformAccount = {
  synced_at?: string
  revenue_received?: number | null
  revenue_received_period?: string | null
  pending_payment?: number | null
  outstanding_postpaid?: number | null
  returns_count?: number | null
  return_rate_pct?: number | null
  rto_count?: number | null
  rto_rate_pct?: number | null
  dispatch_health_pct?: number | null
  orders_completed?: number | null
  settlements?: { ref: string; date: string; amount: number; transactions: number }[] | null
}

type AccountSummaryResponse = {
  platforms: Record<string, PlatformAccount>
}

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`)
const count = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'))

export default function AccountReturnsPage() {
  const [data, setData] = useState<AccountSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchData = () => {
      api.get('/marketflow/v1/account-summary')
        .then((r) => { setData(r.data); setError(false) })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading account &amp; returns data…</Card>
  if (error || !data) return <Card className="text-stone">Could not load account &amp; returns data. Try refreshing.</Card>

  const platformKeys = ['meesho', 'snapdeal', 'flipkart'].filter((k) => data.platforms[k])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Account & Returns"
        subtitle="Real money received, pending payouts, and return/RTO rates per marketplace — pulled directly from each seller panel."
      />

      {platformKeys.length === 0 && (
        <Card className="text-stone">No account data synced yet for Meesho, Snapdeal, or Flipkart.</Card>
      )}

      {platformKeys.map((key) => {
        const p = data.platforms[key]
        const accent = platformColor(key)
        const label = PLATFORM_LABELS?.[key] || key
        return (
          <Card key={key} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink" style={{ color: accent }}>{label}</h2>
              {p.synced_at && (
                <span className="text-[11px] text-stone">Synced {new Date(p.synced_at).toLocaleString('en-IN')}</span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3">
              <StatTile
                label={p.revenue_received_period ? `Received (${p.revenue_received_period})` : 'Received'}
                value={p.revenue_received ?? 0}
                format={p.revenue_received === null ? 'raw' : 'currency'}
                accentColor={accent}
              />
              <StatTile label="Pending Payout" value={p.pending_payment ?? 0} format={p.pending_payment === null ? 'raw' : 'currency'} accentColor={accent} />
              <StatTile label="Returns" value={p.returns_count ?? 0} format={p.returns_count === null ? 'raw' : 'number'} accentColor={accent} />
              <StatTile label="RTO" value={p.rto_count ?? (p.rto_rate_pct !== null && p.rto_rate_pct !== undefined ? `${p.rto_rate_pct}%` : '—')} format="raw" accentColor={accent} />
            </div>

            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-cream px-3 py-2">
                <div className="text-[11px] text-stone">Return Rate</div>
                <div className="font-semibold text-ink">{pct(p.return_rate_pct)}</div>
              </div>
              <div className="rounded-lg bg-cream px-3 py-2">
                <div className="text-[11px] text-stone">RTO Rate</div>
                <div className="font-semibold text-ink">{pct(p.rto_rate_pct)}</div>
              </div>
              {p.dispatch_health_pct !== null && p.dispatch_health_pct !== undefined && (
                <div className="rounded-lg bg-cream px-3 py-2">
                  <div className="text-[11px] text-stone">Dispatch Health</div>
                  <div className="font-semibold text-ink">{pct(p.dispatch_health_pct)}</div>
                </div>
              )}
              {p.outstanding_postpaid !== null && p.outstanding_postpaid !== undefined && (
                <div className="rounded-lg bg-cream px-3 py-2">
                  <div className="text-[11px] text-stone">Outstanding (Postpaid)</div>
                  <div className="font-semibold text-ink">{money(p.outstanding_postpaid)}</div>
                </div>
              )}
              {p.orders_completed !== null && p.orders_completed !== undefined && (
                <div className="rounded-lg bg-cream px-3 py-2">
                  <div className="text-[11px] text-stone">Orders Completed</div>
                  <div className="font-semibold text-ink">{count(p.orders_completed)}</div>
                </div>
              )}
            </div>

            {p.settlements && p.settlements.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold text-stone uppercase tracking-wide">Recent Settlements</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sand">
                        <th className="text-left py-2 text-stone">Date</th>
                        <th className="text-left py-2 text-stone">Reference</th>
                        <th className="text-right py-2 text-stone">Transactions</th>
                        <th className="text-right py-2 text-stone">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.settlements.map((s) => (
                        <tr key={s.ref} className="border-b border-sand hover:bg-cream">
                          <td className="py-2 text-ink">{s.date}</td>
                          <td className="py-2 text-stone text-xs">{s.ref}</td>
                          <td className="text-right py-2 text-stone">{s.transactions}</td>
                          <td className="text-right py-2 font-medium text-ink">{money(s.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
