import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getFlipkartReturns, type FlipkartReturns } from './api.ts'

export default function FlipkartReturnsPage() {
  const [data, setData] = useState<FlipkartReturns | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartReturns().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Returns / RTO" subtitle="RTO by SKU and pincode, and COD vs prepaid split." />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">RTO by SKU</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">FSN</th><th className="pb-1 pr-3">Title</th><th className="pb-1 pr-3">Orders</th><th className="pb-1 pr-3">RTO count</th><th className="pb-1">RTO rate</th></tr></thead>
          <tbody>
            {data.by_sku.map((r) => (
              <tr key={r.fsn} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{r.fsn}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{r.title}</td>
                <td className="py-1.5 pr-3">{r.orders}</td>
                <td className="py-1.5 pr-3">{r.rto}</td>
                <td className="py-1.5">{r.rto_rate_pct.toFixed(1)}%</td>
              </tr>
            ))}
            {data.by_sku.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={5}>No orders read yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">RTO pincode clusters</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">Pincode</th><th className="pb-1">RTO returns</th></tr></thead>
          <tbody>
            {data.by_pincode.map((r) => (
              <tr key={r.pincode} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{r.pincode}</td>
                <td className="py-1.5">{r.rto_count}</td>
              </tr>
            ))}
            {data.by_pincode.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={2}>No RTO returns recorded yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">COD vs prepaid</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">Payment type</th><th className="pb-1 pr-3">Orders</th><th className="pb-1 pr-3">RTO count</th><th className="pb-1">RTO rate</th></tr></thead>
          <tbody>
            {data.cod_split.map((r) => (
              <tr key={r.payment_type} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{r.payment_type}</td>
                <td className="py-1.5 pr-3">{r.orders}</td>
                <td className="py-1.5 pr-3">{r.rto}</td>
                <td className="py-1.5">{r.rto_rate_pct.toFixed(1)}%</td>
              </tr>
            ))}
            {data.cod_split.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={4}>No orders read yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
