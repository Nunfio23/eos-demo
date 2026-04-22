import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const runtime = 'nodejs'

const SQL = `
CREATE OR REPLACE FUNCTION public.my_teacher_student_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT e.student_id
  FROM public.teacher_assignments ta
  JOIN public.enrollments e ON e.section_id = ta.section_id
  WHERE ta.teacher_id = public.my_teacher_id()
    AND ta.is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
`

export async function POST(req: NextRequest) {
  // Solo master puede ejecutar esto
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'master') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Usar la URL de conexión directa de postgres (Vercel la expone)
  const connStr = process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'POSTGRES_URL_NON_POOLING no configurado' }, { status: 500 })

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  try {
    await pool.query(SQL)
    return NextResponse.json({ ok: true, message: 'Función RLS actualizada correctamente' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    await pool.end()
  }
}
