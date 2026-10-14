import { useState } from 'react'
import { getKeywordBoard } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import DataQualityBadge from '../components/DataQualityBadge.tsx'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'

type Share = { date: string; top_n: number; organic_results: number; own_organic: number; sponsored_results: number; own_sponsored: number }

type BoardRow = {
  keyword: string
  is_hero_target: boolean
  share_of_search: Share | null
  share_of_search_prev: { own_organic: number; organic_results: number } | null
  results: { asin: string; name: string; is_own: boolean; organic_rank: number | null; prev_organic_rank: number | null; sponsored_rank: number | null; data_quality: string }[]
}

export default function KeywordBoard() {
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)

  useAutoRefresh(() => {
    getKeywordBoard().then((res) => {
      setBoard(res.board)
      setAsOf(res.as_of)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Keyword Board" subtitle={asOf ? `Search rank as of ${asOf} — teal is you, pink is a rival. "Ad #n" is a sponsored placement.` : ''} />
      {!board ? (
        <div className="text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {board.map((row) => (
            <Card key={row.keyword}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold text-gray-900">{row.keyword}</span>
                {row.is_hero_target && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">HERO TARGET</span>}
                {row.results.length > 0 && <DataQualityBadge quality={row.results.some((r) => r.data_quality === 'estimate') ? 'estimate' : 'observed'} />}
              </div>
              {row.share_of_search && (
                <div className="mb-2 text-xs text-gray-400">
                  Share of search: <span className="font-semibold text-gray-900">{row.share_of_search.own_organic} of the top {row.share_of_search.organic_results} organic results</span>
                  {row.share_of_search.organic_results > 0 && ' (' + Math.round((row.share_of_search.own_organic / row.share_of_search.organic_results) * 100) + '%)'}
                  {row.share_of_search.sponsored_results > 0 && ' · ' + row.share_of_search.own_sponsored + ' of ' + row.share_of_search.sponsored_results + ' sponsored slots'}
                  {row.share_of_search_prev && row.share_of_search_prev.organic_results > 0 && ' · was ' + row.share_of_search_prev.own_organic + ' of ' + row.share_of_search_prev.organic_results + ' a few days ago'}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {row.results.length === 0 && <span className="text-sm text-gray-400">No rank data yet.</span>}
                {[...row.results].sort((a, b) => (a.organic_rank ?? 9999) - (b.organic_rank ?? 9999)).map((r) => {
                  const movement = r.prev_organic_rank != null && r.organic_rank != null ? r.prev_organic_rank - r.organic_rank : null
                  return (
                    <div
                      key={r.asin}
                      className={`rounded-lg px-3 py-2 text-sm ${r.is_own ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                      title={r.name}
                    >
                      <div className="font-semibold">{r.organic_rank != null ? `#${r.organic_rank}` : 'Ad only'}</div>
                      <div className="max-w-[160px] truncate text-xs">{r.name}</div>
                      {r.sponsored_rank != null && <div className="text-[10px]">Ad #{r.sponsored_rank}</div>}
                      {movement != null && movement !== 0 && (
                        <div className="text-[10px]">{movement > 0 ? `▲ +${movement}` : `▼ ${movement}`}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
