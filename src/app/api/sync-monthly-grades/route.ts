import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Upserts monthly_grades records using service role, bypassing RLS.
// Teachers cannot write to monthly_grades directly (RLS restriction),
// so this endpoint allows them to sync their grade_entries summary.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { records } = body as {
    records: {
      teacher_assignment_id: string
      student_id: string
      school_year_id: string
      month: number
      week1_score: number | null
      week2_score: number | null
      lab_score: number | null
      exam_score: number | null
    }[]
  }

  if (!Array.isArray(records) || records.length === 0)
    return NextResponse.json({ error: 'No records' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.from('monthly_grades').upsert(records, {
    onConflict: 'teacher_assignment_id,student_id,month,school_year_id',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: records.length })
}
