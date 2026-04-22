import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function sanitize(val: unknown): string {
  if (typeof val !== 'string') return ''
  return val.trim().slice(0, 255)
}

function validUsername(u: string) {
  return /^[a-z0-9._-]{3,30}$/.test(u)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    // Verificar sesion con el JWT del usuario
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'No autenticado' }, 401)

    // Verificar permisos
    const { data: caller } = await userClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!caller?.is_active || !['master', 'administracion'].includes(caller.role)) {
      return json({ error: 'Sin permisos para importar' }, 403)
    }

    // Parsear body
    const { tipo, filas, replace } = await req.json()

    if (!tipo || !Array.isArray(filas) || filas.length === 0) {
      return json({ error: 'Datos incompletos' }, 400)
    }
    if (filas.length > 500) {
      return json({ error: 'Maximo 500 registros por importacion' }, 400)
    }

    // Cliente admin (service role) para todas las operaciones
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const resultados: { fila: number; estado: 'ok' | 'error'; mensaje?: string }[] = []

    // ─── MATERIAS ─────────────────────────────────────────────────────────────
    if (tipo === 'materias') {
      // Si modo reemplazo: borrar todos los grade_subjects primero
      // (teacher_assignments se borra en cascada, subject_catalog se preserva)
      if (replace) {
        const { error: delErr } = await adminClient.from('grade_subjects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (delErr) return json({ error: `Error al limpiar grade_subjects: ${delErr.message}` }, 500)
      }

      // Cargar todos los grados para hacer lookup por nombre
      const { data: gradesData } = await adminClient.from('grades').select('id, name')
      const gradeMap = new Map<string, string>() // name → id
      for (const g of (gradesData ?? [])) {
        gradeMap.set(g.name.trim().toLowerCase(), g.id)
      }

      for (let i = 0; i < filas.length; i++) {
        const raw = filas[i]
        const nombre = sanitize(raw.nombre)
        const codigo = sanitize(raw.codigo)
        const gradoNombre = sanitize(raw.grado)

        if (!nombre) {
          resultados.push({ fila: i + 1, estado: 'error', mensaje: 'Nombre es requerido' })
          continue
        }

        // Generar código si no viene
        const codigoFinal = codigo || nombre.toLowerCase().replace(/\s+/g, '-').slice(0, 30) + `-${i}`

        // Upsert en subject_catalog (en conflicto de código, actualizar nombre)
        const { data: catData, error: catErr } = await adminClient
          .from('subject_catalog')
          .upsert(
            { name: nombre, code: codigoFinal, description: sanitize(raw.descripcion) || null },
            { onConflict: 'code', ignoreDuplicates: false }
          )
          .select('id')
          .single()

        if (catErr || !catData) {
          resultados.push({ fila: i + 1, estado: 'error', mensaje: catErr?.message ?? 'Error en catálogo' })
          continue
        }

        // Si tiene grado, crear grade_subject
        if (gradoNombre) {
          const gradeId = gradeMap.get(gradoNombre.trim().toLowerCase())
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

      return json({ tipo, total: filas.length, resultados })
    }

    // ─── ESTUDIANTES / DOCENTES ───────────────────────────────────────────────
    const rolImportado = tipo === 'estudiantes' ? 'alumno' : 'docente'

    for (let i = 0; i < filas.length; i++) {
      const raw = filas[i]
      const nombre = sanitize(raw.nombre_completo)
      const username = sanitize(raw.usuario).toLowerCase()
      const password = sanitize(raw.contrasena)

      if (!nombre) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: 'Nombre completo es requerido' })
        continue
      }
      if (!username || !validUsername(username)) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: `Usuario invalido: "${username}"` })
        continue
      }
      if (!password || password.length < 6) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: 'Contrasena debe tener al menos 6 caracteres' })
        continue
      }

      const email = `${username}@teslaschool.app`

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (authError) {
        const yaExiste = authError.message?.toLowerCase().includes('already')
        resultados.push({
          fila: i + 1,
          estado: 'error',
          mensaje: yaExiste ? `Usuario ya existe: ${username}` : authError.message,
        })
        continue
      }

      const userId = authData.user?.id
      if (!userId) {
        resultados.push({ fila: i + 1, estado: 'error', mensaje: 'No se pudo obtener ID del usuario' })
        continue
      }

      const { error: profileError } = await adminClient.from('profiles').insert({
        id: userId,
        full_name: nombre,
        email,
        role: rolImportado,
        is_active: true,
        phone: raw.telefono ? sanitize(raw.telefono) : null,
      })

      if (profileError) {
        await adminClient.auth.admin.deleteUser(userId)
        resultados.push({ fila: i + 1, estado: 'error', mensaje: `Perfil: ${profileError.message}` })
        continue
      }

      if (tipo === 'estudiantes') {
        await adminClient.from('students').insert({
          user_id: userId,
          is_active: true,
        })
      } else {
        const { count } = await adminClient.from('teachers').select('*', { count: 'exact', head: true })
        const empNum = `DOC-${String((count ?? 0) + 1).padStart(3, '0')}`
        await adminClient.from('teachers').insert({
          user_id: userId,
          employee_number: empNum,
          is_active: true,
          specialization: sanitize(raw.especializacion) || null,
        })
      }

      resultados.push({ fila: i + 1, estado: 'ok' })
    }

    return json({ tipo, total: filas.length, resultados })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
