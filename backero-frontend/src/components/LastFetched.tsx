function fmtExact(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtRelative(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000
  if (Number.isNaN(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 120) return `${Math.round(mins)} min ago`
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} days ago`
}

/** A single, consistent "when did the robo last actually fetch real data" readout - exact date+time plus a
    relative hint, so the owner can cross-check freshness against the clock without doing the math themselves. */
export default function LastFetched({ label, iso }: { label: string; iso: string | null | undefined }) {
  if (!iso) {
    return (
      <p className="text-xs text-stone">
        <span className="font-medium text-ink">{label}:</span> never fetched yet
      </p>
    )
  }
  return (
    <p className="text-xs text-stone">
      <span className="font-medium text-ink">{label}:</span> {fmtExact(iso)} <span>({fmtRelative(iso)})</span>
    </p>
  )
}
