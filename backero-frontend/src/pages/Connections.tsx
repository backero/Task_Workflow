import { useRef, useState } from 'react'
import { getConnections, saveCredentials, syncConnection, importBusinessReportCsv, type Connection } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import StatusDot from '../components/StatusDot.tsx'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'

const sourceLabels: Record<string, string> = {
  edge_agent: 'Edge Agent (dedicated laptop)',
  spapi: 'Amazon SP-API',
  ads_api: 'Amazon Advertising API',
}

const statusColor: Record<Connection['status'], 'green' | 'amber' | 'red'> = {
  healthy: 'green',
  needs_reauth: 'amber',
  not_connected: 'amber',
  error: 'red',
}

function ConnectForm({ source, onSaved }: { source: 'spapi' | 'ads_api'; onSaved: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function submit() {
    if (!token.trim() || !clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    try {
      const res = await saveCredentials(source, {
        refresh_token: token.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      })
      setNote(res.note ?? 'Saved.')
      setToken('')
      setClientSecret('')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <input
        type="text"
        placeholder="LWA Client ID"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="rounded-lg border border-sand px-3 py-1.5 text-sm"
      />
      <input
        type="password"
        placeholder="LWA Client Secret"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        className="rounded-lg border border-sand px-3 py-1.5 text-sm"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="password"
          placeholder="Paste self-authorized refresh token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-sm"
        />
        <button
          onClick={submit}
          disabled={saving || !token.trim() || !clientId.trim() || !clientSecret.trim()}
          className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save credentials'}
        </button>
      </div>
      {note && <span className="text-xs text-stone">{note}</span>}
    </div>
  )
}

function SyncButton({ source, onSynced }: { source: 'spapi' | 'ads_api'; onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await syncConnection(source)
      if (res.skipped) setResult(`Skipped: ${res.reason}`)
      else if (res.ok) setResult('Synced successfully.')
      else setResult(`Failed: ${res.error}`)
      onSynced()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        onClick={run}
        disabled={syncing}
        className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sand/40 disabled:opacity-50"
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
      {result && <span className="text-xs text-stone">{result}</span>}
    </div>
  )
}

function BusinessReportImport() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => setCsvText(reader.result as string)
    reader.readAsText(file)
  }

  async function submit() {
    if (!csvText || !fromDate || !toDate) return
    setImporting(true)
    setResult(null)
    try {
      const res = await importBusinessReportCsv(csvText, fromDate, toDate)
      if (res.error) setResult(`Failed: ${res.error}`)
      else setResult(`Imported ${res.rows_parsed} rows (${res.accepted} accepted, ${res.rejected} rejected).`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-ink">Business Report import</h2>
      <p className="text-xs text-stone">
        Fallback for when SP-API isn't wired up yet (Design Doc §3.4). In Seller Central go to Reports → Business Reports →
        Detail Page Sales and Traffic — By ASIN, pick a date range, click "Download (.csv)", and drop the file in here. Range
        totals are spread evenly across the days in that range, so tighter ranges give a closer approximation of daily figures.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-sand px-3 py-1.5 text-sm" />
        <span className="text-xs text-stone">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-sand px-3 py-1.5 text-sm" />
        <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileChange} className="text-xs" />
        <button
          onClick={submit}
          disabled={importing || !csvText || !fromDate || !toDate}
          className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
      {fileName && <p className="mt-1 text-xs text-stone">Selected: {fileName}</p>}
      {result && <p className="mt-1 text-xs text-stone">{result}</p>}
    </Card>
  )
}

export default function Connections() {
  const [connections, setConnections] = useState<Connection[] | null>(null)

  function load() {
    getConnections().then(setConnections)
  }
  useAutoRefresh(load, [])

  return (
    <div>
      <PageHeader title="Connections" subtitle="Robo's heartbeat and where numbers are coming from" />
      {!connections ? (
        <div className="text-stone">Loading…</div>
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <Card key={c.source}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={c.health?.state === 'silent' ? 'red' : statusColor[c.status]} />
                  <span className="font-semibold text-ink">{sourceLabels[c.source] ?? c.source}</span>
                </div>
                <span className="text-xs uppercase tracking-wide text-stone">{(c.health?.state ?? c.status).replace('_', ' ')}</span>
              </div>
              <div className="mt-1 text-xs text-stone">
                {c.last_seen_at ? `Last seen ${new Date(c.last_seen_at).toLocaleString()}` : 'Never connected'}
                {c.last_error && <span className="text-brick-dark"> · {c.last_error}</span>}
                {c.health?.state === 'silent' && c.health.message && <span className="text-brick-dark"> · {c.health.message}</span>}
              </div>

              {(c.source === 'spapi' || c.source === 'ads_api') && (
                <>
                  <p className="mt-2 text-xs text-stone">
                    Self-authorize a private app in Seller Central (Design Doc §3.2 / Addendum v1.1 Option C), then paste its
                    Client ID, Client Secret and refresh token below. Runs automatically once a day — use "Sync now" to fetch
                    immediately.
                  </p>
                  <ConnectForm source={c.source as 'spapi' | 'ads_api'} onSaved={load} />
                  {c.has_credentials && <SyncButton source={c.source as 'spapi' | 'ads_api'} onSynced={load} />}
                </>
              )}
            </Card>
          ))}

          <BusinessReportImport />
        </div>
      )}
    </div>
  )
}
