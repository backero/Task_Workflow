import { useEffect, useRef } from 'react'

/**
 * Like useEffect, but re-runs the callback on an interval so pages reflect
 * new data from Robo's next scrape without a manual page reload.
 */
export function useAutoRefresh(callback: () => void, deps: unknown[] = [], intervalMs = 60_000) {
  const savedCallback = useRef(callback)
  savedCallback.current = callback

  useEffect(() => {
    savedCallback.current()
    const id = setInterval(() => savedCallback.current(), intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
