import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { addCompetitor, addKeyword, getTracking, removeCompetitor, removeKeyword, setKeywordHero, type TrackedCompetitor, type TrackedKeyword } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'

type Tracking = { keywords: TrackedKeyword[]; competitors: TrackedCompetitor[]; own_products: { asin: string; name: string }[] }

function errorText(e: unknown): string {
  const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ?? 'Something went wrong — try again.'
}

export default function TrackingPage() {
  const [data, setData] = useState<Tracking | null>(null)
  const [kw, setKw] = useState('')
  const [kwHero, setKwHero] = useState(false)
  const [asin, setAsin] = useState('')
  const [rivalName, setRivalName] = useState('')
  const [watches, setWatches] = useState('')
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    const t = await getTracking()
    setData(t)
    setWatches((w) => w || t.own_products[0]?.asin || '')
  }
  useEffect(() => { void load() }, [])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setNote(null)
    try {
      await fn()
      setNote(ok)
      await load()
    } catch (e) {
      setNote(errorText(e))
    }
  }

  if (!data) return <div className="text-stone">Loading…</div>
  const heroCount = data.keywords.filter((k) => k.is_hero_target).length

  return (
    <div>
      <PageHeader
        title="Tracking"
        subtitle="What Robo watches on amazon.in: search terms (rank + share of search) and rival products (price, deals, rating, reviews). New items are picked up on Robo's next public-page sweep."
      />
      {note && <div className="mb-3 rounded-lg border border-sand bg-white px-3 py-2 text-sm text-ink">{note}</div>}

      <Card className="mb-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Keywords ({data.keywords.length})</h2>
        <p className="mb-3 text-xs text-stone">
          "Hero" keywords are the ones you must rank for — falling out of the top 10 on a hero keyword raises an alert. About 20–50 tracked terms per hero product is the target.
          Each keyword is one extra page Robo reads per sweep. Currently {heroCount} hero.
        </p>
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!kw.trim()) return
            void run(async () => { const r = await addKeyword(kw, kwHero); if (!r.added) throw { response: { data: { error: 'Already tracking that keyword.' } } } }, 'Keyword added.').then(() => setKw(''))
          }}
        >
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="e.g. hibiscus shampoo" className="w-64 rounded-lg border border-sand px-3 py-1.5 text-sm" />
          <label className="flex items-center gap-1 text-xs text-stone">
            <input type="checkbox" checked={kwHero} onChange={(e) => setKwHero(e.target.checked)} /> hero
          </label>
          <button type="submit" className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember">Add keyword</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {data.keywords.map((k) => (
            <span key={k.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${k.is_hero_target ? 'bg-clay/15 font-semibold text-ember' : 'bg-sand text-ink'}`}>
              <button title={k.is_hero_target ? 'Hero keyword — click to make normal' : 'Click to make this a hero keyword'} onClick={() => void run(() => setKeywordHero(k.id, !k.is_hero_target), 'Updated.')}>
                {k.keyword}{k.is_hero_target ? ' ★' : ''}
              </button>
              <button title="Stop tracking (history is kept)" onClick={() => void run(() => removeKeyword(k.id), 'Removed.')} className="text-stone hover:text-brick-dark"><X size={12} /></button>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Rival products ({data.competitors.length})</h2>
        <p className="mb-3 text-xs text-stone">
          Only products with a watched rival appear on the Competitor Watchlist and can raise a price-undercut alert. Paste the rival's ASIN (the B0… code in its amazon.in link) and choose which of your products it competes with.
        </p>
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!asin.trim() || !watches) return
            void run(() => addCompetitor(asin, watches, rivalName), 'Rival added — its name and price appear after Robo\'s next sweep.').then(() => { setAsin(''); setRivalName('') })
          }}
        >
          <input value={asin} onChange={(e) => setAsin(e.target.value)} placeholder="Rival ASIN (B0…)" className="w-40 rounded-lg border border-sand px-3 py-1.5 text-sm" />
          <input value={rivalName} onChange={(e) => setRivalName(e.target.value)} placeholder="name (optional)" className="w-56 rounded-lg border border-sand px-3 py-1.5 text-sm" />
          <select value={watches} onChange={(e) => setWatches(e.target.value)} className="max-w-[300px] rounded-lg border border-sand bg-white px-2 py-1.5 text-sm">
            {data.own_products.map((p) => <option key={p.asin} value={p.asin}>competes with: {p.name}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember">Add rival</button>
        </form>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-stone"><th className="py-1">Rival</th><th>ASIN</th><th>Competes with</th><th /></tr>
          </thead>
          <tbody>
            {data.competitors.map((c) => (
              <tr key={c.asin} className="border-t border-sand">
                <td className="py-1.5 pr-3">{c.name === c.asin ? <span className="text-stone">(name pending)</span> : c.name}</td>
                <td className="text-xs text-stone">{c.asin}</td>
                <td className="text-xs">{c.watches_name ?? '—'}</td>
                <td className="text-right">
                  <button title="Stop tracking (history is kept)" onClick={() => void run(() => removeCompetitor(c.asin), 'Removed.')} className="text-stone hover:text-brick-dark"><X size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
