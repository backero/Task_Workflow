import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const useDebounce = (fn, delay) => {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

const SearchBar = () => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const inputRef = useRef(null)

  const doSearch = async (q) => {
    if (!q || q.trim().length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(q.trim())}`)
      setResults(data.data)
    } catch {
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const debouncedSearch = useDebounce(doSearch, 300)

  useEffect(() => { debouncedSearch(query) }, [query])

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const hasResults = results && (results.tasks?.length > 0 || results.projects?.length > 0)

  const PRIORITY_COLOR = { LOW: 'text-green-500', MEDIUM: 'text-blue-500', HIGH: 'text-orange-500', URGENT: 'text-red-500' }

  return (
    <div className="relative w-full max-w-sm" ref={ref}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tasks & projects… (Ctrl+K)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden max-h-80 overflow-y-auto">
          {!hasResults && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results for "{query}"</div>
          ) : (
            <>
              {results?.projects?.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase bg-gray-50">Projects</p>
                  {results.projects.map((p) => (
                    <button
                      key={p._id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                      onClick={() => { navigate(`/projects/${p._id}`); setOpen(false); setQuery('') }}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                      <span className="text-sm font-medium text-gray-800 truncate">{p.title}</span>
                      <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{p.taskCount ?? 0} tasks</span>
                    </button>
                  ))}
                </div>
              )}
              {results?.tasks?.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase bg-gray-50">Tasks</p>
                  {results.tasks.map((t) => (
                    <button
                      key={t._id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                      onClick={() => { navigate(`/projects/${t.projectId?._id || t.projectId}`); setOpen(false); setQuery('') }}
                    >
                      <span className={`text-xs font-bold w-4 flex-shrink-0 ${PRIORITY_COLOR[t.priority]}`}>!</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                        {t.projectId?.title && <p className="text-xs text-gray-400 truncate">{t.projectId.title}</p>}
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        {t.status.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBar
