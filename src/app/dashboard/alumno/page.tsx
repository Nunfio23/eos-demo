'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  BookOpen, ClipboardList, CheckCircle2, Clock, FileText,
  GraduationCap, Monitor, Award, Trophy, TrendingUp, Users,
  Calendar, MessageSquare, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TOTAL_SCHOOL_MONTHS = 10

// Calculates rank position given a student id, a pool of student ids, and the school year
async function calcRanking(myId: string, ids: string[], syId: string): Promise<{ pos: number; total: number }> {
  if (ids.length === 0) return { pos: 0, total: 0 }
  const { data } = await db.from('monthly_grades')
    .select('student_id, final_score')
    .in('student_id', ids)
    .eq('school_year_id', syId)
    .not('final_score', 'is', null)
  const map = new Map<string, number[]>()
  for (const r of (data ?? [])) {
    if (!map.has(r.student_id)) map.set(r.student_id, [])
    map.get(r.student_id)!.push(Number(r.final_score))
  }
  if (!map.has(myId)) return { pos: 0, total: ids.length }
  const sorted = Array.from(map.entries())
    .map(([sid, s]) => ({ sid, avg: s.reduce((a: number, b: number) => a + b, 0) / s.length }))
    .sort((a, b) => b.avg - a.avg)
  return { pos: sorted.findIndex(r => r.sid === myId) + 1, total: ids.length }
}

function scoreColor(s: number | null) {
  if (!s) return 'text-slate-400'
  if (s >= 9) return 'text-emerald-600'
  if (s >= 7) return 'text-blue-600'
  if (s >= 6) return 'text-amber-500'
  return 'text-red-500'
}

interface SubjectGrade {
  subject_name: string
  latest_score: number | null
  month: number
}

interface Task { id: string; title: string; type: string; due_date: string | null }
interface Exam { id: string; title: string; exam_type: string; scheduled_at: string | null }
interface TeacherInfo { id: string; full_name: string; subject_name: string }

// SVG ring progress
function RingProgress({ pct, size = 96 }: { pct: number; size?: number }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#3b82f6" strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  )
}

function formatShortDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
}

export default function AlumnoDashboard() {
  const { profile } = useAuth()

  const [loading, setLoading]             = useState(true)
  const [gender, setGender]               = useState<'M' | 'F' | 'otro' | null>(null)
  const [sectionName, setSectionName]     = useState('')
  const [gradeName, setGradeName]         = useState('')
  const [studentCode, setStudentCode]     = useState('')
  const [subjects, setSubjects]           = useState<SubjectGrade[]>([])
  const [tasks, setTasks]                 = useState<Task[]>([])
  const [exams, setExams]                 = useState<Exam[]>([])
  const [attPct, setAttPct]               = useState<number | null>(null)
  const [rankClass, setRankClass]         = useState<{ pos: number; total: number } | null>(null)
  const [rankArea, setRankArea]           = useState<{ pos: number; total: number; name: string } | null>(null)
  const [rankGlobal, setRankGlobal]       = useState<{ pos: number; total: number } | null>(null)
  const [classAvg, setClassAvg]           = useState<number | null>(null)
  const [monthsWithGrades, setMonthsWithGrades] = useState(0)
  const [teachers, setTeachers]           = useState<TeacherInfo[]>([])
  const [classroomId, setClassroomId]     = useState<string | null>(null)
  const [sectionId, setSectionId]         = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      // 1. Student record
      const { data: student } = await db.from('students').select('id, enrollment_number').eq('user_id', profile.id).maybeSingle()
      if (!student) { setLoading(false); clearTimeout(t); return }
      setStudentCode(student.enrollment_number ?? '')

      // Gender (optional — column may not exist yet until e16_gender.sql is run)
      db.from('students').select('gender').eq('id', student.id).maybeSingle()
        .then(({ data: gd }: { data: any }) => { if (gd?.gender) setGender(gd.gender) })
        .catch(() => {})

      // 2. Active school year
      const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      if (!sy) { setLoading(false); clearTimeout(t); return }

      // 3. Enrollment → section → grade
      const { data: enroll } = await db.from('enrollments').select('section_id').eq('student_id', student.id).eq('school_year_id', sy.id).maybeSingle()
      if (!enroll) { setLoading(false); clearTimeout(t); return }
      setSectionId(enroll.section_id)

      const { data: section } = await db.from('sections').select('id, name, grade_id').eq('id', enroll.section_id).maybeSingle()
      let gradeId: string | null = null
      let levelId: string | null = null
      if (section) {
        setSectionName(section.name)
        gradeId = section.grade_id
        const { data: grade } = await db.from('grades').select('name, level_id').eq('id', section.grade_id).maybeSingle()
        if (grade) { setGradeName(grade.name); levelId = grade.level_id }
      }

      // 4. Classroom
      const { data: classroom } = await db.from('classrooms').select('id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id).maybeSingle()
      if (classroom) setClassroomId(classroom.id)

      // Run remaining queries in parallel
      await Promise.all([

        // 5. Monthly grades + ranking
        (async () => {
          const { data: mgs } = await db.from('monthly_grades')
            .select('teacher_assignment_id, month, final_score')
            .eq('student_id', student.id)
            .eq('school_year_id', sy.id)
            .order('month', { ascending: false })

          const mgsArr: any[] = mgs ?? []

          if (mgsArr.length > 0) {
            // Subject names chain
            const taIds = [...new Set(mgsArr.map((m: any) => m.teacher_assignment_id))] as string[]
            const { data: tas } = await db.from('teacher_assignments').select('id, grade_subject_id').in('id', taIds)
            const tasArr: any[] = tas ?? []
            const gsIds = [...new Set(tasArr.map((t: any) => t.grade_subject_id))] as string[]
            const { data: gsubjects } = await db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds)
            const gsArr: any[] = gsubjects ?? []
            const scIds = [...new Set(gsArr.map((g: any) => g.subject_catalog_id))] as string[]
            const { data: catalog } = await db.from('subject_catalog').select('id, name').in('id', scIds)
            const catArr: any[] = catalog ?? []

            const catMap = new Map(catArr.map((c: any) => [c.id, c.name]))
            const gsMap  = new Map(gsArr.map((g: any) => [g.id, catMap.get(g.subject_catalog_id) ?? '—']))
            const taMap  = new Map(tasArr.map((ta: any) => [ta.id, gsMap.get(ta.grade_subject_id) ?? '—']))

            const subjectMap = new Map<string, SubjectGrade>()
            for (const mg of mgsArr) {
              const name = taMap.get(mg.teacher_assignment_id) ?? 'Materia'
              if (!subjectMap.has(name)) {
                subjectMap.set(name, { subject_name: name, latest_score: mg.final_score, month: mg.month })
              } else {
                const entry = subjectMap.get(name)!
                if (mg.month >= entry.month) { entry.latest_score = mg.final_score; entry.month = mg.month }
              }
            }
            setSubjects(Array.from(subjectMap.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name)))
            const distinctMonths = new Set(mgsArr.map((m: any) => m.month)).size
            setMonthsWithGrades(distinctMonths)
          }

          // ── Rankings (class / area / global) ──
          const [
            { data: classEnrolls },
            { data: allEnrolls },
          ] = await Promise.all([
            db.from('enrollments').select('student_id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id),
            db.from('enrollments').select('student_id').eq('school_year_id', sy.id),
          ])

          const classIds: string[] = (classEnrolls ?? []).map((e: any) => e.student_id)
          const globalIds: string[] = (allEnrolls ?? []).map((e: any) => e.student_id)

          // Area: grades with same level_id → sections → enrollments
          let areaIds: string[] = []
          let areaName = 'Área'
          if (levelId) {
            const { data: levelRec } = await db.from('levels').select('name').eq('id', levelId).maybeSingle()
            areaName = levelRec?.name ?? 'Área'
            const { data: levelGrades } = await db.from('grades').select('id').eq('level_id', levelId)
            const levelGradeIds: string[] = (levelGrades ?? []).map((g: any) => g.id)
            if (levelGradeIds.length > 0) {
              const { data: levelSections } = await db.from('sections').select('id').in('grade_id', levelGradeIds)
              const levelSectionIds: string[] = (levelSections ?? []).map((s: any) => s.id)
              if (levelSectionIds.length > 0) {
                const { data: levelEnrolls } = await db.from('enrollments').select('student_id').in('section_id', levelSectionIds).eq('school_year_id', sy.id)
                areaIds = (levelEnrolls ?? []).map((e: any) => e.student_id)
              }
            }
          }

          // Compute class avg for avance section
          if (classIds.length > 1) {
            const { data: classMGs } = await db.from('monthly_grades').select('student_id, final_score').in('student_id', classIds).eq('school_year_id', sy.id).not('final_score', 'is', null)
            const avgMap = new Map<string, number[]>()
            for (const mg of (classMGs ?? [])) {
              if (!avgMap.has(mg.student_id)) avgMap.set(mg.student_id, [])
              avgMap.get(mg.student_id)!.push(Number(mg.final_score))
            }
            const vals = Array.from(avgMap.values()).map(s => s.reduce((a: number, b: number) => a + b, 0) / s.length)
            if (vals.length > 0) setClassAvg(vals.reduce((a, b) => a + b, 0) / vals.length)
          }

          // Run 3 ranking calcs in parallel
          const [rc, ra, rg] = await Promise.all([
            calcRanking(student.id, classIds, sy.id),
            calcRanking(student.id, areaIds, sy.id),
            calcRanking(student.id, globalIds, sy.id),
          ])
          if (rc.pos > 0) setRankClass(rc)
          if (ra.pos > 0) setRankArea({ ...ra, name: areaName })
          if (rg.pos > 0) setRankGlobal(rg)
        })(),

        // 6. Attendance
        (async () => {
          const { data: sessions } = await db.from('attendance_sessions').select('id').eq('section_id', enroll.section_id)
          const sessionIds = (sessions ?? []).map((s: any) => s.id)
          if (sessionIds.length > 0) {
            const { data: records } = await db.from('attendance_records').select('status').eq('student_id', student.id).in('attendance_session_id', sessionIds)
            const recArr: any[] = records ?? []
            const total = recArr.length
            const present = recArr.filter((r: any) => r.status === 'present' || r.status === 'late').length
            if (total > 0) setAttPct(Math.round((present / total) * 100))
          }
        })(),

        // 7. Tasks & Exams
        (async () => {
          if (!classroom) return
          const today = new Date().toISOString().split('T')[0]
          const [{ data: td }, { data: ed }] = await Promise.all([
            db.from('classroom_tasks').select('id, title, type, due_date').eq('classroom_id', classroom.id).gte('due_date', today).order('due_date').limit(5),
            db.from('classroom_exams').select('id, title, exam_type, scheduled_at').eq('classroom_id', classroom.id).gte('scheduled_at', today).order('scheduled_at').limit(4),
          ])
          setTasks(td ?? [])
          setExams(ed ?? [])
        })(),

        // 8. Teachers
        (async () => {
          const { data: assigns } = await db.from('teacher_assignments').select('id, grade_subject_id, teacher_id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id)
          const assignsArr: any[] = assigns ?? []
          if (assignsArr.length === 0) return

          const teacherIds = [...new Set(assignsArr.map((a: any) => a.teacher_id))] as string[]
          const gsIds2 = [...new Set(assignsArr.map((a: any) => a.grade_subject_id))] as string[]

          const [{ data: teacherRecs }, { data: gsubjects2 }] = await Promise.all([
            db.from('teachers').select('id, user_id').in('id', teacherIds),
            db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds2),
          ])

          const tArr: any[] = teacherRecs ?? []
          const userIds = tArr.map((t: any) => t.user_id).filter(Boolean)
          const gsArr2: any[] = gsubjects2 ?? []
          const scIds2 = [...new Set(gsArr2.map((g: any) => g.subject_catalog_id))] as string[]

          const [{ data: profiles }, { data: catalog2 }] = await Promise.all([
            db.from('profiles').select('id, full_name').in('id', userIds),
            db.from('subject_catalog').select('id, name').in('id', scIds2),
          ])

          const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))
          const tUserMap   = new Map(tArr.map((t: any) => [t.id, profileMap.get(t.user_id) ?? '—']))
          const catMap2    = new Map((catalog2 ?? []).map((c: any) => [c.id, c.name]))
          const gsMap2     = new Map(gsArr2.map((g: any) => [g.id, catMap2.get(g.subject_catalog_id) ?? '—']))

          const seen = new Set<string>()
          const teacherList: TeacherInfo[] = []
          for (const a of assignsArr) {
            const name = tUserMap.get(a.teacher_id) ?? '—'
            const subj = gsMap2.get(a.grade_subject_id) ?? '—'
            const key  = `${a.teacher_id}-${a.grade_subject_id}`
            if (!seen.has(key)) { seen.add(key); teacherList.push({ id: a.teacher_id, full_name: name, subject_name: subj }) }
          }
          setTeachers(teacherList.sort((a, b) => a.subject_name.localeCompare(b.subject_name)))
        })(),
      ])

      setLoading(false)
      clearTimeout(t)
    }

    load().catch(() => { setLoading(false); clearTimeout(t) })
    return () => clearTimeout(t)
  }, [profile]) // eslint-disable-line

  const myAvg = subjects.filter(s => s.latest_score != null).length > 0
    ? subjects.filter(s => s.latest_score != null).reduce((s, sub) => s + Number(sub.latest_score), 0) / subjects.filter(s => s.latest_score != null).length
    : null

  const progressPct = Math.round((monthsWithGrades / TOTAL_SCHOOL_MONTHS) * 100)
  const firstName   = profile?.full_name?.split(' ')[0] ?? ''
  const greeting    = gender === 'F' ? 'Bienvenida' : 'Bienvenido'
  const genderLabel = gender === 'F' ? 'Niña' : gender === 'M' ? 'Niño' : null

  const TASK_COLORS: Record<string, string> = {
    tarea: 'bg-violet-100 text-violet-700',
    actividad: 'bg-blue-100 text-blue-700',
    exposicion: 'bg-amber-100 text-amber-700',
  }
  const EXAM_COLORS: Record<string, string> = {
    mensual: 'bg-sky-100 text-sky-700',
    periodo: 'bg-orange-100 text-orange-700',
    trimestre: 'bg-red-100 text-red-700',
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">{greeting} de vuelta</p>
            <h1 className="text-2xl font-bold">
              ¡Hola, {firstName}! 👋
              {genderLabel && (
                <span className="ml-2 text-sm font-medium bg-white/20 px-2 py-0.5 rounded-full align-middle">
                  {genderLabel}
                </span>
              )}
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              {gradeName}{sectionName && ` · Sección ${sectionName}`}
              {studentCode && ` · Cód. ${studentCode}`}
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ranking — spans 2 cols on mobile, 1 on large */}
        <div className="card p-5 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xs font-semibold text-slate-600">Mi Ranking</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'En la clase',        data: rankClass,  icon: '🏫', color: 'text-blue-600' },
              { label: rankArea?.name ?? 'En el área', data: rankArea, icon: '📚', color: 'text-violet-600' },
              { label: 'En el colegio',      data: rankGlobal, icon: '🌟', color: 'text-amber-500' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <span>{row.icon}</span>{row.label}
                </span>
                <span className={cn('text-sm font-bold tabular-nums', row.data ? row.color : 'text-slate-300')}>
                  {row.data
                    ? `#${row.data.pos} / ${row.data.total}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-2xl font-bold text-slate-800 tabular-nums">
              {attPct != null ? `${attPct}%` : '—'}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-600">Asistencia</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {attPct != null ? (attPct >= 90 ? 'Excelente' : attPct >= 75 ? 'Regular' : 'Necesita mejorar') : 'Sin registros'}
          </p>
        </div>

        {/* Tasks */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-violet-600" />
            </div>
            <span className="text-2xl font-bold text-slate-800 tabular-nums">{tasks.length}</span>
          </div>
          <p className="text-xs font-semibold text-slate-600">Tareas Próximas</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {tasks.length === 0 ? '¡Al día!' : `${tasks.length} pendiente${tasks.length > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Exams */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-800 tabular-nums">{exams.length}</span>
          </div>
          <p className="text-xs font-semibold text-slate-600">Exámenes Próximos</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {exams.length === 0 ? 'Sin exámenes' : `${exams.length} programado${exams.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Avance Académico ── */}
        <div className="lg:col-span-2 space-y-4">

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Mi Avance Académico</h3>
            </div>

            <div className="flex items-center gap-6">
              {/* Ring */}
              <div className="relative shrink-0">
                <RingProgress pct={progressPct} size={96} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-blue-600 leading-none">{progressPct}%</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">avance</span>
                </div>
              </div>

              {/* Averages */}
              <div className="flex-1 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500">Tu promedio</span>
                    <span className={cn('font-bold tabular-nums', scoreColor(myAvg))}>
                      {myAvg != null ? myAvg.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{ width: myAvg != null ? `${(myAvg / 10) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500">Promedio del grado</span>
                    <span className={cn('font-bold tabular-nums', scoreColor(classAvg))}>
                      {classAvg != null ? classAvg.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-slate-400 transition-all"
                      style={{ width: classAvg != null ? `${(classAvg / 10) * 100}%` : '0%' }} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  {monthsWithGrades > 0 ? `${monthsWithGrades} mes${monthsWithGrades > 1 ? 'es' : ''} con calificaciones registradas de ${TOTAL_SCHOOL_MONTHS}` : 'Sin calificaciones aún'}
                </p>
              </div>
            </div>

            {/* Subject scores compact */}
            {subjects.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Últimas notas por materia</p>
                <div className="grid grid-cols-2 gap-2">
                  {subjects.map(sub => {
                    const score = sub.latest_score != null ? Number(sub.latest_score) : null
                    return (
                      <div key={sub.subject_name} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{sub.subject_name}</p>
                          <p className="text-[10px] text-slate-400">{sub.month ? MONTH_NAMES[sub.month - 1] : '—'}</p>
                        </div>
                        <span className={cn('text-sm font-bold tabular-nums shrink-0', scoreColor(score))}>
                          {score != null ? score.toFixed(1) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tasks + Exams row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Tasks */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <ClipboardList className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Tareas y Actividades</h3>
              </div>
              {tasks.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-300 mx-auto mb-1" />
                  <p className="text-xs text-slate-400">¡Sin tareas pendientes!</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {tasks.map(task => (
                    <div key={task.id} className="px-4 py-2.5">
                      <p className="text-xs font-medium text-slate-800 truncate">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', TASK_COLORS[task.type] ?? 'bg-slate-100 text-slate-600')}>
                          {task.type}
                        </span>
                        {task.due_date && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />{formatShortDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Exams */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <FileText className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Próximos Exámenes</h3>
              </div>
              {exams.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <Award className="w-7 h-7 text-slate-200 mx-auto mb-1" />
                  <p className="text-xs text-slate-400">Sin exámenes programados</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {exams.map(exam => (
                    <div key={exam.id} className="px-4 py-2.5">
                      <p className="text-xs font-medium text-slate-800 truncate">{exam.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', EXAM_COLORS[exam.exam_type] ?? 'bg-slate-100 text-slate-600')}>
                          {exam.exam_type}
                        </span>
                        {exam.scheduled_at && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />{formatShortDate(exam.scheduled_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">

          {/* Mis Maestros */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Users className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Mis Maestros</h3>
            </div>
            {teachers.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Users className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">Sin maestros asignados</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {teachers.map((tc, i) => {
                  const initials = tc.full_name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
                  const colors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600']
                  const col = colors[i % colors.length]
                  return (
                    <div key={`${tc.id}-${tc.subject_name}`} className="flex items-center gap-3 px-4 py-3">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0', col)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{tc.full_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{tc.subject_name}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Aula Virtual',  href: classroomId ? `/dashboard/aulas` : '/dashboard/aulas',           icon: Monitor,       color: 'bg-blue-50 text-blue-600' },
                { label: 'Horarios',      href: `/dashboard/horarios${sectionId ? `?section=${sectionId}` : ''}`, icon: Clock,         color: 'bg-amber-50 text-amber-500' },
                { label: 'Chat',          href: '/dashboard/chat',                                                 icon: MessageSquare, color: 'bg-violet-50 text-violet-600' },
                { label: 'Comunicados',   href: '/dashboard/comunicados',                                          icon: Bell,          color: 'bg-emerald-50 text-emerald-600' },
                { label: 'Biblioteca',    href: '/dashboard/biblioteca',                                           icon: BookOpen,      color: 'bg-slate-50 text-slate-600' },
                { label: 'Expediente',    href: '/dashboard/expediente',                                           icon: FileText,      color: 'bg-rose-50 text-rose-500' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link key={label} href={href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all text-center">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
