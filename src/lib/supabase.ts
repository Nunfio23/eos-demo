import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// createBrowserClient maneja su propio estado interno de sesión via cookies
// Llamarlo múltiples veces es seguro — siempre retorna una instancia con la sesión activa
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default supabase
