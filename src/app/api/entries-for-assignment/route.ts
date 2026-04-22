import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Triple-source grade entries for Libro de Notas:
// 1. grade_entries  (entered directly in Libro de Notas)
// 2. monthly_grades (synced from either source)
// 3. calificaciones_notas (fallback when sync hasn't run yet)
// Uses service role to bypass RLS.

const MONTH_TO_TRIM: Record<number, { trimestre: string; mesLocal: number }> = {
  2:  { trimestre: '1er Trimestre', mesLocal: 1 },
  3:  { trimestre: '1er Trimestre', mesLocal: 2 },
  4:  { trimestre: '1er Trimestre', mesLocal: 3 },
  5:  { trimestre: '2do Trimestre', mesLocal: 1 },
  6:  { trimestre: '2do Trimestre', mesLocal: 2 },
  7:  { trimestre: '2do Trimestre', mesLocal: 3 },
  8:  { trimestre: '3er Trimestre', mesLocal: 1 },
  9:  { trimestre: '3er Trimestre', mesLocal: 2 },
  10: { trimestre: '3er Trimestre', mesLocal: 3 },
}
const TIPO_TO_WT = ['week1', 'week2', 'labs', 'exams'] as const

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assignmentId = searchParams.get('assignmentId')
  const month        = parseInt(searchParams.get('month') ?? '0')
  const schoolYearId = searchParams.get('schoolYearId')

  if (!assignmentId || !month || !schoolYearId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Auth check
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get assignment details (section_id + subject_catalog_id)
  const { data: ta } = await admin
    .from('teacher_assignments')
    .select('section_id, grade_subject_id')
    .eq('id', assignmentId)
    .single()

  if (!ta) return NextResponse.json([])

  const { data: gs } = await admin
    .from('grade_subjects')
    .select('subject_catalog_id')
    .eq('id', ta.grade_subject_id)
    .single()

  const subjectCatalogId = gs?.subject_catalog_id ?? null

  // 1. grade_entries
  const { data: geRows } = await admin
    .from('grade_entries')
    .select('student_id, week_type, score, is_locked')
    .eq('teacher_assignment_id', assignmentId)
    .eq('month', month)
    .eq('school_year_id', schoolYearId)

  const entries: { student_id: string; week_type: string; score: number; is_locked: boolean; source: string }[] = []
  for (const e of (geRows ?? [])) {
    entries.push({ student_id: e.student_id, week_type: e.week_type, score: parseFloat(e.score), is_locked: e.is_locked ?? false, source: 'grade_entries' })
  }

  const hasEntry = (sid: string, wt: string) => entries.some(e => e.student_id === sid && e.week_type === wt)

  // 2. monthly_grades → synthetic entries
  const { data: mgRows } = await admin
    .from('monthly_grades')
    .select('student_id, week1_score, week2_score, lab_score, exam_score, is_locked')
    .eq('teacher_assignment_id', assignmentId)
    .eq('month', month)
    .eq('school_year_id', schoolYearId)

  const mgFieldMap: [string, string][] = [
    ['week1', 'week1_score'], ['week2', 'week2_score'],
    ['labs', 'lab_score'],   ['exams', 'exam_score'],
  ]
  for (const mg of (mgRows ?? [])) {
    for (const [wt, field] of mgFieldMap) {
      if ((mg as any)[field] != null && !hasEntry(mg.student_id, wt)) {
        entries.push({
          student_id: mg.student_id, week_type: wt,
          score: parseFloat((mg as any)[field]),
          is_locked: mg.is_locked ?? false, source: 'monthly_grades',
        })
      }
    }
  }

  // 3. calificaciones_notas → fallback when monthly_grades had no data
  if (subjectCatalogId) {
    const calMap = MONTH_TO_TRIM[month]
    if (calMap) {
      const { trimestre, mesLocal } = calMap
      const semanaStart = (mesLocal - 1) * 4 + 1
      const semanas = [semanaStart, semanaStart + 1, semanaStart + 2, semanaStart + 3]

      const { data: cnRows } = await admin
        .from('calificaciones_notas')
        .select('student_id, semana, score')
        .eq('section_id', ta.section_id)
        .eq('school_year_id', schoolYearId)
        .eq('subject_id', subjectCatalogId)
        .eq('trimestre', trimestre)
        .in('semana', semanas)

      for (const cn of (cnRows ?? [])) {
        const tipoIdx = (cn.semana - 1) % 4
        const wt = TIPO_TO_WT[tipoIdx]
        if (!hasEntry(cn.student_id, wt)) {
          entries.push({
            student_id: cn.student_id, week_type: wt,
            score: parseFloat(cn.score),
            is_locked: false, source: 'calificaciones_notas',
          })
        }
      }
    }
  }

  return NextResponse.json(entries)
}
