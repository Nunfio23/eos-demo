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
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!caller?.is_active || !['master', 'administracion'].includes(caller.role)) {
      return err('Sin permisos para importar', 403)
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { filas, replace } = await req.json()

    if (!Array.isArray(filas) || filas.length === 0) return err('Sin datos')
    if (filas.length > 500) return err('Máximo 500 registros por importación')

    // Modo reemplazo: borrar todas las asignaciones grado→materia
    if (replace) {
      const { error: delErr } = await adminClient
        .from('grade_subjects')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (delErr) return err(`Error al limpiar grade_subjects: ${delErr.message}`, 500)
    }

    // Cargar mapa de grados (nombre → id)
    const { data: gradesData } = await adminClient.from('grades').select('id, name')
    const gradeMap = new Map<string, string>()
    for (const g of (gradesData ?? [])) {
      gradeMap.set(g.name.trim().toLowerCase(), g.id)
    }

    const resultados: { fila: number; estado: 'ok' | 'error'; mensaje?: string }[] = []

    for (let i = 0; i < filas.length; i++) {
      const raw = filas[i]
      const nombre = String(raw.nombre ?? '').trim().slice(0, 255)
      const codigo = String(raw.codigo ?? '').trim().slice(0, 30)
      const gradoNombre = String(raw.grado ?? '').trim()

      if (!nombre) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: 'Nombre es requerido' })
        continue
      }

      // Código autogenerado si no viene
      const codigoFinal = codigo || nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 25) + `-${i}`

      // Upsert en subject_catalog
      const { data: catData, error: catErr } = await adminClient
        .from('subject_catalog')
        .upsert(
          { name: nombre, code: codigoFinal },
          { onConflict: 'code', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      if (catErr || !catData) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: catErr?.message ?? 'Error en catálogo' })
        continue
      }

      // Vincular a grado si viene
      if (gradoNombre) {
        const gradeId = gradeMap.get(gradoNombre.toLowerCase())
        if (!gradeId) {
          resultados.push({ fila: i + 1, estado: 'error', mensaje: `Grado no encontrado: "${gradoNombre}"` })
          continue
        }

        const { error: gsErr } = await adminClient
          .from('grade_subjects')
          .upsert(
            { grade_id: gradeId, subject_catalog_id: catData.id, sort_order: i },
            { onConflict: 'grade_id,subject_catalog_id', ignoreDuplicates: true }
          )

        if (gsErr) {
          resultados.push({ fila: i + 1, estado: 'error', mensaje: gsErr.message })
          continue
        }
      }

      resultados.push({ fila: i + 1, estado: 'ok' })
    }

    return NextResponse.json({ total: filas.length, resultados })
  } catch (e) {
    return err(String(e), 500)
  }
}
