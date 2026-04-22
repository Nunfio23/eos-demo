'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { BookOpen, ChevronDown, Save, Lock, Unlock, AlertCircle, Trophy, Medal, Printer, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const WEIGHTS = { week1: 0.10, week2: 0.20, labs: 0.30, exams: 0.40 }
const WEEK_LABELS = [
  { key: 'week1', label: 'Semana 1',    pct: '10%', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'week2', label: 'Semana 2',    pct: '20%', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'labs',  label: 'Laboratorio', pct: '30%', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'exams', label: 'Examen',      pct: '40%', color: 'bg-amber-50 text-amber-700 border-amber-200' },
] as const

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// School year: February = month 1, November = month 10
const EOS_PERIODS = [
  { key: 'T', label: 'T — Technology',  months: [2, 3]       },
  { key: 'E', label: 'E — Engineering', months: [4, 5]       },
  { key: 'S', label: 'S — Science',     months: [6, 7]       },
  { key: 'L', label: 'L — Language',    months: [8, 9]       },
  { key: 'A', label: 'A — Arts',        months: [10, 11]     },
] as const
const TRIMESTRES = [
  { key: 'I',   label: 'Trimestre I   (Feb – Abr)', months: [2, 3, 4]       },
  { key: 'II',  label: 'Trimestre II  (May – Ago)', months: [5, 6, 7, 8]    },
  { key: 'III', label: 'Trimestre III (Sep – Nov)', months: [9, 10, 11]     },
] as const

interface Assignment {
  id: string
  section: { id: string; name: string; grade: { name: string; code: string } }
  grade_subject: { id: string; subject_catalog: { name: string } }
}
interface Student { id: string; enrollment_number: string; profile: { full_name: string } }
interface GradeEntry {
  id: string; student_id: string; month: number; week_type: string; score: number; is_locked: boolean
}
interface RankingEntry {
  student_id: string; name: string; enrollment_number: string; avg: number; months: number
  level_code: string; level_name: string; level_order: number
}
interface DbGrade   { id: string; name: string; sort_order: number }
interface DbSection { id: string; name: string; grade_id: string }
interface GradeSubjectRow { id: string; name: string }

function calcFinal(entries: Record<string, number | null>): { score: number; partial: boolean } | null {
  const weights = [
    { key: 'week1', w: WEIGHTS.week1 },
    { key: 'week2', w: WEIGHTS.week2 },
    { key: 'labs',  w: WEIGHTS.labs  },
    { key: 'exams', w: WEIGHTS.exams },
  ]
  const available = weights.filter(({ key }) => entries[key] != null)
  if (available.length === 0) return null
  const totalW  = available.reduce((s, { w }) => s + w, 0)
  const weighted = available.reduce((s, { key, w }) => s + (entries[key] as number) * w, 0)
  return { score: Math.round(weighted / totalW * 100) / 100, partial: available.length < weights.length }
}

function FinalBadge({ result }: { result: ReturnType<typeof calcFinal> }) {
  if (!result) return <span className="text-slate-300 text-xs">—</span>
  const { score, partial } = result
  const color = score >= 9 ? 'text-emerald-600' : score >= 7 ? 'text-blue-600' : 'text-red-500'
  return (
    <span className={cn('text-sm font-bold tabular-nums', color, partial && 'opacity-60')}>
      {score.toFixed(2)}{partial && <span className="text-[10px] ml-0.5">~</span>}
    </span>
  )
}

export default function LibroNotasPage() {
  const { profile } = useAuth()
  const isMaster    = profile?.role === 'master'
  const isDireccion = profile?.role === 'direccion'
  const isDocente   = profile?.role === 'docente'
  const canEdit     = isMaster || isDireccion || isDocente
  const canClose    = isMaster || isDireccion
  const isAdminMode = isMaster || isDireccion

  const [tab, setTab] = useState<'notas' | 'ranking' | 'boleta'>('notas')
  const [adminView, setAdminView] = useState<'materia' | 'global' | 'estado'>('materia')

  // ── Teacher mode ──────────────────────────────────────────────
  const [assignments,        setAssignments]        = useState<Assignment[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)

  // ── Admin mode selectors ──────────────────────────────────────
  const [dbGrades,      setDbGrades]      = useState<DbGrade[]>([])
  const [allSections,   setAllSections]   = useState<DbSection[]>([])
  const [gradeSubjects, setGradeSubjects] = useState<GradeSubjectRow[]>([])
  const [selGrade,    setSelGrade]    = useState('')
  const [selSection,  setSelSection]  = useState('')
  const [selSubject,  setSelSubject]  = useState('')   // grade_subject id
  const [adminAssignmentId, setAdminAssignmentId] = useState<string | null | undefined>(undefined)

  // ── Common ────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [schoolYearId,  setSchoolYearId]  = useState<string | null>(null)
  const [students,      setStudents]      = useState<Student[]>([])
  const [entries,       setEntries]       = useState<GradeEntry[]>([])
  const [edits,         setEdits]         = useState<Record<string, string>>({})
  const [saving,        setSaving]        = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)

  // ── Ranking ───────────────────────────────────────────────────
  const [rankings,        setRankings]        = useState<RankingEntry[]>([])
  const [loadingRankings, setLoadingRankings] = useState(false)

  // ── Boleta ────────────────────────────────────────────────────
  const [selBoletaGrade,   setSelBoletaGrade]   = useState('')
  const [selBoletaSection, setSelBoletaSection] = useState('')
  const [selBoletaMonth,   setSelBoletaMonth]   = useState<number>(new Date().getMonth() + 1)
  const [boletaType,       setBoletaType]       = useState<'mensual' | 'eos' | 'trimestre'>('mensual')
  const [selEosPeriod,   setSelEosPeriod]   = useState<string>('T')
  const [selTrimestre,     setSelTrimestre]     = useState<string>('I')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [boletaStudents, setBoletaStudents] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [boletaSubjects, setBoletaSubjects] = useState<{ id: string; name: string }[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [boletaData,     setBoletaData]     = useState<any[]>([])
  const [loadingBoleta,  setLoadingBoleta]  = useState(false)

  // ── Conducta ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [conductaData,    setConductaData]    = useState<any[]>([])
  const [conductaEdits,   setConductaEdits]   = useState<Record<string, string>>({})
  const [savingConducta,  setSavingConducta]  = useState(false)
  const [canEditConducta, setCanEditConducta] = useState(false)

  // ── Parvularia & Asistencia (boleta extras) ───────────────────
  const [isParvSection,    setIsParvSection]    = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parvEvals,        setParvEvals]        = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parvAreas,        setParvAreas]        = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parvIndicators,   setParvIndicators]   = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [boletaAttendance, setBoletaAttendance] = useState<any[]>([])

  // ── Vista Global (admin) ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [globalSubjects, setGlobalSubjects] = useState<{ id: string; name: string }[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [globalStudents, setGlobalStudents] = useState<Student[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [globalData,     setGlobalData]     = useState<any[]>([])
  const [loadingGlobal,  setLoadingGlobal]  = useState(false)

  // ── Estado Docentes (admin) ────────────────────────────────────
  interface EstadoRow {
    teacher_name: string; subject_name: string; section_name: string
    with_week1: number; with_week2: number; with_lab: number; with_exam: number
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [estadoData,    setEstadoData]    = useState<EstadoRow[]>([])
  const [loadingEstado, setLoadingEstado] = useState(false)

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => { initLoad() }, [profile])

  const initLoad = async () => {
    if (!profile) return
    setLoading(true)
    const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).single()
    setSchoolYearId(sy?.id ?? null)

    if (isAdminMode) {
      const [{ data: grades }, { data: sections }] = await Promise.all([
        supabase.from('grades').select('id, name, sort_order').order('sort_order'),
        supabase.from('sections').select('id, name, grade_id').order('name'),
      ])
      setDbGrades(grades ?? [])
      setAllSections(sections ?? [])
    } else {
      // Teacher: load only their assignments
      const { data: teacher } = await db.from('teachers').select('id').eq('user_id', profile.id).single()
      if (!teacher) { setLoading(false); return }

      // Load assignments using separate flat queries (nested joins fail on schema cache)
      let taRaw: { id: string; section_id: string; grade_subject_id: string }[] = []
      if (sy) {
        const { data } = await db.from('teacher_assignments')
          .select('id, section_id, grade_subject_id')
          .neq('is_active', false).eq('teacher_id', teacher.id).eq('school_year_id', sy.id)
        taRaw = data ?? []
      }
      if (taRaw.length === 0) {
        const { data } = await db.from('teacher_assignments')
          .select('id, section_id, grade_subject_id')
          .eq('is_active', true).eq('teacher_id', teacher.id)
        taRaw = data ?? []
      }
      if (taRaw.length > 0) {
        const sIds  = taRaw.map((t: any) => t.section_id).filter(Boolean)
        const gsIds = taRaw.map((t: any) => t.grade_subject_id).filter(Boolean)
        const [{ data: secData }, { data: gsData }] = await Promise.all([
          supabase.from('sections').select('id, name, grade_id').in('id', sIds),
          supabase.from('grade_subjects').select('id, grade_id, subject_catalog_id').in('id', gsIds),
        ])
        const gradeIds = Array.from(new Set((secData ?? []).map((s: any) => s.grade_id).filter(Boolean))) as string[]
        const catIds   = Array.from(new Set((gsData ?? []).map((g: any) => g.subject_catalog_id).filter(Boolean))) as string[]
        const [{ data: gradeData }, { data: catData }] = await Promise.all([
          gradeIds.length > 0 ? supabase.from('grades').select('id, name, code').in('id', gradeIds) : Promise.resolve({ data: [] as any[] }),
          catIds.length   > 0 ? supabase.from('subject_catalog').select('id, name').in('id', catIds) : Promise.resolve({ data: [] as any[] }),
        ])
        const secMap   = new Map((secData ?? []).map((s: any) => [s.id, s]))
        const gsMap    = new Map((gsData ?? []).map((g: any) => [g.id, g]))
        const gradeMap = new Map((gradeData ?? []).map((g: any) => [g.id, g]))
        const catMap   = new Map((catData ?? []).map((c: any) => [c.id, c]))
        const built: Assignment[] = taRaw.map((ta: any) => {
          const sec   = secMap.get(ta.section_id) as any
          const gs    = gsMap.get(ta.grade_subject_id) as any
          const grade = gradeMap.get(sec?.grade_id) as any
          const cat   = catMap.get(gs?.subject_catalog_id) as any
          return {
            id: ta.id,
            section: { id: sec?.id ?? '', name: sec?.name ?? '—', grade: { name: grade?.name ?? '—', code: grade?.code ?? '' } },
            grade_subject: { id: gs?.id ?? '', subject_catalog: { name: cat?.name ?? '—' } },
          }
        })
        setAssignments(built)
        if (built.length > 0) setSelectedAssignment(built[0])
      }

      // Para boleta en modo docente: cargar secciones y grados
      const [{ data: grades }, { data: sections }] = await Promise.all([
        supabase.from('grades').select('id, name, sort_order').order('sort_order'),
        supabase.from('sections').select('id, name, grade_id').order('name'),
      ])
      setDbGrades(grades ?? [])
      setAllSections(sections ?? [])
    }
    setLoading(false)
  }

  // ── Admin: load subjects when grade changes ───────────────────
  useEffect(() => {
    if (!isAdminMode || !selGrade) { setGradeSubjects([]); setSelSubject(''); setSelSection(''); return }
    setSelSubject(''); setSelSection('')
    db.from('grade_subjects')
      .select('id, subject_catalog:subject_catalog(name)')
      .eq('grade_id', selGrade)
      .order('sort_order')
      .then(({ data }: { data: any[] | null }) =>
        setGradeSubjects((data ?? []).map((gs: any) => ({ id: gs.id, name: gs.subject_catalog?.name ?? '—' })))
      )
  }, [selGrade])

  // ── Admin: find teacher_assignment when section+subject change ─
  useEffect(() => {
    if (!isAdminMode || !selSection || !selSubject || !schoolYearId) {
      setAdminAssignmentId(undefined)
      return
    }
    setAdminAssignmentId(undefined)
    db.from('teacher_assignments')
      .select('id')
      .eq('grade_subject_id', selSubject)
      .eq('section_id', selSection)
      .eq('school_year_id', schoolYearId)
      .neq('is_active', false)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => setAdminAssignmentId(data?.id ?? null))
  }, [selSection, selSubject, schoolYearId])

  // ── Load students + entries ───────────────────────────────────
  const loadStudentsAndEntries = useCallback(async () => {
    if (!schoolYearId) return

    if (isAdminMode) {
      if (!selSection) { setStudents([]); setEntries([]); return }
    } else {
      if (!selectedAssignment) return
    }

    setLoadingStudents(true)

    // Resolve section id
    let sectionId: string | null = null
    if (isAdminMode) {
      sectionId = selSection
    } else {
      // section.id ya viene en el join — no hay que buscarlo de nuevo
      sectionId = (selectedAssignment!.section as any).id ?? null
    }

    const { data: { session: apiSess } } = await supabase.auth.getSession()
    const token = apiSess?.access_token ?? null

    if (sectionId && token) {
      const res = await fetch(
        `/api/students-by-section?sectionId=${sectionId}&schoolYearId=${schoolYearId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const arr = await res.json()
        setStudents(arr.map((s: any) => ({ id: s.id, enrollment_number: s.enrollment_number, profile: { full_name: s.full_name } })))
      }
    }

    // Load entries via API route (service role → bypasses RLS, reads grade_entries +
    // monthly_grades + calificaciones_notas as triple fallback)
    const assignmentId = isAdminMode ? adminAssignmentId : selectedAssignment?.id
    if (assignmentId && token) {
      const res = await fetch(
        `/api/entries-for-assignment?assignmentId=${assignmentId}&month=${selectedMonth}&schoolYearId=${schoolYearId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const raw = await res.json()
        setEntries(raw.map((e: any, i: number) => ({
          id: `api_${i}_${e.student_id}_${e.week_type}`,
          student_id: e.student_id,
          month: selectedMonth,
          week_type: e.week_type,
          score: e.score,
          is_locked: e.is_locked ?? false,
        })))
      } else {
        setEntries([])
      }
    } else {
      setEntries([])
    }

    setEdits({})
    setLoadingStudents(false)
  }, [isAdminMode, selSection, adminAssignmentId, selectedAssignment, selectedMonth, schoolYearId])

  useEffect(() => {
    const t = setTimeout(() => setLoadingStudents(false), 15000)
    loadStudentsAndEntries().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadStudentsAndEntries])

  // ── Rankings ──────────────────────────────────────────────────
  const loadRankings = useCallback(async () => {
    if (!schoolYearId) return
    setLoadingRankings(true)
    const { data } = await db.from('monthly_grades')
      .select('student_id, final_score')
      .eq('school_year_id', schoolYearId)
    if (!data) { setLoadingRankings(false); return }

    const rankStudentIds = Array.from(new Set(data.map((r: any) => r.student_id).filter(Boolean))) as string[]
    const rankStudMap = new Map<string, { name: string; enrollment: string; level_code: string; level_name: string; level_order: number }>()

    if (rankStudentIds.length > 0) {
      // Nombres y IDs
      const { data: sData } = await supabase.from('students')
        .select('id, enrollment_number, user_id').in('id', rankStudentIds)
      const uIds = ((sData ?? []) as any[]).map((s: any) => s.user_id).filter(Boolean)
      const pMap = new Map<string, string>()
      if (uIds.length > 0) {
        const { data: pData } = await supabase.from('profiles').select('id, full_name').in('id', uIds)
        for (const p of ((pData ?? []) as any[])) pMap.set(p.id, p.full_name)
      }

      // Nivel via enrollments → sections → grades → levels
      const { data: enrollData } = await supabase
        .from('enrollments').select('student_id, section_id')
        .in('student_id', rankStudentIds).eq('school_year_id', schoolYearId).eq('status', 'active')
      const sectionIds = [...new Set(((enrollData ?? []) as any[]).map((e: any) => e.section_id).filter(Boolean))]
      const sectionLevelMap = new Map<string, { code: string; name: string; order: number }>()
      if (sectionIds.length > 0) {
        const { data: secData } = await supabase.from('sections').select('id, grade_id').in('id', sectionIds)
        const gradeIds = [...new Set(((secData ?? []) as any[]).map((s: any) => s.grade_id).filter(Boolean))]
        if (gradeIds.length > 0) {
          const { data: gradeData } = await supabase.from('grades').select('id, level_id').in('id', gradeIds)
          const levelIds = [...new Set(((gradeData ?? []) as any[]).map((g: any) => g.level_id).filter(Boolean))]
          if (levelIds.length > 0) {
            const { data: levelData } = await supabase.from('levels').select('id, code, name, sort_order').in('id', levelIds)
            const levelMap = new Map<string, { code: string; name: string; order: number }>()
            for (const l of ((levelData ?? []) as any[])) levelMap.set(l.id, { code: l.code, name: l.name, order: l.sort_order ?? 0 })
            const gradeLevelMap = new Map<string, { code: string; name: string; order: number }>()
            for (const g of ((gradeData ?? []) as any[])) { const lv = levelMap.get(g.level_id); if (lv) gradeLevelMap.set(g.id, lv) }
            for (const sec of ((secData ?? []) as any[])) { const lv = gradeLevelMap.get(sec.grade_id); if (lv) sectionLevelMap.set(sec.id, lv) }
          }
        }
      }
      const studentLevelMap = new Map<string, { code: string; name: string; order: number }>()
      for (const e of ((enrollData ?? []) as any[])) { const lv = sectionLevelMap.get(e.section_id); if (lv) studentLevelMap.set(e.student_id, lv) }

      for (const s of ((sData ?? []) as any[])) {
        const lv = studentLevelMap.get(s.id) ?? { code: '—', name: 'Sin nivel', order: 99 }
        rankStudMap.set(s.id, { name: pMap.get(s.user_id) ?? '—', enrollment: s.enrollment_number ?? '', level_code: lv.code, level_name: lv.name, level_order: lv.order })
      }
    }

    const map = new Map<string, { name: string; enrollment: string; level_code: string; level_name: string; level_order: number; total: number; count: number }>()
    for (const row of data) {
      if (row.final_score == null) continue
      const { name = 'Sin nombre', enrollment = '', level_code = '—', level_name = 'Sin nivel', level_order = 99 } = rankStudMap.get(row.student_id) ?? {}
      const existing = map.get(row.student_id)
      if (existing) { existing.total += parseFloat(row.final_score); existing.count++ }
      else map.set(row.student_id, { name, enrollment, level_code, level_name, level_order, total: parseFloat(row.final_score), count: 1 })
    }

    setRankings(
      Array.from(map.entries())
        .map(([student_id, { name, enrollment, level_code, level_name, level_order, total, count }]) => ({
          student_id, name, enrollment_number: enrollment, level_code, level_name, level_order,
          avg: Math.round(total / count * 100) / 100, months: count,
        }))
        .sort((a, b) => b.avg - a.avg)
    )
    setLoadingRankings(false)
  }, [schoolYearId])

  useEffect(() => { if (tab === 'ranking') loadRankings() }, [tab, loadRankings])

  // ── Vista Global ───────────────────────────────────────────────
  const loadGlobalView = useCallback(async () => {
    if (!selSection || !schoolYearId) return
    setLoadingGlobal(true)

    const { data: tas } = await db.from('teacher_assignments')
      .select('id, grade_subject:grade_subjects(subject_catalog:subject_catalog(name))')
      .eq('section_id', selSection).eq('school_year_id', schoolYearId).neq('is_active', false)

    const subs = (tas ?? []).map((a: any) => ({
      id: a.id, name: a.grade_subject?.subject_catalog?.name ?? '—',
    })).sort((a: any, b: any) => a.name.localeCompare(b.name))
    setGlobalSubjects(subs)

    const { data: { session } } = await supabase.auth.getSession()
    let stList: Student[] = []
    if (session?.access_token) {
      const res = await fetch(
        `/api/students-by-section?sectionId=${selSection}&schoolYearId=${schoolYearId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (res.ok) {
        const arr = await res.json()
        stList = arr.map((s: any) => ({ id: s.id, enrollment_number: s.enrollment_number, profile: { full_name: s.full_name } }))
      }
    }
    setGlobalStudents(stList)

    if (subs.length > 0 && session?.access_token) {
      const res = await fetch(
        `/api/section-grades?sectionId=${selSection}&schoolYearId=${schoolYearId}&months=${selectedMonth}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      setGlobalData(res.ok ? await res.json() : [])
    } else {
      setGlobalData([])
    }
    setLoadingGlobal(false)
  }, [selSection, schoolYearId, selectedMonth])

  useEffect(() => {
    if (tab === 'notas' && adminView === 'global' && selSection) {
      const t = setTimeout(() => setLoadingGlobal(false), 15000)
      loadGlobalView().finally(() => clearTimeout(t))
      return () => clearTimeout(t)
    }
  }, [tab, adminView, loadGlobalView, selSection, selectedMonth])

  // ── Estado Docentes ────────────────────────────────────────────
  const loadEstadoView = useCallback(async () => {
    if (!selGrade || !schoolYearId) return
    setLoadingEstado(true)

    const gradeSections = allSections.filter(s => s.grade_id === selGrade)
    if (gradeSections.length === 0) { setEstadoData([]); setLoadingEstado(false); return }

    const { data: tas } = await db.from('teacher_assignments')
      .select(`id, section_id,
        teacher:teachers(profile:profiles(full_name)),
        grade_subject:grade_subjects(subject_catalog:subject_catalog(name))`)
      .in('section_id', gradeSections.map(s => s.id))
      .eq('school_year_id', schoolYearId).neq('is_active', false)

    if (!tas?.length) { setEstadoData([]); setLoadingEstado(false); return }

    const { data: mgs } = await db.from('monthly_grades')
      .select('teacher_assignment_id, student_id, week1_score, week2_score, lab_score, exam_score')
      .in('teacher_assignment_id', (tas as any[]).map((t: any) => t.id))
      .eq('month', selectedMonth).eq('school_year_id', schoolYearId)

    const rows: EstadoRow[] = (tas as any[]).map((ta: any) => {
      const taMGs = ((mgs ?? []) as any[]).filter((mg: any) => mg.teacher_assignment_id === ta.id)
      const sec   = gradeSections.find(s => s.id === ta.section_id)
      return {
        teacher_name: (ta.teacher as any)?.profile?.full_name ?? '— Sin asignar —',
        subject_name: (ta.grade_subject as any)?.subject_catalog?.name ?? '—',
        section_name: sec?.name ?? '—',
        with_week1: taMGs.filter((mg: any) => mg.week1_score != null).length,
        with_week2: taMGs.filter((mg: any) => mg.week2_score != null).length,
        with_lab:   taMGs.filter((mg: any) => mg.lab_score != null).length,
        with_exam:  taMGs.filter((mg: any) => mg.exam_score != null).length,
      }
    }).sort((a: any, b: any) => a.subject_name.localeCompare(b.subject_name) || a.section_name.localeCompare(b.section_name))

    setEstadoData(rows)
    setLoadingEstado(false)
  }, [selGrade, schoolYearId, allSections, selectedMonth])

  useEffect(() => {
    if (tab === 'notas' && adminView === 'estado' && selGrade) {
      const t = setTimeout(() => setLoadingEstado(false), 15000)
      loadEstadoView().finally(() => clearTimeout(t))
      return () => clearTimeout(t)
    }
  }, [tab, adminView, loadEstadoView, selGrade, selectedMonth])

  // ── Boleta ────────────────────────────────────────────────────
  const loadBoleta = useCallback(async () => {
    if (!selBoletaSection || !schoolYearId) return
    // Determine which months to load
    let monthsToFetch: number[] = []
    if (boletaType === 'mensual') {
      monthsToFetch = [selBoletaMonth]
    } else if (boletaType === 'eos') {
      monthsToFetch = [...(EOS_PERIODS.find(p => p.key === selEosPeriod)?.months ?? [])]
    } else {
      monthsToFetch = [...(TRIMESTRES.find(t => t.key === selTrimestre)?.months ?? [])]
    }
    if (monthsToFetch.length === 0) return
    setLoadingBoleta(true)

    const [, { data: tas }] = await Promise.all([
      db.from('enrollments')
        .select('student_id')
        .eq('section_id', selBoletaSection)
        .eq('school_year_id', schoolYearId)
        .neq('status', 'inactive'),
      // No school_year_id filter — grades may exist under assignments created in a
      // different year; the grade data itself is filtered by schoolYearId in the API
      db.from('teacher_assignments')
        .select('id, grade_subject:grade_subjects(subject_catalog:subject_catalog(name))')
        .eq('section_id', selBoletaSection)
        .neq('is_active', false),
    ])

    // Fetch students via API route (service-role key bypasses RLS)
    const { data: { session } } = await supabase.auth.getSession()
    let stList: any[] = []
    if (session?.access_token) {
      const res = await fetch(
        `/api/students-by-section?sectionId=${selBoletaSection}&schoolYearId=${schoolYearId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (res.ok) {
        const arr = await res.json()
        stList = arr.map((s: any) => ({ id: s.id, enrollment_number: s.enrollment_number, profile: { full_name: s.full_name } }))
      }
    }
    setBoletaStudents(stList)

    const subs = (tas ?? []).map((a: any) => ({
      id: a.id,
      name: (a.grade_subject as any)?.subject_catalog?.name ?? '—',
    })).sort((a: any, b: any) => a.name.localeCompare(b.name))
    setBoletaSubjects(subs)

    if (subs.length > 0 && session?.access_token) {
      const res = await fetch(
        `/api/section-grades?sectionId=${selBoletaSection}&schoolYearId=${schoolYearId}&months=${monthsToFetch.join(',')}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      setBoletaData(res.ok ? await res.json() : [])
    } else {
      setBoletaData([])
    }

    // Load conducta
    const { data: condData } = await db.from('student_conduct')
      .select('student_id, month, score')
      .eq('section_id', selBoletaSection)
      .eq('school_year_id', schoolYearId)
      .in('month', monthsToFetch)
    setConductaData(condData ?? [])
    setConductaEdits({})

    // Determine if current user can edit conducta (admin or homeroom teacher)
    if (isAdminMode) {
      setCanEditConducta(true)
    } else if (isDocente && profile) {
      const { data: secRow }  = await db.from('sections').select('homeroom_teacher_id').eq('id', selBoletaSection).maybeSingle()
      const { data: tRow }    = await db.from('teachers').select('id').eq('user_id', profile.id).maybeSingle()
      setCanEditConducta(!!(secRow?.homeroom_teacher_id && tRow?.id && secRow.homeroom_teacher_id === tRow.id))
    }

    // ── Detect parvularia ──────────────────────────────────────────
    let secGradeCode = ''
    {
      const { data: secInfo } = await db.from('sections').select('grade_id').eq('id', selBoletaSection).single()
      if (secInfo?.grade_id) {
        const { data: gradeInfo } = await db.from('grades').select('code').eq('id', secInfo.grade_id).single()
        secGradeCode = gradeInfo?.code ?? ''
      }
    }
    const isParv = /^P\d/i.test(secGradeCode)
    setIsParvSection(isParv)
    if (isParv) {
      const { data: areaRows } = await db.from('parv_areas').select('id, name, sort_order').eq('grade_code', secGradeCode).order('sort_order')
      setParvAreas(areaRows ?? [])
      const areaIds = (areaRows ?? []).map((a: any) => a.id)
      if (areaIds.length > 0) {
        const { data: indRows } = await db.from('parv_indicators').select('id, area_id, text, sort_order').in('area_id', areaIds).order('sort_order')
        setParvIndicators(indRows ?? [])
        const studIds = stList.map((s: any) => s.id)
        const trKeys: string[] = []
        if (monthsToFetch.some((m: number) => m >= 2 && m <= 4)) trKeys.push('T1')
        if (monthsToFetch.some((m: number) => m >= 5 && m <= 8)) trKeys.push('T2')
        if (monthsToFetch.some((m: number) => m >= 9 && m <= 11)) trKeys.push('T3')
        if (studIds.length > 0 && trKeys.length > 0) {
          const { data: evalRows } = await db.from('parv_evaluations').select('student_id, indicator_id, value, trimestre').in('student_id', studIds).in('trimestre', trKeys)
          setParvEvals(evalRows ?? [])
        } else {
          setParvEvals([])
        }
      } else {
        setParvIndicators([])
        setParvEvals([])
      }
    } else {
      setParvAreas([])
      setParvIndicators([])
      setParvEvals([])
    }

    // ── Attendance summary ──────────────────────────────────────────
    {
      const studIds = stList.map((s: any) => s.id)
      const { data: sessData } = await db.from('attendance_sessions').select('id').eq('section_id', selBoletaSection).eq('school_year_id', schoolYearId)
      const sessIds = (sessData ?? []).map((s: any) => s.id)
      if (sessIds.length > 0 && studIds.length > 0) {
        const { data: attRows } = await db.from('attendance_records').select('student_id, status').in('attendance_session_id', sessIds).in('student_id', studIds)
        setBoletaAttendance(attRows ?? [])
      } else {
        setBoletaAttendance([])
      }
    }

    setLoadingBoleta(false)
  }, [selBoletaSection, selBoletaMonth, schoolYearId, boletaType, selEosPeriod, selTrimestre])

  useEffect(() => { if (tab === 'boleta' && selBoletaSection) loadBoleta() }, [tab, loadBoleta, selBoletaSection, boletaType, selEosPeriod, selTrimestre, selBoletaMonth])

  const exportSIGESTrimestre = async () => {
    if (!boletaStudents.length || !boletaSubjects.length) {
      toast.error('No hay datos para exportar')
      return
    }
    const XLSX = await import('xlsx')
    const header = ['NIE', ...boletaSubjects.map((s: any) => s.name.toUpperCase())]
    const rows = boletaStudents.map((st: any) => [
      st.enrollment_number,
      ...boletaSubjects.map((sub: any) => {
        const entry = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id)
        if (!entry) return ''
        const r = calcFinal({
          week1: entry.week1_score != null ? parseFloat(entry.week1_score) : null,
          week2: entry.week2_score != null ? parseFloat(entry.week2_score) : null,
          labs:  entry.lab_score   != null ? parseFloat(entry.lab_score)   : null,
          exams: entry.exam_score  != null ? parseFloat(entry.exam_score)  : null,
        })
        return r?.score ?? ''
      }),
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    const trimLabel = TRIMESTRES.find(t => t.key === selTrimestre)?.label ?? selTrimestre
    XLSX.utils.book_append_sheet(wb, ws, trimLabel.slice(0, 31))
    XLSX.writeFile(wb, `SIGES_${trimLabel.replace(/\s+/g, '_')}.xlsx`)
  }

  const printBoleta = (studentId?: string) => {
    const origin = window.location.origin
    const logoUrl  = `${origin}/eos-logo.png`
    const bgUrl    = `${origin}/eos-bg.jpeg`

    const selBoletaSec = allSections.find(s => s.id === selBoletaSection)
    const sectionLabel = selBoletaSec?.name
      ?? (isAdminMode ? '' : ((selectedAssignment?.section as any)?.name ?? ''))
    const gradeLabel = isAdminMode
      ? (dbGrades.find(g => g.id === selBoletaGrade)?.name ?? '')
      : (dbGrades.find(g => g.id === selBoletaSec?.grade_id)?.name
          ?? (selectedAssignment?.section as any)?.grade?.name ?? '')

    // Period label
    let periodLabel = ''
    let monthsInPeriod: number[] = []
    if (boletaType === 'mensual') {
      periodLabel = `Mes de ${MONTHS[selBoletaMonth - 1]}`
      monthsInPeriod = [selBoletaMonth]
    } else if (boletaType === 'eos') {
      const p = EOS_PERIODS.find(x => x.key === selEosPeriod)
      periodLabel = `Período TESLA — ${p?.label ?? ''}`
      monthsInPeriod = [...(p?.months ?? [])]
    } else {
      const t = TRIMESTRES.find(x => x.key === selTrimestre)
      periodLabel = t?.label ?? ''
      monthsInPeriod = [...(t?.months ?? [])]
    }

    const studentsToprint = studentId
      ? boletaStudents.filter((s: any) => s.id === studentId)
      : boletaStudents

    const scoreColor = (n: number) =>
      n >= 9 ? '#059669' : n >= 7 ? '#2563eb' : '#dc2626'

    const boletaPages = studentsToprint.map((st: any) => {
      // Build per-subject rows
      const subjectRows = boletaSubjects.map(sub => {
        if (boletaType === 'mensual') {
          const entry = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id && d.month === monthsInPeriod[0])
          const w1  = entry?.week1_score != null ? parseFloat(entry.week1_score) : null
          const w2  = entry?.week2_score != null ? parseFloat(entry.week2_score) : null
          const lab = entry?.lab_score   != null ? parseFloat(entry.lab_score)   : null
          const ex  = entry?.exam_score  != null ? parseFloat(entry.exam_score)  : null
          const scoreRes = entry ? calcFinal({ week1: w1, week2: w2, labs: lab, exams: ex }) : null
          const score = scoreRes?.score ?? null
          const color = score !== null ? scoreColor(score) : '#94a3b8'
          const fmt = (n: number | null) => n !== null ? n.toFixed(2) : '—'
          const status = score === null ? '' : score >= 7 ? 'Aprobado' : 'Reprobado'
          return `<tr>
            <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${sub.name}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">${fmt(w1)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">${fmt(w2)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">${fmt(lab)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">${fmt(ex)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${color};font-size:14px;">${fmt(score)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${color};">${status}</td>
          </tr>`
        } else {
          // Multi-month: show each month + average
          const monthCells = monthsInPeriod.map(m => {
            const entry = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id && d.month === m)
            const r = entry ? calcFinal({
              week1: entry.week1_score != null ? parseFloat(entry.week1_score) : null,
              week2: entry.week2_score != null ? parseFloat(entry.week2_score) : null,
              labs:  entry.lab_score   != null ? parseFloat(entry.lab_score)   : null,
              exams: entry.exam_score  != null ? parseFloat(entry.exam_score)  : null,
            }) : null
            const score = r?.score ?? null
            const color = score !== null ? scoreColor(score) : '#94a3b8'
            return `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:${color};font-weight:600;">${score !== null ? score.toFixed(2) : '—'}</td>`
          }).join('')
          const scores = monthsInPeriod.map(m => {
            const e = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id && d.month === m)
            const r = e ? calcFinal({
              week1: e.week1_score != null ? parseFloat(e.week1_score) : null,
              week2: e.week2_score != null ? parseFloat(e.week2_score) : null,
              labs:  e.lab_score   != null ? parseFloat(e.lab_score)   : null,
              exams: e.exam_score  != null ? parseFloat(e.exam_score)  : null,
            }) : null
            return r?.score ?? null
          }).filter(n => n !== null) as number[]
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
          const avgColor = avg !== null ? scoreColor(avg) : '#94a3b8'
          const status = avg === null ? '' : avg >= 7 ? 'Aprobado' : 'Reprobado'
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${sub.name}</td>
            ${monthCells}
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${avgColor};font-size:15px;">${avg !== null ? avg.toFixed(2) : '—'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${avgColor};">${status}</td>
          </tr>`
        }
      }).join('')

      // Conducta row in print boleta
      const condAvgForPrint = getConductaAvg(st.id, monthsInPeriod)
      const condColorPrint  = condAvgForPrint !== null ? scoreColor(condAvgForPrint) : '#94a3b8'
      const fmt = (n: number | null) => n !== null ? n.toFixed(2) : '—'
      const conductaRow = boletaType === 'mensual'
        ? `<tr style="background:#fefce8;">
            <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;">Conducta</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">—</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">—</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">—</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">—</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${condColorPrint};font-size:14px;">${fmt(condAvgForPrint)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${condColorPrint};">${condAvgForPrint !== null ? (condAvgForPrint >= 7 ? 'Aprobado' : 'Reprobado') : ''}</td>
          </tr>`
        : `<tr style="background:#fefce8;">
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">Conducta</td>
            ${monthsInPeriod.map(m => {
              const s = getConductaScore(st.id, m)
              const c = s !== null ? scoreColor(s) : '#94a3b8'
              return `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:${c};font-weight:600;">${s !== null ? s.toFixed(2) : '—'}</td>`
            }).join('')}
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${condColorPrint};font-size:15px;">${fmt(condAvgForPrint)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${condColorPrint};">${condAvgForPrint !== null ? (condAvgForPrint >= 7 ? 'Aprobado' : 'Reprobado') : ''}</td>
          </tr>`

      // Overall average (includes conducta)
      const allScores: number[] = []
      for (const sub of boletaSubjects) {
        const scores = monthsInPeriod.map(m => {
          const e = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id && d.month === m)
          const r = e ? calcFinal({
            week1: e.week1_score != null ? parseFloat(e.week1_score) : null,
            week2: e.week2_score != null ? parseFloat(e.week2_score) : null,
            labs:  e.lab_score   != null ? parseFloat(e.lab_score)   : null,
            exams: e.exam_score  != null ? parseFloat(e.exam_score)  : null,
          }) : null
          return r?.score ?? null
        }).filter(n => n !== null) as number[]
        if (scores.length > 0) allScores.push(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      if (condAvgForPrint !== null) allScores.push(condAvgForPrint)
      const globalAvg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null
      const globalColor = globalAvg !== null ? scoreColor(globalAvg) : '#64748b'
      const globalStatus = globalAvg === null ? '' : globalAvg >= 7 ? 'APROBADO' : 'REPROBADO'
      const statusBg = globalAvg === null ? '#f1f5f9' : globalAvg >= 7 ? '#d1fae5' : '#fee2e2'
      const statusTextColor = globalAvg === null ? '#64748b' : globalAvg >= 7 ? '#065f46' : '#991b1b'

      const weekHeaders = boletaType === 'mensual'
        ? `<th style="padding:8px 8px;background:#1e3a5f;color:#fff;text-align:center;font-size:11px;">S1<br/><span style="opacity:.7;font-weight:400;">10%</span></th>
           <th style="padding:8px 8px;background:#1e3a5f;color:#fff;text-align:center;font-size:11px;">S2<br/><span style="opacity:.7;font-weight:400;">20%</span></th>
           <th style="padding:8px 8px;background:#1e3a5f;color:#fff;text-align:center;font-size:11px;">Lab<br/><span style="opacity:.7;font-weight:400;">30%</span></th>
           <th style="padding:8px 8px;background:#1e3a5f;color:#fff;text-align:center;font-size:11px;">Exam<br/><span style="opacity:.7;font-weight:400;">40%</span></th>`
        : monthsInPeriod.map(m => `<th style="padding:8px 10px;background:#1e3a5f;color:#fff;text-align:center;font-size:12px;">${MONTHS[m-1]}</th>`).join('')

      // ── Attendance for this student ──
      const attRecs = boletaAttendance.filter((r: any) => r.student_id === st.id)
      const attTotal = attRecs.length
      const attPresent = attRecs.filter((r: any) => r.status === 'present').length
      const attAbsent = attRecs.filter((r: any) => r.status === 'absent').length
      const attLate = attRecs.filter((r: any) => r.status === 'late').length
      const attExcused = attRecs.filter((r: any) => r.status === 'excused').length
      const attPct = attTotal > 0 ? Math.round(attPresent / attTotal * 100) : null
      const attPctColor = attPct === null ? '#64748b' : attPct >= 80 ? '#059669' : attPct >= 60 ? '#d97706' : '#dc2626'
      const attendanceSection = attTotal > 0 ? `
        <div style="margin-top:14px;position:relative;z-index:1;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:700;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">Asistencia del Período</div>
          <div style="display:flex;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;">
            <div style="flex:1;text-align:center;">
              <div style="font-size:20px;font-weight:900;color:#059669;">${attPresent}</div>
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Presencias</div>
            </div>
            <div style="flex:1;text-align:center;">
              <div style="font-size:20px;font-weight:900;color:#dc2626;">${attAbsent}</div>
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Ausencias</div>
            </div>
            <div style="flex:1;text-align:center;">
              <div style="font-size:20px;font-weight:900;color:#d97706;">${attLate}</div>
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Tardanzas</div>
            </div>
            <div style="flex:1;text-align:center;">
              <div style="font-size:20px;font-weight:900;color:#2563eb;">${attExcused}</div>
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Justificadas</div>
            </div>
            <div style="flex:1;text-align:center;border-left:1px solid #e2e8f0;padding-left:10px;">
              <div style="font-size:20px;font-weight:900;color:${attPctColor};">${attPct !== null ? attPct + '%' : '—'}</div>
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Asistencia</div>
            </div>
          </div>
        </div>` : ''

      // ── Parvularia indicators section ──
      const parvSection = isParvSection && parvAreas.length > 0 ? `
        <div style="margin-top:14px;position:relative;z-index:1;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:700;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">Evaluación de Indicadores &nbsp;·&nbsp; S: Sí lo logra &nbsp;·&nbsp; P: En proceso &nbsp;·&nbsp; N: No lo logra</div>
          ${parvAreas.map((area: any) => {
            const inds = parvIndicators.filter((ind: any) => ind.area_id === area.id)
            if (!inds.length) return ''
            const valColor = (v: string | null) => v === 'S' ? '#059669' : v === 'N' ? '#dc2626' : v === 'P' ? '#d97706' : '#94a3b8'
            const valBg    = (v: string | null) => v === 'S' ? '#d1fae5' : v === 'N' ? '#fee2e2' : v === 'P' ? '#fef9c3' : '#f1f5f9'
            const rows = inds.map((ind: any) => {
              const vals: Record<string, string | null> = { T1: null, T2: null, T3: null }
              parvEvals.forEach((e: any) => { if (e.student_id === st.id && e.indicator_id === ind.id) vals[e.trimestre as string] = e.value })
              return `<tr>
                <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#475569;">${ind.text}</td>
                ${['T1','T2','T3'].map(tk => `<td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;text-align:center;"><span style="background:${valBg(vals[tk])};color:${valColor(vals[tk])};font-weight:700;font-size:11px;padding:1px 6px;border-radius:3px;">${vals[tk] ?? '—'}</span></td>`).join('')}
              </tr>`
            }).join('')
            return `<div style="margin-bottom:8px;">
              <div style="background:#dbeafe;color:#1e40af;padding:4px 8px;font-size:10px;font-weight:700;border-radius:4px 4px 0 0;">${area.name}</div>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none;">
                <thead><tr style="background:#f8fafc;">
                  <th style="padding:4px 8px;text-align:left;font-size:9px;color:#94a3b8;font-weight:600;">Indicador</th>
                  <th style="padding:4px 6px;text-align:center;font-size:9px;color:#94a3b8;font-weight:600;">T1</th>
                  <th style="padding:4px 6px;text-align:center;font-size:9px;color:#94a3b8;font-weight:600;">T2</th>
                  <th style="padding:4px 6px;text-align:center;font-size:9px;color:#94a3b8;font-weight:600;">T3</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
          }).join('')}
        </div>` : ''

      return `
      <div class="boleta-page">
        <!-- BACKGROUND WATERMARK -->
        <img src="${bgUrl}" alt="" aria-hidden="true" class="bg-watermark" />
        <!-- HEADER -->
        <div style="border-bottom:3px solid #c0392b;padding-bottom:14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1;">
          <div>
            <img src="${logoUrl}" alt="Escuela Cristiana E-OS" style="height:64px;display:block;" />
          </div>
          <div style="text-align:right;">
            <div style="background:#1e3a5f;color:#fff;padding:6px 18px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Boleta de Calificaciones</div>
            <div style="font-size:11px;color:#64748b;margin-top:5px;">${periodLabel}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Año Lectivo 2025 – 2026</div>
          </div>
        </div>

        <!-- STUDENT INFO -->
        <div style="display:flex;gap:20px;margin-bottom:20px;position:relative;z-index:1;">
          <div style="flex:2;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Estudiante</div>
            <div style="font-size:18px;font-weight:700;color:#1e293b;">${st.profile?.full_name ?? '—'}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;font-family:monospace;"># ${st.enrollment_number ?? '—'}</div>
          </div>
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Grado / Sección</div>
            <div style="font-size:16px;font-weight:700;color:#1e293b;">${gradeLabel}</div>
            <div style="font-size:12px;color:#64748b;">Sección ${sectionLabel}</div>
          </div>
          <div style="flex:1;background:${statusBg};border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Promedio</div>
            <div style="font-size:28px;font-weight:900;color:${globalColor};">${globalAvg !== null ? globalAvg.toFixed(2) : '—'}</div>
            <div style="font-size:11px;font-weight:700;color:${statusTextColor};">${globalStatus}</div>
          </div>
        </div>

        <!-- GRADES TABLE -->
        <table style="width:100%;border-collapse:collapse;font-size:13px;position:relative;z-index:1;">
          <thead>
            <tr>
              <th style="padding:10px 12px;background:#1e3a5f;color:#fff;text-align:left;font-size:12px;">Materia</th>
              ${weekHeaders}
              <th style="padding:10px 12px;background:#1e3a5f;color:#fff;text-align:center;font-size:12px;">${boletaType === 'mensual' ? 'Final' : 'Promedio'}</th>
              <th style="padding:10px 12px;background:#1e3a5f;color:#fff;text-align:center;font-size:12px;">Estado</th>
            </tr>
          </thead>
          <tbody>${subjectRows}${conductaRow}</tbody>
        </table>

        ${attendanceSection}
        ${parvSection}

        <!-- NOTE SCALE -->
        <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;position:relative;z-index:1;">
          <div style="font-size:10px;color:#94a3b8;">Escala de notas:</div>
          <div style="font-size:10px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;">9.00 – 10.00 Excelente</div>
          <div style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;">7.00 – 8.99 Satisfactorio</div>
          <div style="font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;">0.00 – 6.99 Reprobado</div>
          <div style="font-size:10px;color:#94a3b8;margin-left:auto;">Nota mínima aprobatoria: 7.00</div>
        </div>

        <!-- SIGNATURES -->
        <div style="display:flex;gap:40px;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;position:relative;z-index:1;">
          <div style="flex:1;text-align:center;">
            <div style="border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b;">Firma del Director(a)</div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b;">Firma del Orientador(a)</div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b;">Firma del Padre/Tutor</div>
          </div>
        </div>

        <div style="margin-top:12px;text-align:right;font-size:10px;color:#94a3b8;">
          Emitido el ${new Date().toLocaleDateString('es-CR', { day:'2-digit', month:'long', year:'numeric' })} · E-OS
        </div>
      </div>`
    }).join('\n')

    const html = `<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8"/>
      <title>Boleta de Calificaciones — ${gradeLabel}</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #fff; color: #1e293b; }
        .boleta-page {
          padding: 32px 36px;
          max-width: 800px;
          margin: 0 auto;
          position: relative;
        }
        .bg-watermark {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          object-position: center;
          opacity: 1;
          z-index: 0;
          pointer-events: none;
        }
        .boleta-page > *:not(.bg-watermark) { position: relative; z-index: 1; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .boleta-page { page-break-before: always; padding: 20px 28px; max-width: 100%; }
          .boleta-page:first-child { page-break-before: auto; }
          @page { margin: 10mm; size: A4 portrait; }
        }
        @media screen { .boleta-page { border-bottom: 2px dashed #e2e8f0; margin-bottom: 32px; } }
      </style>
    </head><body>${boletaPages}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    // Wait for all images (logo + bg) before printing
    w.onload = () => {
      const imgs = Array.from(w.document.images)
      if (imgs.length === 0) { w.print(); return }
      let loaded = 0
      const tryPrint = () => { if (++loaded >= imgs.length) w.print() }
      imgs.forEach(img => {
        if (img.complete) tryPrint()
        else { img.onload = tryPrint; img.onerror = tryPrint }
      })
    }
  }

  // ── Conducta helpers ──────────────────────────────────────────
  const conductaKey = (sid: string, m: number) => `${sid}|${m}`
  const getConductaScore = (sid: string, m: number): number | null => {
    const key = conductaKey(sid, m)
    if (key in conductaEdits) return conductaEdits[key] === '' ? null : parseFloat(conductaEdits[key]) || null
    const found = conductaData.find((c: any) => c.student_id === sid && c.month === m)
    return found?.score != null ? parseFloat(found.score) : null
  }
  const getConductaAvg = (sid: string, months: number[]): number | null => {
    const scores = months.map(m => getConductaScore(sid, m)).filter(n => n !== null) as number[]
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  }

  const handleSaveConducta = async () => {
    if (!selBoletaSection || !schoolYearId) return
    setSavingConducta(true)
    const upserts: object[] = []
    for (const [key, val] of Object.entries(conductaEdits)) {
      const [sid, mStr] = key.split('|')
      const month = parseInt(mStr)
      const score = parseFloat(val)
      if (isNaN(score) || val === '') continue
      upserts.push({
        student_id: sid, section_id: selBoletaSection,
        school_year_id: schoolYearId, month, score, entered_by: profile?.id,
      })
    }
    if (!upserts.length) { toast('Sin cambios para guardar'); setSavingConducta(false); return }
    const { error } = await db.from('student_conduct')
      .upsert(upserts, { onConflict: 'student_id,section_id,school_year_id,month' })
    if (error) { toast.error('Error: ' + error.message); setSavingConducta(false); return }
    toast.success('Conducta guardada')
    setConductaEdits({})
    loadBoleta()
    setSavingConducta(false)
  }

  // ── Grade helpers ─────────────────────────────────────────────
  const getEntry   = (sid: string, wt: string) => entries.find(e => e.student_id === sid && e.week_type === wt)
  const editKey    = (sid: string, wt: string) => `${sid}_${wt}`
  const getScore   = (sid: string, wt: string): number | null => {
    const key = editKey(sid, wt)
    if (key in edits) return edits[key] === '' ? null : parseFloat(edits[key]) || null
    return getEntry(sid, wt)?.score ?? null
  }
  const isLocked   = (sid: string) => WEEK_LABELS.some(w => getEntry(sid, w.key)?.is_locked)
  const handleChange = (sid: string, wt: string, value: string) => {
    const num = parseFloat(value)
    if (value !== '' && (isNaN(num) || num < 0 || num > 10)) return
    setEdits(prev => ({ ...prev, [editKey(sid, wt)]: value }))
  }

  const effectiveAssignmentId = isAdminMode ? adminAssignmentId : selectedAssignment?.id ?? null

  const handleSave = async () => {
    if (!effectiveAssignmentId || !schoolYearId) {
      toast.error('No hay docente asignado a esta materia/sección.')
      return
    }
    setSaving(true)
    const upserts: object[] = []
    for (const student of students) {
      if (isLocked(student.id)) continue
      for (const wk of WEEK_LABELS) {
        const key = editKey(student.id, wk.key)
        if (!(key in edits)) continue
        const val = edits[key]; if (val === '') continue
        const score = parseFloat(val); if (isNaN(score)) continue
        upserts.push({
          teacher_assignment_id: effectiveAssignmentId,
          student_id: student.id,
          school_year_id: schoolYearId,
          month: selectedMonth,
          week_type: wk.key,
          score, max_score: 10, entered_by: profile?.id,
        })
      }
    }
    if (!upserts.length) { toast('Sin cambios para guardar'); setSaving(false); return }
    const { error } = await db.from('grade_entries')
      .upsert(upserts, { onConflict: 'teacher_assignment_id,student_id,month,week_type' })
    if (error) { toast.error('Error al guardar: ' + error.message); setSaving(false); return }
    await syncMonthlyGrades()
    toast.success(`${upserts.length} notas guardadas`)
    setEdits({})
    loadStudentsAndEntries()
    setSaving(false)
  }

  const syncMonthlyGrades = async () => {
    if (!effectiveAssignmentId || !schoolYearId) return
    const records = students.map(student => {
      const scores: Record<string, number | null> = {}
      WEEK_LABELS.forEach(wk => { scores[wk.key] = getScore(student.id, wk.key) })
      return {
        teacher_assignment_id: effectiveAssignmentId,
        student_id: student.id,
        school_year_id: schoolYearId,
        month: selectedMonth,
        week1_score: scores.week1,
        week2_score: scores.week2,
        lab_score:   scores.labs,
        exam_score:  scores.exams,
      }
    })
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      await fetch('/api/sync-monthly-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ records }),
      })
    }
  }

  const handleClosePeriod = async () => {
    if (!effectiveAssignmentId || !schoolYearId) return
    if (!confirm(`¿Cerrar el período de ${MONTHS[selectedMonth-1]}? Las notas quedarán bloqueadas.`)) return
    setSaving(true)
    const ids = entries.map(e => e.id)
    if (ids.length > 0) await db.from('grade_entries').update({ is_locked: true }).in('id', ids)
    await db.from('monthly_grades')
      .update({ is_closed: true, closed_by: profile?.id, closed_at: new Date().toISOString() })
      .eq('teacher_assignment_id', effectiveAssignmentId)
      .eq('month', selectedMonth)
      .eq('school_year_id', schoolYearId)
    toast.success('Período cerrado y notas bloqueadas')
    setSaving(false)
    loadStudentsAndEntries()
  }

  const pendingEdits = Object.keys(edits).length > 0
  const medalColor = (i: number) =>
    i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300'

  const sectionsForGrade = allSections.filter(s => s.grade_id === selGrade)
  const adminReady = isAdminMode && !!selGrade && !!selSection && !!selSubject
  const showGradeTable = adminReady || (!isAdminMode && !!selectedAssignment)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Libro de Notas</h1>
          <p className="page-subtitle">Ingreso semanal con ponderación fija del sistema</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'notas' && pendingEdits && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <AlertCircle className="w-3 h-3" /> Cambios sin guardar
            </span>
          )}
          {tab === 'notas' && pendingEdits && canEdit && (
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save className="w-4 h-4" />}
              Guardar
            </button>
          )}
          {tab === 'notas' && canClose && showGradeTable && !pendingEdits && effectiveAssignmentId && (
            <button onClick={handleClosePeriod} disabled={saving}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <Lock className="w-4 h-4" /> Cerrar Período
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit">
        {([
          ['notas',   'Libro de Notas', null],
          ['ranking', 'Top 10',         <Trophy  key="r" className="w-3.5 h-3.5" />],
          ...((isAdminMode || isDocente) ? [['boleta', 'Boletas', <Printer key="b" className="w-3.5 h-3.5" />]] : [] as never[]),
        ] as [string, string, React.ReactNode][]).map(([t, label, icon]) => (
          <button key={t} onClick={() => {
            if (t === 'boleta' && !isAdminMode && selectedAssignment) {
              // Docente: auto-usar su sección
              setSelBoletaSection((selectedAssignment.section as any).id)
              const gradeId = allSections.find(s => s.id === (selectedAssignment.section as any).id)?.grade_id ?? ''
              setSelBoletaGrade(gradeId)
            }
            setTab(t as 'notas' | 'ranking' | 'boleta')
          }}
            className={`px-5 py-2 text-sm font-medium transition-colors flex items-center gap-2
              ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: RANKING ══════════ */}
      {tab === 'ranking' && (() => {
        // Agrupar por nivel, mantener orden de nivel
        const levelGroups = Array.from(
          rankings.reduce((acc, r) => {
            if (!acc.has(r.level_code)) acc.set(r.level_code, { code: r.level_code, name: r.level_name, order: r.level_order, entries: [] })
            acc.get(r.level_code)!.entries.push(r)
            return acc
          }, new Map<string, { code: string; name: string; order: number; entries: RankingEntry[] }>())
          .values()
        ).sort((a, b) => a.order - b.order)

        // Top limit: 5 para bachillerato, 10 para el resto
        const topLimit = (code: string, name: string) =>
          code === 'HIGH' || /bachillerato/i.test(name) ? 5 : 10

        const renderRow = (r: RankingEntry, i: number) => (
          <div key={r.student_id} className={cn('flex items-center gap-4 px-5 py-3.5', i === 0 && 'bg-amber-50/40')}>
            <div className="w-8 text-center">
              {i < 3
                ? <Medal className={cn('w-5 h-5 mx-auto', medalColor(i))} />
                : <span className="text-slate-400 text-sm font-semibold">{i + 1}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-900 truncate">{r.name}</p>
              <p className="text-xs text-slate-400">{r.enrollment_number} · {r.months} mes{r.months !== 1 ? 'es' : ''}</p>
            </div>
            <div className="text-right">
              <span className={cn('text-xl font-bold tabular-nums',
                r.avg >= 9 ? 'text-emerald-600' : r.avg >= 7 ? 'text-blue-600' : 'text-red-500'
              )}>{r.avg.toFixed(2)}</span>
              <p className="text-xs text-slate-400">promedio</p>
            </div>
          </div>
        )

        return (
          <div className="space-y-4">
            {/* Header con botón actualizar */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Promedio general de todas las materias y meses registrados</p>
              <button onClick={loadRankings} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                Actualizar
              </button>
            </div>

            {loadingRankings ? (
              <div className="card flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rankings.length === 0 ? (
              <div className="card py-14 text-center">
                <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aún no hay notas registradas para generar el ranking.</p>
              </div>
            ) : (
              <>
                {/* Rankings por nivel */}
                {levelGroups.map(({ code, name, entries }) => {
                  const limit = topLimit(code, name)
                  const top = entries.slice(0, limit)
                  return (
                    <div key={code} className="card overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm">Top {limit} — {name}</h3>
                          <p className="text-xs text-slate-400">{entries.length} estudiante{entries.length !== 1 ? 's' : ''} con notas</p>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {top.map((r, i) => renderRow(r, i))}
                      </div>
                    </div>
                  )
                })}

                {/* Top 10 general */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                    <Trophy className="w-4 h-4 text-violet-500" />
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">Top 10 General — Todo el Colegio</h3>
                      <p className="text-xs text-slate-400">Mejores promedios sin distinción de nivel</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {rankings.slice(0, 10).map((r, i) => (
                      <div key={r.student_id} className={cn('flex items-center gap-4 px-5 py-3.5', i === 0 && 'bg-amber-50/40')}>
                        <div className="w-8 text-center">
                          {i < 3
                            ? <Medal className={cn('w-5 h-5 mx-auto', medalColor(i))} />
                            : <span className="text-slate-400 text-sm font-semibold">{i + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.level_name} · {r.enrollment_number}</p>
                        </div>
                        <div className="text-right">
                          <span className={cn('text-xl font-bold tabular-nums',
                            r.avg >= 9 ? 'text-emerald-600' : r.avg >= 7 ? 'text-blue-600' : 'text-red-500'
                          )}>{r.avg.toFixed(2)}</span>
                          <p className="text-xs text-slate-400">promedio</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* ══════════ TAB: BOLETAS ══════════ */}
      {tab === 'boleta' && (isAdminMode || isDocente) && (
        <div className="space-y-5">
          {/* Selector boleta */}
          <div className="card p-4 space-y-4">
            {/* Boleta type tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
              {([['mensual','Mensual'],['eos','Período TESLA'],['trimestre','Trimestre']] as const).map(([t, lbl]) => (
                <button key={t} onClick={() => setBoletaType(t)}
                  className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    boletaType === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
                  {lbl}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {isAdminMode ? (
                <>
                  <div>
                    <label className="label">Grado</label>
                    <select className="input" value={selBoletaGrade}
                      onChange={e => { setSelBoletaGrade(e.target.value); setSelBoletaSection('') }}>
                      <option value="">— Seleccionar —</option>
                      {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sección</label>
                    <select className="input" value={selBoletaSection} disabled={!selBoletaGrade}
                      onChange={e => setSelBoletaSection(e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {allSections.filter(s => s.grade_id === selBoletaGrade).map(s =>
                        <option key={s.id} value={s.id}>Sección {s.name}</option>
                      )}
                    </select>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="label">Sección</label>
                  {assignments.length > 0 ? (
                    <select className="input" value={selBoletaSection}
                      onChange={e => setSelBoletaSection(e.target.value)}>
                      <option value="">— Seleccionar sección —</option>
                      {Array.from(new Map(assignments.map(a => [(a.section as any).id, a])).values()).map((a: any) => (
                        <option key={(a.section as any).id} value={(a.section as any).id}>
                          {(a.section as any).grade?.name} — Sección {(a.section as any).name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="input bg-slate-50 text-slate-400 text-sm">Sin secciones asignadas</div>
                  )}
                </div>
              )}

              {boletaType === 'mensual' && (
                <div>
                  <label className="label">Mes</label>
                  <select className="input" value={selBoletaMonth}
                    onChange={e => setSelBoletaMonth(parseInt(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              )}
              {boletaType === 'eos' && (
                <div>
                  <label className="label">Período TESLA</label>
                  <select className="input" value={selEosPeriod}
                    onChange={e => setSelEosPeriod(e.target.value)}>
                    {EOS_PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              )}
              {boletaType === 'trimestre' && (
                <div>
                  <label className="label">Trimestre</label>
                  <select className="input" value={selTrimestre}
                    onChange={e => setSelTrimestre(e.target.value)}>
                    {TRIMESTRES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {selBoletaSection && (
              <div className="flex justify-end gap-2 flex-wrap">
                {canEditConducta && boletaType === 'mensual' && Object.keys(conductaEdits).length > 0 && (
                  <button
                    onClick={handleSaveConducta}
                    disabled={savingConducta}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                    {savingConducta
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Save className="w-4 h-4" />}
                    Guardar Conducta
                  </button>
                )}
                {isDireccion && boletaType === 'trimestre' && boletaStudents.length > 0 && (
                  <button
                    onClick={exportSIGESTrimestre}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                    <FileSpreadsheet className="w-4 h-4" /> Exportar SIGES
                  </button>
                )}
                <button
                  onClick={() => printBoleta()}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                  <Printer className="w-4 h-4" /> Imprimir toda la sección
                </button>
              </div>
            )}
          </div>

          {/* Tabla boleta */}
          {!selBoletaSection ? (
            <div className="card p-10 text-center">
              <Printer className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Seleccioná grado, sección y mes para ver las boletas.</p>
            </div>
          ) : loadingBoleta ? (
            <div className="card p-10 text-center text-slate-400 text-sm">Cargando...</div>
          ) : boletaStudents.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">No hay estudiantes matriculados.</div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 min-w-[200px]">
                        Estudiante
                      </th>
                      {boletaSubjects.map(sub => (
                        <th key={sub.id} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 min-w-[90px] leading-tight">
                          {sub.name}
                        </th>
                      ))}
                      <th className="text-center px-3 py-3 text-xs font-semibold text-amber-600 min-w-[90px] bg-amber-50 border-l border-amber-100">
                        Conducta
                      </th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 min-w-[80px] bg-slate-100 border-l border-slate-200 sticky right-0">
                        Promedio
                      </th>
                      <th className="px-3 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {boletaStudents.map((st: any, idx: number) => {
                      const boletaMonths = boletaType === 'mensual' ? [selBoletaMonth]
                        : boletaType === 'eos' ? [...(EOS_PERIODS.find(p => p.key === selEosPeriod)?.months ?? [])]
                        : [...(TRIMESTRES.find(t => t.key === selTrimestre)?.months ?? [])]
                      const subScores = boletaSubjects.map(sub => {
                        const entry = boletaData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id)
                        if (!entry) return null
                        const r = calcFinal({
                          week1: entry.week1_score != null ? parseFloat(entry.week1_score) : null,
                          week2: entry.week2_score != null ? parseFloat(entry.week2_score) : null,
                          labs:  entry.lab_score   != null ? parseFloat(entry.lab_score)   : null,
                          exams: entry.exam_score  != null ? parseFloat(entry.exam_score)  : null,
                        })
                        return r?.score ?? null
                      })
                      const conductaScore = getConductaAvg(st.id, boletaMonths)
                      const allValid = [...subScores.filter(n => n !== null) as number[], ...(conductaScore !== null ? [conductaScore] : [])]
                      const avg = allValid.length > 0 ? allValid.reduce((a, b) => a + b, 0) / allValid.length : null
                      const conductaEditKey = conductaKey(st.id, boletaMonths[0])
                      const conductaEditVal = conductaEdits[conductaEditKey] ?? ''
                      return (
                        <tr key={st.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 sticky left-0 bg-white border-r border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 w-5 text-right shrink-0">{idx + 1}</span>
                              <div>
                                <p className="font-medium text-slate-800 text-sm">{st.profile?.full_name ?? '—'}</p>
                                <p className="text-xs text-slate-400 font-mono">{st.enrollment_number}</p>
                              </div>
                            </div>
                          </td>
                          {subScores.map((score, i) => (
                            <td key={i} className="px-3 py-2 text-center">
                              {score !== null ? (
                                <span className={cn('text-sm font-bold tabular-nums',
                                  score >= 9 ? 'text-emerald-600' : score >= 7 ? 'text-blue-600' : 'text-red-500'
                                )}>{score.toFixed(2)}</span>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                          ))}
                          {/* Conducta cell */}
                          <td className="px-2 py-2 text-center bg-amber-50 border-l border-amber-100">
                            {canEditConducta && boletaType === 'mensual' ? (
                              <input
                                type="number" min="0" max="10" step="0.01"
                                value={conductaEditVal !== '' ? conductaEditVal : (conductaScore !== null ? conductaScore.toString() : '')}
                                placeholder="—"
                                onChange={e => {
                                  const v = e.target.value
                                  const n = parseFloat(v)
                                  if (v !== '' && (isNaN(n) || n < 0 || n > 10)) return
                                  setConductaEdits(prev => ({ ...prev, [conductaEditKey]: v }))
                                }}
                                className="w-16 text-center text-sm font-bold border border-amber-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                              />
                            ) : conductaScore !== null ? (
                              <span className={cn('text-sm font-bold tabular-nums',
                                conductaScore >= 9 ? 'text-emerald-600' : conductaScore >= 7 ? 'text-blue-600' : 'text-red-500'
                              )}>{conductaScore.toFixed(2)}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center bg-slate-50 border-l border-slate-200 sticky right-0">
                            {avg !== null ? (
                              <span className={cn('text-sm font-bold tabular-nums',
                                avg >= 9 ? 'text-emerald-600' : avg >= 7 ? 'text-blue-600' : 'text-red-500'
                              )}>{avg.toFixed(2)}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => printBoleta(st.id)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              title="Imprimir boleta de este estudiante">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: NOTAS ══════════ */}
      {tab === 'notas' && (
        <>
          {/* Ponderación */}
          <div className="flex gap-2 flex-wrap">
            {WEEK_LABELS.map(wk => (
              <div key={wk.key} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium', wk.color)}>
                <span>{wk.label}</span><span className="font-bold">{wk.pct}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-50 border-slate-200 text-xs font-medium text-slate-600">
              <Trophy className="w-3 h-3" /> Final = ponderado · <span className="opacity-60">~ = parcial</span>
            </div>
          </div>

          {/* Admin view toggle */}
          {isAdminMode && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
              {([
                ['materia', 'Por Materia'],
                ['global',  'Vista Global'],
                ['estado',  'Estado Docentes'],
              ] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setAdminView(v)}
                  className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    adminView === v ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* ── Vista Global ─────────────────────────────────────── */}
          {isAdminMode && adminView === 'global' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Grado</label>
                    <select className="input" value={selGrade} onChange={e => { setSelGrade(e.target.value); setSelSection('') }}>
                      <option value="">— Seleccionar —</option>
                      {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sección</label>
                    <select className="input" value={selSection} disabled={!selGrade}
                      onChange={e => setSelSection(e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {allSections.filter(s => s.grade_id === selGrade).map(s =>
                        <option key={s.id} value={s.id}>Sección {s.name}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mes</label>
                    <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {!selSection ? (
                <div className="card p-10 text-center"><p className="text-slate-400 text-sm">Seleccioná grado y sección.</p></div>
              ) : loadingGlobal ? (
                <div className="card p-10 text-center"><div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : globalStudents.length === 0 ? (
                <div className="card p-10 text-center"><p className="text-slate-400 text-sm">No hay estudiantes en esta sección.</p></div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 min-w-[200px]">Estudiante</th>
                          {globalSubjects.map(sub => (
                            <th key={sub.id} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 min-w-[90px] leading-tight">{sub.name}</th>
                          ))}
                          <th className="text-center px-3 py-3 text-xs font-semibold text-slate-700 min-w-[80px] bg-slate-100 border-l border-slate-200">Promedio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {globalStudents.map((st, idx) => {
                          const subScores = globalSubjects.map(sub => {
                            const e = globalData.find((d: any) => d.student_id === st.id && d.teacher_assignment_id === sub.id)
                            if (!e) return null
                            const r = calcFinal({
                              week1: e.week1_score != null ? parseFloat(e.week1_score) : null,
                              week2: e.week2_score != null ? parseFloat(e.week2_score) : null,
                              labs:  e.lab_score   != null ? parseFloat(e.lab_score)   : null,
                              exams: e.exam_score  != null ? parseFloat(e.exam_score)  : null,
                            })
                            return r?.score ?? null
                          })
                          const valid = subScores.filter(n => n !== null) as number[]
                          const avg   = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
                          return (
                            <tr key={st.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 sticky left-0 bg-white border-r border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-400 w-5 text-right shrink-0">{idx + 1}</span>
                                  <div>
                                    <p className="font-medium text-slate-800 text-sm">{st.profile?.full_name ?? '—'}</p>
                                    <p className="text-xs text-slate-400 font-mono">{st.enrollment_number}</p>
                                  </div>
                                </div>
                              </td>
                              {subScores.map((score, i) => (
                                <td key={i} className="px-3 py-2 text-center">
                                  {score !== null
                                    ? <span className={cn('text-sm font-bold tabular-nums', score >= 9 ? 'text-emerald-600' : score >= 7 ? 'text-blue-600' : 'text-red-500')}>{score.toFixed(2)}</span>
                                    : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-center bg-slate-50 border-l border-slate-200">
                                {avg !== null
                                  ? <span className={cn('text-sm font-bold tabular-nums', avg >= 9 ? 'text-emerald-600' : avg >= 7 ? 'text-blue-600' : 'text-red-500')}>{avg.toFixed(2)}</span>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />≥9 Excelente</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />≥7 Bueno</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />&lt;7 Reprobado</span>
                    <span className="ml-auto">{globalStudents.length} estudiantes · {globalSubjects.length} materias</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Estado Docentes ──────────────────────────────────── */}
          {isAdminMode && adminView === 'estado' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Grado</label>
                    <select className="input" value={selGrade} onChange={e => setSelGrade(e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mes</label>
                    <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {!selGrade ? (
                <div className="card p-10 text-center"><p className="text-slate-400 text-sm">Seleccioná un grado para ver el estado.</p></div>
              ) : loadingEstado ? (
                <div className="card p-10 text-center"><div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : estadoData.length === 0 ? (
                <div className="card p-10 text-center"><p className="text-slate-400 text-sm">No hay asignaciones para este grado.</p></div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Estado de notas — {MONTHS[selectedMonth - 1]}</p>
                    <p className="text-xs text-slate-400">{estadoData.length} asignaciones</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Docente</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">Materia</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500">Secc.</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-sky-600">S1 10%</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-violet-600">S2 20%</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-emerald-600">Lab 30%</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-amber-600">Exam 40%</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {estadoData.map((row, i) => {
                          const total = row.with_week1 + row.with_week2 + row.with_lab + row.with_exam
                          const allDone = row.with_week1 > 0 && row.with_week2 > 0 && row.with_lab > 0 && row.with_exam > 0
                          const partial = total > 0 && !allDone
                          const Dot = ({ n }: { n: number }) => (
                            <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                              n > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                              {n > 0 ? n : '—'}
                            </span>
                          )
                          return (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-medium text-slate-800 text-sm">{row.teacher_name}</td>
                              <td className="px-3 py-2.5 text-slate-600 text-sm">{row.subject_name}</td>
                              <td className="px-3 py-2.5 text-center text-slate-500 text-sm font-mono">{row.section_name}</td>
                              <td className="px-3 py-2.5 text-center"><Dot n={row.with_week1} /></td>
                              <td className="px-3 py-2.5 text-center"><Dot n={row.with_week2} /></td>
                              <td className="px-3 py-2.5 text-center"><Dot n={row.with_lab} /></td>
                              <td className="px-3 py-2.5 text-center"><Dot n={row.with_exam} /></td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn('text-xs font-semibold px-2 py-1 rounded-full',
                                  allDone  ? 'bg-emerald-100 text-emerald-700' :
                                  partial  ? 'bg-amber-100 text-amber-700' :
                                             'bg-slate-100 text-slate-400')}>
                                  {allDone ? 'Completo' : partial ? 'Parcial' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Completo = examen subido</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Parcial = algunas notas</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" />Pendiente = sin notas</span>
                    <span className="ml-auto">Los números = cantidad de estudiantes con nota ingresada</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Por Materia (existing) ─── only show when adminView === 'materia' or docente */}
          {(!isAdminMode || adminView === 'materia') && (
          <>
          {/* Selectors */}
          {isAdminMode ? (
            <div className="card p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Grado</label>
                  <select className="input" value={selGrade}
                    onChange={e => setSelGrade(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Sección</label>
                  <select className="input" value={selSection} disabled={!selGrade}
                    onChange={e => setSelSection(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {sectionsForGrade.map(s => <option key={s.id} value={s.id}>Sección {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Materia</label>
                  <select className="input" value={selSubject} disabled={!selGrade}
                    onChange={e => setSelSubject(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {gradeSubjects.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Mes</label>
                <select className="input w-48" value={selectedMonth}
                  onChange={e => setSelectedMonth(parseInt(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              {adminReady && adminAssignmentId === null && (
                <div className="flex items-start gap-2 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>No hay docente asignado a esta materia/sección. Asigná un docente desde la configuración académica para poder ingresar notas.</span>
                </div>
              )}
            </div>
          ) : assignments.length === 0 ? (
            <div className="card p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No tenés materias asignadas para este año escolar.</p>
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <select value={selectedAssignment?.id ?? ''}
                  onChange={e => setSelectedAssignment(assignments.find(a => a.id === e.target.value) ?? null)}
                  className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 bg-white">
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.grade_subject as any)?.subject_catalog?.name} — {(a.section as any)?.grade?.name} {(a.section as any)?.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 bg-white">
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Grade table */}
          {showGradeTable && !(adminReady && adminAssignmentId === null) && (
            loadingStudents ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : students.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta sección.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-12">#</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Estudiante</th>
                        {WEEK_LABELS.map(wk => (
                          <th key={wk.key} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 min-w-[110px]">
                            <div>{wk.label}</div>
                            <div className={cn('text-xs mt-0.5 px-1.5 py-0.5 rounded-md inline-block', wk.color)}>{wk.pct}</div>
                          </th>
                        ))}
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 min-w-[80px]">Final</th>
                        <th className="text-center px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {students.map((student, idx) => {
                        const locked = isLocked(student.id)
                        const scores: Record<string, number | null> = {}
                        WEEK_LABELS.forEach(wk => { scores[wk.key] = getScore(student.id, wk.key) })
                        const finalResult = calcFinal(scores)
                        return (
                          <tr key={student.id} className={cn('hover:bg-slate-50/50 transition-colors', locked && 'opacity-70')}>
                            <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800 text-sm">{student.profile?.full_name ?? 'Sin nombre'}</p>
                              <p className="text-xs text-slate-400">{student.enrollment_number}</p>
                            </td>
                            {WEEK_LABELS.map(wk => {
                              const entry = getEntry(student.id, wk.key)
                              const edKey = editKey(student.id, wk.key)
                              const val = edKey in edits ? edits[edKey] : (entry?.score?.toString() ?? '')
                              return (
                                <td key={wk.key} className="px-3 py-2 text-center">
                                  {locked || entry?.is_locked || !canEdit ? (
                                    <span className="text-sm tabular-nums text-slate-600">{entry?.score?.toFixed(2) ?? '—'}</span>
                                  ) : (
                                    <input type="number" step="0.01" min="0" max="10" value={val}
                                      onChange={e => handleChange(student.id, wk.key, e.target.value)}
                                      placeholder="0.00"
                                      className={cn(
                                        'w-20 text-center px-2 py-1.5 rounded-lg border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-eos-500 transition-colors',
                                        edKey in edits ? 'border-eos-300 bg-eos-50' : 'border-slate-200 bg-white'
                                      )}
                                    />
                                  )}
                                </td>
                              )
                            })}
                            <td className="px-4 py-3 text-center"><FinalBadge result={finalResult} /></td>
                            <td className="px-3 py-3 text-center">
                              {locked
                                ? <Lock className="w-3.5 h-3.5 text-slate-300 mx-auto" aria-label="Período cerrado" />
                                : <Unlock className="w-3.5 h-3.5 text-slate-200 mx-auto" />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> ≥9.0 Excelente</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> ≥7.0 Bueno</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> &lt;7.0 Reprobado</span>
                  </div>
                  <p className="text-xs text-slate-400">{students.length} estudiantes</p>
                </div>
              </div>
            )
          )}
        </>
      )}
        </>
      )}
    </div>
  )
}
