import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// One-time migration: fix my_teacher_student_ids() to use teacher_assignments
// instead of the legacy class_schedules table.
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
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Only allow master role to run this
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'master') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.rpc('exec_sql', { sql: SQL })
  if (error) {
    // Try via raw query if exec_sql doesn't exist
    return NextResponse.json({ error: error.message, hint: 'Run SQL manually in Supabase dashboard' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
