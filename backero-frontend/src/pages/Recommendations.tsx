import { useState } from 'react'
import { actOnRecommendation, getRecommendations, type Alert } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import AiText from '../components/AiText.tsx'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'

export default function Recommendations() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)

  function load() {
    getRecommendations('open').then(setAlerts)
  }

  useAutoRefresh(load, [])

  async function act(id: string, action: 'apply' | 'snooze' | 'dismiss') {
    await actOnRecommendation(id, action)
    load()
  }

  return (
    <div>
      <PageHeader title="Recommendations" subtitle="Problems come find you — with the fix attached" />
      {!alerts ? (
        <div className="text-stone">Loading…</div>
      ) : alerts.length === 0 ? (
        <Card>All clear — no open recommendations right now.</Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id} className={a.severity === 'red' ? 'border-l-4 border-l-brick' : 'border-l-4 border-l-amber'}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-ink">{a.title}</div>
                  <div className="mt-1 text-sm text-stone">{a.message}</div>
                  <div className="mt-2 text-sm"><span className="font-semibold">Suggested action:</span> {a.suggested_action}</div>
                  {a.ai_analysis ? (
                    <div className="mt-2 rounded-lg bg-clay/5 p-2 text-sm text-ink">
                      <div className="font-semibold text-ember">AI analysis</div>
                      <AiText text={a.ai_analysis} />
                    </div>
                  ) : (
                    <div className="mt-2 text-xs italic text-stone">AI analysis pending…</div>
                  )}
                  {a.evidence && (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-cream p-2 text-xs text-stone">{JSON.stringify(a.evidence, null, 2)}</pre>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => act(a.id, 'apply')} className="rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember">Apply</button>
                  <button onClick={() => act(a.id, 'snooze')} className="rounded-lg bg-sand px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sand/70">Snooze</button>
                  <button onClick={() => act(a.id, 'dismiss')} className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-stone hover:bg-sand/40">Dismiss</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
