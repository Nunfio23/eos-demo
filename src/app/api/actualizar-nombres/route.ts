import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autenticado', 401)

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) return err('No autenticado', 401)

    const { data: caller } = await anonClient
      .from('profiles').select('role, is_active').eq('id', user.id).single()

    if (!caller?.is_active || !['master', 'administracion'].includes(caller.role)) {
      return err('Sin permisos', 403)
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { filas } = await req.json()
    if (!Array.isArray(filas) || filas.length === 0) return err('Sin datos')
    if (filas.length > 500) return err('Máximo 500 por lote')

    const resultados: { fila: number; estado: 'ok' | 'error'; mensaje?: string }[] = []

    for (let i = 0; i < filas.length; i++) {
      const raw = filas[i]
      const usuario = String(raw.usuario ?? '').trim().toLowerCase()
      const nombre  = String(raw.nombre_completo ?? '').trim()

      if (!usuario || !nombre) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: 'Usuario y Nombre Completo son requeridos' })
        continue
      }

      const email = `${usuario}@eos-school.app`

      const { error: updateErr } = await adminClient
        .from('profiles')
        .update({ full_name: nombre })
        .eq('email', email)

      if (updateErr) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: updateErr.message })
      } else {
        resultados.push({ fila: i + 1, estado: 'ok' })
      }
    }

    return NextResponse.json({ total: filas.length, resultados })
  } catch (e) {
    return err(String(e), 500)
  }
}
