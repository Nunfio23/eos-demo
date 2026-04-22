'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface UseDataOptions {
  enabled?: boolean
  refetchInterval?: number
  onSuccess?: (data: unknown) => void
  onError?: (error: Error) => void
}

interface UseDataReturn<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => void
  isRefetching: boolean
}

/**
 * Hook para fetching seguro de datos desde Supabase.
 * - Incluye safety timeout de 15s para evitar loading infinito.
 * - Limpia subscripciones al desmontar el componente.
 * - Usa el singleton de supabase (no crea instancias por render).
 */
export function useData<T = unknown>(
  table: string,
  query?: string,
  options: UseDataOptions = {}
): UseDataReturn<T> {
  const { enabled = true, refetchInterval, onSuccess, onError } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let isMounted = true
    let intervalId: ReturnType<typeof setInterval> | null = null

    async function fetchData() {
      try {
        if (!data) {
          setLoading(true)
        } else {
          setIsRefetching(true)
        }
        setError(null)

        // Safety timeout de 15s para evitar loading infinito
        const safetyTimer = setTimeout(() => {
          if (isMounted) {
            setLoading(false)
            setIsRefetching(false)
          }
        }, 15000)

        const { data: result, error: fetchError } = await supabase
          .from(table as keyof (typeof supabase)['from'] extends (t: infer T) => unknown ? T : string)
          .select(query ?? '*')

        clearTimeout(safetyTimer)

        if (!isMounted) return

        if (fetchError) {
          throw new Error(`Error en tabla ${table}: ${fetchError.message}`)
        }

        setData(result as T)
        onSuccess?.(result)
      } catch (err) {
        if (!isMounted) return
        const errorObj =
          err instanceof Error ? err : new Error('Error desconocido al cargar datos')
        setError(errorObj)
        onError?.(errorObj)
        if (process.env.NODE_ENV === 'development') {
          console.error(`[useData] Error en tabla ${table}:`, errorObj)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
          setIsRefetching(false)
        }
      }
    }

    fetchData()

    if (refetchInterval && refetchInterval > 0) {
      intervalId = setInterval(fetchData, refetchInterval)
    }

    return () => {
      isMounted = false
      if (intervalId) clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, query, enabled, refetchTrigger, refetchInterval])

  return { data, loading, error, refetch, isRefetching }
}

/**
 * Hook para fetching con filtros clave=valor dinámicos.
 */
export function useDataWithFilters<T = unknown>(
  table: string,
  filters?: Record<string, string | number | boolean | null>,
  options: UseDataOptions = {}
): UseDataReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isRefetching, setIsRefetching] = useState(false)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1)
  }, [])

  // Serializar filtros para el dep array (JSON.stringify es intencional aquí)
  const filtersKey = JSON.stringify(filters ?? {})

  useEffect(() => {
    if (options.enabled === false) {
      setLoading(false)
      return
    }

    let isMounted = true

    async function fetchData() {
      try {
        if (!data) {
          setLoading(true)
        } else {
          setIsRefetching(true)
        }
        setError(null)

        const safetyTimer = setTimeout(() => {
          if (isMounted) {
            setLoading(false)
            setIsRefetching(false)
          }
        }, 15000)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase.from(table as any).select('*')

        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              q = q.eq(key, value)
            }
          }
        }

        const { data: result, error: fetchError } = await q

        clearTimeout(safetyTimer)

        if (!isMounted) return

        if (fetchError) throw new Error(fetchError.message)

        setData(result as T)
        options.onSuccess?.(result)
      } catch (err) {
        if (!isMounted) return
        const errorObj = err instanceof Error ? err : new Error('Error desconocido')
        setError(errorObj)
        options.onError?.(errorObj)
        if (process.env.NODE_ENV === 'development') {
          console.error(`[useDataWithFilters] Error en tabla ${table}:`, errorObj)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
          setIsRefetching(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filtersKey, refetchTrigger])

  return { data, loading, error, refetch, isRefetching }
}
