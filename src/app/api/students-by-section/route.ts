import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Server-side endpoint: returns students enrolled in a section.
// Uses service role key to bypass RLS.
// Auth is handled at the middleware level (/dashboard/* routes are protected).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sectionId    = searchParams.get('sectionId')
  const schoolYearId = searchParams.get('schoolYearId')

  if (!sectionId) return NextResponse.json({ error: 'Missing sectionId' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let studData: any[] = []

  // ── 1. Try enrollments with school_year_id ──
  if (schoolYearId) {
    const { data } = await admin
      .from('enrollments')
      .select('student_id')
      .eq('section_id', sectionId)
      .eq('school_year_id', schoolYearId)
      .neq('status', 'inactive')
    const ids = (data ?? []).map((e: any) => e.student_id).filter(Boolean)
    if (ids.length > 0) {
      const { data: studs } = await admin
        .from('students').select('id, enrollment_number, user_id, display_name').in('id', ids).eq('is_active', true)
      studData = studs ?? []
    }
  }

  // ── 2. Fallback: enrollments without school_year filter ──
  if (studData.length === 0) {
    const { data } = await admin
      .from('enrollments').select('student_id').eq('section_id', sectionId).neq('status', 'inactive')
    const ids = (data ?? []).map((e: any) => e.student_id).filter(Boolean)
    if (ids.length > 0) {
      const { data: studs } = await admin
        .from('students').select('id, enrollment_number, user_id, display_name').in('id', ids).eq('is_active', true)
      studData = studs ?? []
    }
  }

  // ── 3. Fallback: grade_level + section text match ──
  if (studData.length === 0) {
    const { data: secRow } = await admin
      .from('sections').select('name, grade_id').eq('id', sectionId).single()

    if (secRow) {
      const { data: gradeRow } = await admin
        .from('grades').select('name').eq('id', secRow.grade_id).single()

      if (gradeRow) {
        const { data: studs } = await admin
          .from('students')
          .select('id, enrollment_number, user_id, display_name')
          .eq('grade_level', gradeRow.name)
          .eq('section', secRow.name)
          .neq('is_active', false)
        studData = studs ?? []

        if (studData.length === 0) {
          const { data: studs2 } = await admin
            .from('students')
            .select('id, enrollment_number, user_id, display_name')
            .eq('grade_level', gradeRow.name)
            .neq('is_active', false)
          studData = studs2 ?? []
        }
      }
    }
  }

  if (studData.length === 0) return NextResponse.json([])

  // ── 4. Resolve display names + avatar ──
  const userIds = studData.map((s: any) => s.user_id).filter(Boolean)
  const profileMap = new Map<string, { full_name: string; avatar_url: string | null }>()
  if (userIds.length > 0) {
    const { data: profData } = await admin
      .from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    for (const p of (profData ?? [])) profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url ?? null })
  }

  const students = studData
    .map((s: any) => {
      const prof = profileMap.get(s.user_id)
      return {
        id: s.id,
        enrollment_number: s.enrollment_number,
        full_name: s.display_name || prof?.full_name || s.enrollment_number,
        avatar_url: prof?.avatar_url ?? null,
      }
    })
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))

  return NextResponse.json(students)
}
