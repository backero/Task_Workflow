import { useEffect, useState } from 'react'
import { getProducts, saveCogs, type CogsStatus, type OwnProduct } from '../api.js'
import Card, { PageHeader } from '../components/Card.js'

const statusStyle: Record<CogsStatus, { label: string; className: string }> = {
  missing: { label: 'Missing', className: 'bg-brick-light text-brick-dark' },
  estimate: { label: 'Placeholder', className: 'bg-brick-light text-brick-dark' },
  stale: { label: 'Stale', className: 'bg-amber/20 text-ink' },
  ok: { label: 'Up to date', className: 'bg-leaf-light text-leaf-dark' },
}

export default function Products() {
  const [products, setProducts] = useState<OwnProduct[] | null>(null)
  const [staleAfter, setStaleAfter] = useState(90)
  const [feeRate, setFeeRate] = useState(0.18)
  const [shipping, setShipping] = useState(65)
  const [paste, setPaste] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    const res = await getProducts()
    setProducts(res.products)
    setStaleAfter(res.stale_after_days)
    setFeeRate(res.fee_rate)
    setShipping(res.shipping)
  }
  useEffect(() => { void load() }, [])

  const changed = Object.entries(edits)
    .map(([asin, v]) => ({ asin, cogs: Number(v) }))
    .filter((e) => Number.isFinite(e.cogs) && e.cogs > 0)

  async function save() {
    setSaving(true)
    setNote(null)
    try {
      const res = await saveCogs(changed)
      setEdits({})
      setNote(`Saved COGS for ${res.updated} product${res.updated === 1 ? '' : 's'}. Margin and the ad-bleed guard now use it.`)
      await load()
    } catch {
      setNote('Could not save — check the numbers (each must be a positive ₹ amount per unit).')
    } finally {
      setSaving(false)
    }
  }

  // A sheet pasted from Excel/Google Sheets: "SKU (or ASIN)  cost" per line, tab / comma / semicolon separated.
  // It only fills the boxes below - nothing is saved until you press Save.
  function applyPaste() {
    if (!products) return
    const next: Record<string, string> = {}
    const skipped: string[] = []
    for (const raw of paste.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split(/[\t,;]+/).map((x) => x.trim()).filter(Boolean)
      const key = parts[0]?.toUpperCase()
      const cost = Number((parts[parts.length - 1] ?? '').replace(/[₹,\s]/g, ''))
      const product = products.find((p) => p.sku.toUpperCase() === key || p.asin.toUpperCase() === key)
      if (parts.length >= 2 && product && Number.isFinite(cost) && cost > 0) next[product.asin] = String(cost)
      else skipped.push(line.slice(0, 40))
    }
    setEdits((prev) => ({ ...prev, ...next }))
    const n = Object.keys(next).length
    setNote(`Filled ${n} cost${n === 1 ? '' : 's'} from the pasted sheet - check them, then press Save.${skipped.length ? ` Could not use ${skipped.length} line${skipped.length === 1 ? '' : 's'}: ${skipped.slice(0, 3).join(' | ')}${skipped.length > 3 ? ' ...' : ''}` : ''}`)
    if (n > 0) setPaste('')
  }

  const needAttention = products?.filter((p) => p.cogs_status !== 'ok').length ?? 0

  return (
    <div>
      <PageHeader
        title="Products & COGS"
        subtitle={`Cost of goods per unit — the one number Amazon can't tell us. Flagged when older than ${staleAfter} days.`}
      />

      {!products ? (
        <div className="text-stone">Loading…</div>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-stone">
              {needAttention === 0 ? 'All products have an up-to-date COGS.' : `${needAttention} of ${products.length} products need a COGS.`}
            </span>
            <button
              onClick={save}
              disabled={saving || changed.length === 0}
              className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember disabled:opacity-50"
            >
              {saving ? 'Saving…' : changed.length > 0 ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Save'}
            </button>
          </div>
          {note && <div className="mb-3 text-xs text-stone">{note}</div>}

          <details className="mb-3 rounded-lg border border-sand px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink">Paste costs from Excel / Google Sheets</summary>
            <p className="mt-2 text-xs text-stone">One product per line: the SKU (or ASIN), then the cost per unit in ₹ — copy two columns straight from your sheet. This only fills the boxes below; you still press Save.</p>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={'TRCLHO100\t48\nTRNHO100\t52'}
              className="mt-2 w-full rounded-lg border border-sand px-2 py-1 font-mono text-xs"
            />
            <button onClick={applyPaste} disabled={!paste.trim()} className="mt-2 rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sand/40 disabled:opacity-50">Fill the boxes</button>
          </details>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-stone">
                <th className="py-1">Product</th><th>Price</th><th>COGS (₹/unit)</th><th>Status</th><th>Est. margin / unit</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const draft = edits[p.asin]
                const effective = draft !== undefined && draft !== '' ? Number(draft) : p.cogs
                const margin = p.price != null && effective != null && Number.isFinite(effective)
                  ? p.price - (p.fee_per_unit ?? p.price * feeRate) - (p.fee_per_unit != null ? 0 : shipping) - effective
                  : null
                const st = statusStyle[p.cogs_status]
                return (
                  <tr key={p.asin} className="border-t border-sand align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-xs text-stone">{p.sku}{p.sku === p.asin ? ' (SKU not known yet)' : ''}{p.fee_per_unit != null ? ` · FBA fees ₹${p.fee_per_unit.toFixed(0)}/unit` : ''}</div>
                    </td>
                    <td>{p.price != null ? `₹${p.price}` : '—'}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder={p.cogs != null ? String(p.cogs) : 'enter'}
                        value={draft ?? ''}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [p.asin]: e.target.value }))}
                        className="w-28 rounded-lg border border-sand px-2 py-1 text-sm"
                      />
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st.className}`}>{st.label}</span>
                      {p.cogs_age_days != null && <span className="ml-2 text-xs text-stone">{p.cogs_age_days}d ago</span>}
                    </td>
                    <td className={margin != null && margin < 0 ? 'font-semibold text-brick-dark' : ''}>
                      {margin != null ? `₹${margin.toFixed(0)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-stone">
            Margin = price − Amazon fees − shipping − your COGS. FBA listings use Seller Central's own per-unit fee (it already includes fulfilment); the others use the reference estimate — 18% fees plus ₹65 shipping — so treat those as approximate.
          </p>
        </Card>
      )}
    </div>
  )
}
