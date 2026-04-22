import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Fechas MINED que requieren recordatorio un día antes ─────────────────────
const MINED_DATES: { date: string; title: string; body: string }[] = [
  // CONOCIENDO MIS LOGROS
  { date: '2026-02-09', title: '📋 MINED mañana: Prueba Conociendo Mis Logros', body: 'Inicio de la prueba nacional Conociendo Mis Logros (9–20 Feb). Aseguren que los estudiantes estén preparados.' },
  // SIGES — Primer período Secundaria
  { date: '2026-04-23', title: '📋 MINED mañana: Registro SIGES — 1er Período Secundaria', body: 'Ventana de registro en SIGES del 1er período de Secundaria (23–24 Abr). Tengan las notas listas.' },
  // SIGES — Primer trimestre Primaria/Parvularia
  { date: '2026-05-07', title: '📋 MINED mañana: Registro SIGES — 1er Trimestre Primaria', body: 'Ventana de registro en SIGES del 1er trimestre de Primaria y Primera Infancia (7–8 May).' },
  // AVANZO Calendario Norte (bilingüe)
  { date: '2026-05-28', title: '📋 MINED mañana: Prueba AVANZO — Calendario Norte', body: 'Prueba AVANZO para colegios bilingües / calendario norte (28–29 May).' },
  // SIGES — Segundo período Secundaria
  { date: '2026-07-01', title: '📋 MINED mañana: Registro SIGES — 2do Período Secundaria', body: 'Ventana de registro en SIGES del 2do período de Secundaria (1–3 Jul). Tengan las notas listas.' },
  // SIGES — Segundo trimestre Primaria/Parvularia
  { date: '2026-08-13', title: '📋 MINED mañana: Registro SIGES — 2do Trimestre Primaria', body: 'Ventana de registro en SIGES del 2do trimestre de Primaria y Primera Infancia (13–14 Ago).' },
  // SIGES — Tercer período Secundaria
  { date: '2026-09-10', title: '📋 MINED mañana: Registro SIGES — 3er Período Secundaria', body: 'Ventana de registro en SIGES del 3er período de Secundaria (10–11 Sep). Tengan las notas listas.' },
  // AVANZO Ordinaria
  { date: '2026-10-28', title: '📋 MINED mañana: Prueba AVANZO Ordinaria', body: 'Prueba AVANZO Modalidad Ordinaria (28–29 Oct). Coordinar con docentes y estudiantes.' },
  // SIGES — Tercer trimestre Primaria/Parvularia
  { date: '2026-11-09', title: '📋 MINED mañana: Registro SIGES — 3er Trimestre Primaria', body: 'Ventana de registro en SIGES del 3er trimestre de Primaria y Primera Infancia (9–10 Nov).' },
  // AVANZO Extraordinaria
  { date: '2026-11-14', title: '📋 MINED mañana: Prueba AVANZO Extraordinaria', body: 'Prueba AVANZO Modalidad Extraordinaria (14–15 Nov) para estudiantes que no rindieron en la fecha ordinaria.' },
  // SIGES — Cuarto período Secundaria
  { date: '2026-11-16', title: '📋 MINED mañana: Registro SIGES — 4to Período Secundaria', body: 'Ventana de registro en SIGES del 4to período de Secundaria (16–17 Nov). Notas finales.' },
  // Matrícula 2027
  { date: '2026-11-16', title: '📋 MINED mañana: Apertura Matrícula 2027 en SIGES', body: 'Desde el 16 de noviembre abre la matrícula 2027 en el sistema SIGES.' },
]

export async function GET(request: Request) {
  // Verificar que viene de Vercel Cron (token de seguridad)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fecha de mañana (El Salvador: UTC-6)
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10) // YYYY-MM-DD

  // Buscar eventos MINED que ocurren mañana
  const todayEvents = MINED_DATES.filter(e => e.date === tomorrowStr)

  if (todayEvents.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, date: tomorrowStr })
  }

  // Obtener todos los usuarios con rol director/docente
  const { data: users, error: usersErr } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['master', 'direccion', 'docente'])
    .eq('is_active', true)

  if (usersErr || !users || users.length === 0) {
    return NextResponse.json({ error: 'No users found', detail: usersErr?.message }, { status: 500 })
  }

  // Crear una notificación por evento × usuario
  const rows: { user_id: string; title: string; body: string; type: string; event_date: string }[] = []
  for (const ev of todayEvents) {
    for (const user of users) {
      // Evitar duplicados: no insertar si ya existe para este usuario/título/fecha
      rows.push({
        user_id: user.id,
        title: ev.title,
        body: ev.body,
        type: 'mined_reminder',
        event_date: ev.date,
      })
    }
  }

  // Insertar (ignorar duplicados por upsert no aplica aquí — simplemente insertar)
  const { error: insertErr } = await supabase.from('notifications').insert(rows)

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    sent: rows.length,
    events: todayEvents.map(e => e.title),
    date: tomorrowStr,
  })
}
