import { useState } from 'react'
import { PageHeader } from '../../components/Card.tsx'
import StatusDot from '../../components/StatusDot.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getMeeshoListings, type MeeshoListing } from './api.ts'

export default function MeeshoListingsPage() {
  const [rows, setRows] = useState<MeeshoListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getMeeshoListings().then(setRows).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <div className="text-brick">Could not reach Meesho's app on port 8000 — is it running? ({error})</div>
  if (!rows) return <div className="text-stone">Loading…</div>

  return (
    <div>
      <PageHeader title="Meesho — Listings" subtitle={`${rows.length} products, from real Business Dashboard reads.`} />
      <div className="overflow-x-auto rounded-xl border border-sand bg-white">
        <table className="w-full text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-stone">
            <tr>
              <th className="px-3 py-2">RAG</th><th className="px-3 py-2">Catalog ID</th><th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Rating</th><th className="px-3 py-2">Impr. 7d</th>
              <th className="px-3 py-2">Orders 7d</th><th className="px-3 py-2">CTR%</th><th className="px-3 py-2">CVR%</th>
              <th className="px-3 py-2">Open recs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-sand">
                <td className="px-3 py-2"><StatusDot status={r.rag === 'red' ? 'red' : r.rag === 'amber' ? 'amber' : 'green'} /></td>
                <td className="px-3 py-2 text-stone">{r.catalog_id}</td>
                <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.rating || '—'}★</td>
                <td className="px-3 py-2">{r.impressions_7d.toLocaleString('en-IN')}</td>
                <td className="px-3 py-2">{r.orders_7d}</td>
                <td className="px-3 py-2">{r.ctr}</td>
                <td className="px-3 py-2">{r.cvr}</td>
                <td className="px-3 py-2">{r.open_recs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
