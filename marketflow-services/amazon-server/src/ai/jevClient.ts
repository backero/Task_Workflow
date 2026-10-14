// TypeSafe/Jev AI client — replaces Claude for structured sales-manager predictions.
// Jev is TypeSafe's System One model (https://docs.typesafe.ai). It is NOT a chat/
// text-generation model: you send a block of text/JSON ("state") plus typed
// questions (Noul = yes/no probability, Choice = pick one option, Score = rate on
// an ordered rubric) and it returns typed values with confidence/probabilities,
// evaluated in parallel and in isolation against the same state. That's a better,
// cheaper fit for "what's right or wrong here" than a narrative model — see the
// sibling python-service/jev_client.py used by Meesho/Snapdeal/Flipkart.
//
// Uses the official @typesafe-ai/sdk package. Silently no-ops until
// TYPESAFE_API_KEY is set, matching how the old Claude path no-op'd without
// ANTHROPIC_API_KEY. Get a key at console.typesafe.ai/keys.
// Re-exports noul/choice/score so callers can build their own question sets
// without importing the SDK directly.

import { TypeSafeClient, noul, choice, score, type Questions } from '@typesafe-ai/sdk'

export { noul, choice, score }

const MODEL = process.env.TYPESAFE_DEFAULT_MODEL ?? 'jev-latest'

let client: TypeSafeClient | null = null
function getClient(): TypeSafeClient {
  if (!client) client = new TypeSafeClient()
  return client
}

export function isConfigured(): boolean {
  return !!process.env.TYPESAFE_API_KEY
}

export async function ask<Q extends Questions>(state: unknown, questions: Q): Promise<Record<string, unknown>> {
  if (!isConfigured()) throw new Error('TYPESAFE_API_KEY not set')
  const response = await getClient().systemOne({ model: MODEL, state: state as never, questions })
  const result: Record<string, unknown> = {}
  for (const [name, answer] of Object.entries(response.answers) as [string, { type: string; noul?: number; choice?: string; confidence?: number; score?: number }][]) {
    if (answer.type === 'noul') result[name] = { type: 'noul', noul: answer.noul }
    else if (answer.type === 'choice') result[name] = { type: 'choice', choice: answer.choice, confidence: answer.confidence }
    else if (answer.type === 'score') result[name] = { type: 'score', score: answer.score, confidence: answer.confidence }
  }
  return result
}
