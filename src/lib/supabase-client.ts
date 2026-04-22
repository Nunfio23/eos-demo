/**
 * supabase-client.ts
 *
 * Punto de entrada unificado para el cliente Supabase.
 * Re-exporta el singleton existente y helpers de timeout.
 *
 * NOTA IMPORTANTE sobre el query builder de Supabase:
 * La API es chainable (PostgrestFilterBuilder) — no es un Promise simple
 * hasta que se hace await. Por eso withTimeout() se aplica en el punto
 * de await, no dentro del from():
 *
 *   const { data, error } = await withTimeout(
 *     supabase.from('profiles').select('*').eq('id', userId)
 *   )
 */

export { supabase, default } from '@/lib/supabase'
export { withTimeout } from '@/lib/db'

import { supabase } from '@/lib/supabase'

/**
 * Retorna el cliente Supabase singleton.
 */
export function createSupabaseClient() {
  return supabase
}

/**
 * Hook para usar Supabase en componentes client.
 * Retorna el singleton (no crea una nueva instancia por render).
 */
export function useSupabase() {
  return supabase
}

/**
 * Wrapper para queries con timeout automatico y normalizacion de errores.
 * Usa el mismo patron que withTimeout() de db.ts pero con interfaz mas limpia.
 *
 * @example
 * const { data, error } = await queryWithTimeout(
 *   () => supabase.from('profiles').select('*'),
 *   10000
 * )
 */
export async function queryWithTimeout<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown }>,
  timeoutMs = 10000
): Promise<{ data: T | null; error: Error | null }> {
  const timer = new Promise<{ data: null; error: Error }>((resolve) =>
    setTimeout(
      () => resolve({ data: null, error: new Error('La consulta a la base de datos tardo demasiado') }),
      timeoutMs
    )
  )

  try {
    const result = await Promise.race([
      queryFn() as Promise<{ data: T | null; error: unknown }>,
      timer,
    ])

    if (result.error) {
      const err = result.error
      return {
        data: null,
        error: err instanceof Error
          ? err
          : new Error(typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Error en la consulta'),
      }
    }

    return { data: result.data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Error desconocido'),
    }
  }
}
