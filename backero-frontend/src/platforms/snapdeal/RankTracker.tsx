import { useState } from 'react'
import { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getSnapdealRanks, type SnapdealRankRow } from './api.ts'

export default function SnapdealRankTrackerPage() {
  const [rows, setRows] = useState<SnapdealRankRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealRanks().then(setRows).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <div className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</div>
  if (!rows) return <div className="text-stone">Loading…</div>

  return (
    <div>
      <PageHeader title="Snapdeal — Rank Tracker" subtitle={`${rows.length} keyword readings from real search-result scans.`} />
      <div className="overflow-x-auto rounded-xl border border-sand bg-white">
        <table className="w-full text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-stone">
            <tr>
              <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Keyword</th>
              <th className="px-3 py-2">Position</th><th className="px-3 py-2">Page</th><th className="px-3 py-2">Day</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="px-3 py-2 text-stone">{r.listing_sku}</td>
                <td className="px-3 py-2 font-medium text-ink">{r.title ?? '—'}</td>
                <td className="px-3 py-2">{r.keyword}</td>
                <td className="px-3 py-2">{r.position}</td>
                <td className="px-3 py-2">{r.page}</td>
                <td className="px-3 py-2 text-stone">{r.day}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-3 py-3 text-sm text-stone" colSpan={6}>No rank data read yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
