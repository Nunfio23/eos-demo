/**
 * Ejecuta una query de Supabase con un timeout máximo.
 * Si el timeout expira, retorna { data: null, error: timeout_error }.
 * Evita spinners infinitos cuando Supabase está despertando (free tier).
 */
export async function withTimeout<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
  ms = 12000
): Promise<{ data: T | null; error: unknown; timedOut?: boolean }> {
  const timer = new Promise<{ data: null; error: string; timedOut: true }>(
    (resolve) => setTimeout(() => resolve({ data: null, error: 'timeout', timedOut: true }), ms)
  )
  return Promise.race([query as Promise<{ data: T | null; error: unknown }>, timer])
}
