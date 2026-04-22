'use client'
import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Hook estándar para páginas del dashboard.
 * - Previene loading infinito con safety timeout (default 15s)
 * - Expone estado de error y función retry
 *
 * Uso:
 *   const { loading, loadError, run } = usePageLoad()
 *   const load = useCallback(async () => { ...queries... }, [])
 *   useEffect(() => run(load), [run, load])
 */
export function usePageLoad(timeoutMs = 15000) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback((fn: () => Promise<void>) => {
    setLoading(true)
    setLoadError(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLoading(false), timeoutMs)
    fn()
      .catch((err) => {
        console.error('[usePageLoad]', err)
        setLoadError(true)
      })
      .finally(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setLoading(false)
      })
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [timeoutMs])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { loading, loadError, run }
}
