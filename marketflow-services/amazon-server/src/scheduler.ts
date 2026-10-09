import { runSpapiPoller } from './pollers/spapiPoller.js'
import { runAdsPoller } from './pollers/adsPoller.js'
import { checkRoboHealth } from './health.js'
import { runAllProcessors } from './processors/settlement-parser.js'
import { runCrossPlatformAnalytics } from './processors/platform-analytics.js'
import { generateProfitabilityInsights, generateAutomatedAlerts } from './processors/ai-insights.js'
import { runDataCollectors } from './processors/data-collectors.js'
import { runAllPlatformProfitability } from './processors/platform-profitability.js'
import { runAllPlatformAlerts } from './processors/platform-alerts.js'
import { runTrendCapture } from './processors/trend-analytics.js'
import { captureUnifiedPlatformSnapshot } from './processors/unified-snapshot.js'
import { runAIAnalysisEngine } from './processors/ai-analysis-engine.js'
import { generateRecommendations } from './processors/recommendations-engine.js'
import { monitorDataQuality } from './processors/data-quality-monitor.js'

// Design Doc §5 calls for a daily cadence per collector; overridable for local testing
// (e.g. POLL_INTERVAL_MS=60000 to see a sync happen without waiting a day).
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 24 * 60 * 60 * 1000)
const PROCESSOR_INTERVAL_MS = Number(process.env.PROCESSOR_INTERVAL_MS ?? 4 * 60 * 60 * 1000) // 4 hours
const FIRST_RUN_DELAY_MS = 15_000

async function runAllPollers() {
  const spapi = await runSpapiPoller().catch((err) => ({ ok: false as const, error: String(err) }))
  if (!('skipped' in spapi)) console.log('[spapi-poller]', JSON.stringify(spapi))

  const ads = await runAdsPoller().catch((err) => ({ ok: false as const, error: String(err) }))
  if (!('skipped' in ads)) console.log('[ads-poller]', JSON.stringify(ads))
}

// Each step here is independent (reads/writes its own tables), so one broken or half-finished
// step (e.g. settlement-parser against an empty fact_order) must not stop the others from
// running - that was previously aborting trend capture and the unified snapshot too, which do
// have real data to process.
function runStep<T>(label: string, fn: () => T): T | undefined {
  try {
    const result = fn()
    console.log(`[scheduler] ${label}:`, result)
    return result
  } catch (err) {
    console.error(`[scheduler] ${label} FAILED:`, err instanceof Error ? err.message : err)
    return undefined
  }
}

async function runAsyncStep<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn()
    console.log(`[scheduler] ${label}:`, result)
    return result
  } catch (err) {
    console.error(`[scheduler] ${label} FAILED:`, err instanceof Error ? err.message : err)
    return undefined
  }
}

async function runProcessors() {
  runStep('Data collectors completed', runDataCollectors)
  runStep('Amazon processors', runAllProcessors)
  runStep('Cross-platform analytics', runCrossPlatformAnalytics)
  runStep('Platform profitability', runAllPlatformProfitability)
  await runAsyncStep('Amazon alerts', generateAutomatedAlerts)
  await runAsyncStep('Platform alerts', runAllPlatformAlerts)
  runStep('Trends captured', runTrendCapture)
  runStep('Unified snapshot', captureUnifiedPlatformSnapshot)
  runStep('Data quality checked', monitorDataQuality)
  runStep('AI analysis completed', runAIAnalysisEngine)
  runStep('Recommendations generated', generateRecommendations)

  // Genuinely fire-and-forget (calls an LLM) - unlike the rest above, worth letting run past
  // this tick instead of awaiting, but still must not throw unhandled.
  generateProfitabilityInsights().then(result => {
    if (result.success) console.log('[scheduler] AI insights generated successfully')
    else if (String(result.error).includes('credit balance is too low')) console.log('[scheduler] AI insights paused: Anthropic credit is used up (all numbers and rule-based insights are unaffected)')
    else console.error('[scheduler] AI insights failed:', result.error)
  }).catch(err => console.error('[scheduler] AI insights error:', err))
}

export function startScheduler() {
  setTimeout(runAllPollers, FIRST_RUN_DELAY_MS)
  setInterval(runAllPollers, POLL_INTERVAL_MS)

  // Run profitability processors every 6 hours
  setTimeout(runProcessors, FIRST_RUN_DELAY_MS + 5_000)
  setInterval(runProcessors, PROCESSOR_INTERVAL_MS)

  // Is Robo still reporting? Cheap local check, so every 10 minutes.
  setTimeout(() => void checkRoboHealth(), 60_000)
  setInterval(() => void checkRoboHealth(), 10 * 60_000)
}
