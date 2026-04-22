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

    if (!caller?.is_active || !['master', 'administracion', 'direccion'].includes(caller.role)) {
      return err('Sin permisos', 403)
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Año escolar activo (tomar el primero si hay varios)
    const { data: years } = await adminClient
      .from('school_years').select('id').eq('is_active', true).limit(1)
    const schoolYearId = years?.[0]?.id
    if (!schoolYearId) return err('No hay año escolar activo')

    // Cargar todos los grados (name → id)
    const { data: gradesData } = await adminClient.from('grades').select('id, name')
    const gradeByName = new Map<string, string>()
    for (const g of (gradesData ?? [])) gradeByName.set(g.name.trim().toLowerCase(), g.id)

    // Cargar todas las secciones (grade_id + name → id)
    const { data: sectionsData } = await adminClient.from('sections').select('id, name, grade_id')
    const sectionKey = (gradeId: string, secName: string) => `${gradeId}::${secName.trim().toLowerCase()}`
    const sectionById = new Map<string, string>()
    for (const s of (sectionsData ?? [])) sectionById.set(sectionKey(s.grade_id, s.name), s.id)

    // Cargar todos los estudiantes activos
    const { data: studentsData } = await adminClient
      .from('students').select('id, grade_level, section').eq('is_active', true)

    // Cargar enrollments ya existentes para este año
    const { data: existingEnrollments } = await adminClient
      .from('enrollments').select('student_id').eq('school_year_id', schoolYearId).eq('status', 'active')
    const alreadyEnrolled = new Set((existingEnrollments ?? []).map((e: any) => e.student_id))

    let enrolled = 0
    let skipped = 0
    let errors: string[] = []

    for (const student of (studentsData ?? [])) {
      // Ya matriculado este año
      if (alreadyEnrolled.has(student.id)) { skipped++; continue }

      const gradeName = (student.grade_level ?? '').trim().toLowerCase()
      const secName   = (student.section ?? 'A').trim()

      const gradeId = gradeByName.get(gradeName)
      if (!gradeId) {
        errors.push(`Grado no encontrado: "${student.grade_level}"`)
        skipped++
        continue
      }

      const sectionId = sectionById.get(sectionKey(gradeId, secName))
      if (!sectionId) {
        errors.push(`Sección "${secName}" no encontrada en "${student.grade_level}"`)
        skipped++
        continue
      }

      const { error: enrollErr } = await adminClient.from('enrollments').insert({
        student_id:     student.id,
        section_id:     sectionId,
        school_year_id: schoolYearId,
        status:         'active',
      })

      if (enrollErr) {
        errors.push(enrollErr.message)
        skipped++
      } else {
        enrolled++
      }
    }

    return NextResponse.json({ enrolled, skipped, errors: [...new Set(errors)] })
  } catch (e) {
    return err(String(e), 500)
  }
}
