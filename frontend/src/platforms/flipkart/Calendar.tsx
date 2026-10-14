import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartCalendar, type FlipkartCalendar } from './api.js'

export default function FlipkartCalendarPage() {
  const [data, setData] = useState<FlipkartCalendar | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartCalendar().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  const open = data.usual_price.filter((r) => r.open)

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Calendar" subtitle="Sale event countdowns and the 15-day Usual Price window." />
      <div className="grid grid-cols-2 gap-3">
        {data.events.map((e) => (
          <Card key={e.name} className={e.nominate_now ? 'border-clay' : undefined}>
            <div className="text-xs font-medium uppercase tracking-wide text-stone">{e.name}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{e.days} days</div>
            <div className="text-xs text-stone">{e.next_date}</div>
            {e.nominate_now && <div className="mt-1 text-xs font-medium text-clay">Submit deal nominations now (T-8 weeks window).</div>}
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Usual Price {data.usual_price_days}-day windows</h2>
        <p className="mb-2 text-xs text-stone">
          Listings must hold their "usual price" for {data.usual_price_days} days after listing before promotions; ads only during the window.
        </p>
        {open.length > 0 ? (
          <p className="mb-2 text-sm font-medium text-clay">{open.length} listing(s) inside the window — no promotions until day {data.usual_price_days}; ads only.</p>
        ) : (
          <p className="mb-2 text-sm text-stone">No listings inside the window.</p>
        )}
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">FSN</th><th className="pb-1 pr-3">Title</th><th className="pb-1 pr-3">Price</th><th className="pb-1 pr-3">Listed</th><th className="pb-1 pr-3">Window ends</th><th className="pb-1 pr-3">Day</th><th className="pb-1">Status</th></tr></thead>
          <tbody>
            {data.usual_price.map((r) => (
              <tr key={r.fsn} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{r.fsn}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{r.title}</td>
                <td className="py-1.5 pr-3">₹{r.price}</td>
                <td className="py-1.5 pr-3">{r.listed_date}</td>
                <td className="py-1.5 pr-3">{r.window_ends}</td>
                <td className="py-1.5 pr-3">{r.day}/{data.usual_price_days}</td>
                <td className={`py-1.5 ${r.open ? 'font-medium text-clay' : ''}`}>{r.open ? 'OPEN — no promotions' : 'closed'}</td>
              </tr>
            ))}
            {data.usual_price.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={7}>No parseable listed_date values.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
