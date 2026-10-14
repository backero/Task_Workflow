import { useState } from 'react'
import { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getSnapdealPayments, type SnapdealPayments } from './api.js'

export default function SnapdealPaymentsPage() {
  const [data, setData] = useState<SnapdealPayments | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealPayments().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <div className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</div>
  if (!data) return <div className="text-stone">Loading…</div>

  const total = data.settlements.reduce((a, s) => a + s.amount, 0)
  return (
    <div>
      <PageHeader title="Snapdeal — Payments" subtitle={`${data.settlements.length} settlements, ₹${total.toFixed(2)} total, from real bank references.`} />
      <div className="overflow-x-auto rounded-xl border border-sand bg-white">
        <table className="w-full text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-stone">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Amount ₹</th><th className="px-3 py-2">Transactions</th></tr>
          </thead>
          <tbody>
            {data.settlements.map((s) => (
              <tr key={s.ref} className="border-t border-sand">
                <td className="px-3 py-2 text-stone">{s.date}</td>
                <td className="px-3 py-2 font-medium text-ink">{s.ref}</td>
                <td className="px-3 py-2">₹{s.amount}</td>
                <td className="px-3 py-2">{s.transactions}</td>
              </tr>
            ))}
            {data.settlements.length === 0 && <tr><td className="px-3 py-3 text-sm text-stone" colSpan={4}>No settlements read yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
