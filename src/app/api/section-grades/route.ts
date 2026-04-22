import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Returns aggregated monthly grade data for ALL teacher_assignments in a section.
// Uses service role to bypass RLS (teachers cannot write to monthly_grades,
// so we must read from grade_entries as the source of truth).
// Falls back: grade_entries → monthly_grades → calificaciones_notas
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sectionId    = searchParams.get('sectionId')
  const schoolYearId = searchParams.get('schoolYearId')
  const monthsParam  = searchParams.get('months') // comma-separated e.g. "3" or "2,3"

  if (!sectionId || !schoolYearId || !monthsParam)
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const months = monthsParam.split(',').map(Number).filter(Boolean)
  if (months.length === 0)
    return NextResponse.json({ error: 'Invalid months' }, { status: 400 })

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

  // Get all teacher_assignments for the section (no school_year filter — grades may
  // exist under assignments created in a different year; grade data is still filtered
  // by schoolYearId below so we never mix up actual grade values)
  const { data: tasFull } = await admin
    .from('teacher_assignments')
    .select('id, grade_subject_id')
    .eq('section_id', sectionId)
    .neq('is_active', false)

  // Also scan monthly_grades directly for students enrolled in this section,
  // to catch any grades linked to assignments not yet found above
  const { data: enrollRows } = await admin
    .from('enrollments')
    .select('student_id')
    .eq('section_id', sectionId)
    .eq('school_year_id', schoolYearId)
    .neq('status', 'inactive')

  const enrolledStudentIds = (enrollRows ?? []).map((e: any) => e.student_id)
  let extraTAs: { id: string; grade_subject_id: string }[] = []
  if (enrolledStudentIds.length > 0) {
    const { data: mgTARows } = await admin
      .from('monthly_grades')
      .select('teacher_assignment_id')
      .in('student_id', enrolledStudentIds)
      .in('month', months)
      .eq('school_year_id', schoolYearId)

    const knownIds = new Set((tasFull ?? []).map((t: any) => t.id))
    const extraIds = [...new Set((mgTARows ?? []).map((r: any) => r.teacher_assignment_id).filter(Boolean))]
      .filter(id => !knownIds.has(id))

    if (extraIds.length > 0) {
      const { data: extraTARows } = await admin
        .from('teacher_assignments')
        .select('id, grade_subject_id')
        .in('id', extraIds)
      extraTAs = extraTARows ?? []
    }
  }

  const tas = [...(tasFull ?? []), ...extraTAs]
  if (tas.length === 0) return NextResponse.json([])

  const assignmentIds = tas.map((t: any) => t.id)

  // Map assignment → subject_catalog_id for calificaciones_notas fallback
  const gsIds = [...new Set(tas.map((t: any) => t.grade_subject_id).filter(Boolean))]
  const gsMap = new Map<string, string>() // grade_subject_id → subject_catalog_id
  if (gsIds.length > 0) {
    const { data: gsRows } = await admin
      .from('grade_subjects')
      .select('id, subject_catalog_id')
      .in('id', gsIds)
    for (const gs of (gsRows ?? [])) gsMap.set(gs.id, gs.subject_catalog_id)
  }

  // Result: keyed by `${teacher_assignment_id}|${student_id}|${month}`
  type GradeKey = string
  const result = new Map<GradeKey, {
    teacher_assignment_id: string
    student_id: string
    month: number
    week1_score: number | null
    week2_score: number | null
    lab_score: number | null
    exam_score: number | null
    final_score: number | null
  }>()

  const key = (taId: string, sid: string, m: number) => `${taId}|${sid}|${m}`

  // ── 1. grade_entries (primary source) ─────────────────────────
  const { data: geRows } = await admin
    .from('grade_entries')
    .select('teacher_assignment_id, student_id, month, week_type, score')
    .in('teacher_assignment_id', assignmentIds)
    .in('month', months)
    .eq('school_year_id', schoolYearId)

  for (const ge of (geRows ?? [])) {
    const k = key(ge.teacher_assignment_id, ge.student_id, ge.month)
    if (!result.has(k)) {
      result.set(k, {
        teacher_assignment_id: ge.teacher_assignment_id,
        student_id: ge.student_id,
        month: ge.month,
        week1_score: null, week2_score: null, lab_score: null, exam_score: null, final_score: null,
      })
    }
    const row = result.get(k)!
    const score = parseFloat(ge.score)
    if (ge.week_type === 'week1') row.week1_score = score
    else if (ge.week_type === 'week2') row.week2_score = score
    else if (ge.week_type === 'labs')  row.lab_score  = score
    else if (ge.week_type === 'exams') row.exam_score = score
  }

  // ── 2. monthly_grades (fallback for missing entries) ──────────
  const { data: mgRows } = await admin
    .from('monthly_grades')
    .select('teacher_assignment_id, student_id, month, week1_score, week2_score, lab_score, exam_score, final_score')
    .in('teacher_assignment_id', assignmentIds)
    .in('month', months)
    .eq('school_year_id', schoolYearId)

  for (const mg of (mgRows ?? [])) {
    const k = key(mg.teacher_assignment_id, mg.student_id, mg.month)
    if (!result.has(k)) {
      result.set(k, {
        teacher_assignment_id: mg.teacher_assignment_id,
        student_id: mg.student_id,
        month: mg.month,
        week1_score: mg.week1_score != null ? parseFloat(mg.week1_score) : null,
        week2_score: mg.week2_score != null ? parseFloat(mg.week2_score) : null,
        lab_score:   mg.lab_score   != null ? parseFloat(mg.lab_score)   : null,
        exam_score:  mg.exam_score  != null ? parseFloat(mg.exam_score)  : null,
        final_score: mg.final_score != null ? parseFloat(mg.final_score) : null,
      })
    } else {
      // Fill missing week scores from monthly_grades
      const row = result.get(k)!
      if (row.week1_score == null && mg.week1_score != null) row.week1_score = parseFloat(mg.week1_score)
      if (row.week2_score == null && mg.week2_score != null) row.week2_score = parseFloat(mg.week2_score)
      if (row.lab_score   == null && mg.lab_score   != null) row.lab_score   = parseFloat(mg.lab_score)
      if (row.exam_score  == null && mg.exam_score  != null) row.exam_score  = parseFloat(mg.exam_score)
      if (row.final_score == null && mg.final_score != null) row.final_score = parseFloat(mg.final_score)
    }
  }

  // ── 3. calificaciones_notas (legacy fallback) ──────────────────
  const MONTH_TO_TRIM: Record<number, { trimestre: string; mesLocal: number }> = {
    2: { trimestre: '1er Trimestre', mesLocal: 1 },
    3: { trimestre: '1er Trimestre', mesLocal: 2 },
    4: { trimestre: '1er Trimestre', mesLocal: 3 },
    5: { trimestre: '2do Trimestre', mesLocal: 1 },
    6: { trimestre: '2do Trimestre', mesLocal: 2 },
    7: { trimestre: '2do Trimestre', mesLocal: 3 },
    8: { trimestre: '3er Trimestre', mesLocal: 1 },
    9: { trimestre: '3er Trimestre', mesLocal: 2 },
    10: { trimestre: '3er Trimestre', mesLocal: 3 },
  }

  for (const ta of tas) {
    const subjectCatalogId = gsMap.get(ta.grade_subject_id)
    if (!subjectCatalogId) continue

    for (const month of months) {
      const calMap = MONTH_TO_TRIM[month]
      if (!calMap) continue
      const { trimestre, mesLocal } = calMap
      const semanaStart = (mesLocal - 1) * 4 + 1
      const semanas = [semanaStart, semanaStart + 1, semanaStart + 2, semanaStart + 3]

      const { data: cnRows } = await admin
        .from('calificaciones_notas')
        .select('student_id, semana, score')
        .eq('section_id', sectionId)
        .eq('school_year_id', schoolYearId)
        .eq('subject_id', subjectCatalogId)
        .eq('trimestre', trimestre)
        .in('semana', semanas)

      for (const cn of (cnRows ?? [])) {
        const k = key(ta.id, cn.student_id, month)
        const tipoIdx = (cn.semana - 1) % 4
        const weekTypes = ['week1', 'week2', 'labs', 'exams'] as const
        const wt = weekTypes[tipoIdx]

        if (!result.has(k)) {
          result.set(k, {
            teacher_assignment_id: ta.id,
            student_id: cn.student_id,
            month,
            week1_score: null, week2_score: null, lab_score: null, exam_score: null, final_score: null,
          })
        }
        // Fill only the week scores that are still missing (don't overwrite grade_entries or monthly_grades data)
        const row = result.get(k)!
        const score = parseFloat(cn.score)
        if (wt === 'week1' && row.week1_score == null) row.week1_score = score
        else if (wt === 'week2' && row.week2_score == null) row.week2_score = score
        else if (wt === 'labs'  && row.lab_score  == null) row.lab_score  = score
        else if (wt === 'exams' && row.exam_score == null) row.exam_score = score
      }
    }
  }

  return NextResponse.json(Array.from(result.values()))
}
