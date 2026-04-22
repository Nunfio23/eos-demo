'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import {
  Star, ClipboardCheck, BookOpen, ArrowRight,
  Trophy, Medal, TrendingUp, CheckCircle2,
  AlertCircle, Award, Pencil, X, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'
import StudentAvatar from '@/components/ui/StudentAvatar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any


interface Student { id: string; full_name: string; student_code: string; avg: number | null; avatar_url?: string | null }
interface SectionInfo { id: string; name: string; gradeName: string; gradeCode: string }
interface AttStats { total: number; present: number; absent: number; late: number; excused: number; pct: number }

function AttRing({ pct }: { pct: number }) {
  const r    = 36
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 90 ? '#10b981' : pct >= 75 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg]">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
    </svg>
  )
}

function scoreColor(avg: number | null) {
  if (avg == null) return 'text-slate-300'
  if (avg >= 9)    return 'text-emerald-600'
  if (avg >= 7)    return 'text-blue-600'
  return 'text-red-500'
}
function scoreBg(avg: number | null) {
  if (avg == null) return 'bg-slate-100'
  if (avg >= 9)    return 'bg-emerald-100'
  if (avg >= 7)    return 'bg-blue-100'
  return 'bg-red-100'
}

export default function MiGradoPage() {
  const { profile } = useAuth()

  const [loading,      setLoading]      = useState(true)
  const [section,      setSection]      = useState<SectionInfo | null>(null)
  const [students,     setStudents]     = useState<Student[]>([])
  const [att,          setAtt]          = useState<AttStats | null>(null)
  const [todayDone,    setTodayDone]    = useState(false)
  const [hasGrades,    setHasGrades]    = useState(false)
  const [editStudent,  setEditStudent]  = useState<Student | null>(null)
  const [editName,     setEditName]     = useState('')
  const [savingName,   setSavingName]   = useState(false)
  const [nameList,     setNameList]     = useState<Student[]>([])

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      // 1. Teacher
      const { data: teacher } = await supabase
        .from('teachers').select('id').eq('user_id', profile.id).single()
      if (!teacher) { setLoading(false); clearTimeout(t); return }

      // 2. School year
      const { data: sy } = await supabase
        .from('school_years').select('id').eq('is_active', true).single()

      // 3. Homeroom section
      const { data: secList } = await supabase
        .from('sections').select('id, name, grade_id')
        .eq('homeroom_teacher_id', teacher.id).limit(1)
      const sec = (secList ?? [])[0] ?? null
      if (!sec) { setLoading(false); clearTimeout(t); return }

      const { data: gradeData } = await supabase
        .from('grades').select('name, code').eq('id', sec.grade_id).single()

      setSection({ id: sec.id, name: sec.name, gradeName: gradeData?.name ?? '—', gradeCode: gradeData?.code ?? '—' })

      if (!sy?.id) { setLoading(false); clearTimeout(t); return }

      // 4. Students — use API route (service role bypasses RLS, handles both enrollment styles)
      const { data: { session: sess } } = await supabase.auth.getSession()
      let rawStudents: any[] = []
      if (sess?.access_token) {
        const res = await fetch(
          `/api/students-by-section?sectionId=${sec.id}&schoolYearId=${sy.id}`,
          { headers: { Authorization: `Bearer ${sess.access_token}` } }
        )
        if (res.ok) rawStudents = await res.json()
      }

      if (rawStudents.length === 0) { setLoading(false); clearTimeout(t); return }

      const studentList: Student[] = rawStudents.map((s: any) => ({
        id: s.id,
        student_code: s.enrollment_number,
        full_name: s.full_name,
        avg: null,
        avatar_url: s.avatar_url ?? null,
      }))

      // 5. Academic averages from monthly_grades (same source as Libro de Notas)
      const studentIds = studentList.map(s => s.id)
      if (studentIds.length > 0) {
        const { data: mgEntries } = await db
          .from('monthly_grades').select('student_id, final_score')
          .in('student_id', studentIds).eq('school_year_id', sy.id)

        if ((mgEntries ?? []).length > 0) {
          setHasGrades(true)
          const byStudent = new Map<string, { total: number; count: number }>()
          for (const e of (mgEntries ?? [])) {
            if (e.final_score == null) continue
            const existing = byStudent.get(e.student_id)
            if (existing) { existing.total += parseFloat(e.final_score); existing.count++ }
            else byStudent.set(e.student_id, { total: parseFloat(e.final_score), count: 1 })
          }
          studentList.forEach(s => {
            const d = byStudent.get(s.id)
            s.avg = d ? Math.round(d.total / d.count * 100) / 100 : null
          })
        }
      }

      // Sort by avg desc, then by name
      studentList.sort((a, b) => {
        if (a.avg == null && b.avg == null) return a.full_name.localeCompare(b.full_name)
        if (a.avg == null) return 1
        if (b.avg == null) return -1
        return b.avg - a.avg
      })
      setStudents(studentList)

      // 6. Attendance stats this month
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      const today      = now.toISOString().split('T')[0]

      const { data: sessions } = await supabase
        .from('attendance_sessions').select('id, session_date')
        .eq('section_id', sec.id).eq('school_year_id', sy.id)
        .is('subject_catalog_id', null)
        .gte('session_date', monthStart).lte('session_date', monthEnd)

      const sessionIds = (sessions ?? []).map((s: any) => s.id)
      setTodayDone((sessions ?? []).some((s: any) => s.session_date === today))

      if (sessionIds.length > 0) {
        const { data: records } = await supabase
          .from('attendance_records').select('status')
          .in('attendance_session_id', sessionIds)

        const stats: AttStats = { total: 0, present: 0, absent: 0, late: 0, excused: 0, pct: 0 }
        for (const r of (records ?? [])) {
          stats.total++
          if      (r.status === 'present') stats.present++
          else if (r.status === 'absent')  stats.absent++
          else if (r.status === 'late')    stats.late++
          else if (r.status === 'excused') stats.excused++
        }
        stats.pct = stats.total > 0
          ? Math.round((stats.present + stats.late) / stats.total * 100) : 0
        setAtt(stats)
      }

      setLoading(false)
      clearTimeout(t)
    }

    load()
    return () => clearTimeout(t)
  }, [profile])

  // Load name list via API route (uses service role, robust fallback)
  useEffect(() => {
    if (!section) return
    const loadNames = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(
        `/api/students-by-section?sectionId=${section.id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return
      const arr = await res.json()
      const list: Student[] = (arr as any[]).map((s: any) => ({
        id: s.id,
        student_code: s.enrollment_number,
        full_name: s.full_name,
        avg: null,
      }))
      setNameList(list)
    }
    loadNames()
  }, [section])

  const handleSaveName = async () => {
    if (!editStudent || !editName.trim()) return
    setSavingName(true)
    const { error } = await db
      .from('students').update({ display_name: editName.trim() }).eq('id', editStudent.id)
    if (error) {
      toast.error('No se pudo guardar el nombre')
    } else {
      const updated = editName.trim()
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, full_name: updated } : s))
      setNameList(prev => prev.map(s => s.id === editStudent.id ? { ...s, full_name: updated } : s))
      toast.success('Nombre actualizado')
      setEditStudent(null)
    }
    setSavingName(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!section) return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Mi Grado</h1>
        <p className="page-subtitle">Vista del orientador de grado</p>
      </div>
      <div className="card p-16 text-center">
        <Star className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">No eres orientador de ningún grado</p>
        <p className="text-xs text-slate-400 mt-1">
          La dirección debe asignarte como orientador en Asignación de Clases.
        </p>
      </div>
    </div>
  )

  const withGrade   = students.filter(s => s.avg != null)
  const top3        = withGrade.slice(0, 3)
  const totalAvg    = withGrade.length > 0
    ? Math.round(withGrade.reduce((s, st) => s + (st.avg ?? 0), 0) / withGrade.length * 100) / 100
    : null
  const approving   = withGrade.filter(s => (s.avg ?? 0) >= 7).length
  const MONTHS      = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const currentMonth = MONTHS[new Date().getMonth()]

  return (
    <div className="space-y-6">
      <BackButton />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-eos-600 via-eos-700 to-indigo-800 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-eos-200 text-sm font-medium mb-1">Mi Grado · Orientador</p>
            <h1 className="text-2xl font-bold">{section.gradeName}</h1>
            <p className="text-eos-200 mt-0.5">Sección {section.name}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 border border-white/20">
              <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span className="text-sm font-bold">{section.gradeCode} — {section.name}</span>
            </div>
            {!todayDone ? (
              <Link href="/dashboard/asistencia"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/90 hover:bg-amber-400 text-amber-900 text-xs font-semibold transition-colors">
                <AlertCircle className="w-3.5 h-3.5" />
                Asistencia pendiente hoy
              </Link>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-400/20 border border-emerald-400/30 text-emerald-200 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Asistencia registrada hoy
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold">{students.length}</p>
            <p className="text-eos-200 text-xs mt-0.5">Estudiantes</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold">{att ? `${att.pct}%` : '—'}</p>
            <p className="text-eos-200 text-xs mt-0.5">Asistencia {currentMonth}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold">{totalAvg != null ? totalAvg.toFixed(2) : '—'}</p>
            <p className="text-eos-200 text-xs mt-0.5">Promedio académico</p>
          </div>
        </div>
      </div>

      {/* ── Asistencia + Top 3 ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Asistencia del mes */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-4 h-4 text-eos-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Asistencia — {currentMonth}</h3>
          </div>
          {!att ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <ClipboardCheck className="w-10 h-10 text-slate-200" />
              <p>Sin registros este mes</p>
              <Link href="/dashboard/asistencia"
                className="text-eos-600 text-xs font-medium hover:underline">
                Registrar ahora →
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-6">
                <div className="relative flex items-center justify-center shrink-0">
                  <AttRing pct={att.pct} />
                  <div className="absolute text-center pointer-events-none">
                    <p className="text-xl font-bold text-slate-900 leading-tight">{att.pct}%</p>
                    <p className="text-[10px] text-slate-400">presencia</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {[
                    { label: 'Presentes', value: att.present, color: 'bg-emerald-400' },
                    { label: 'Tardanzas', value: att.late,    color: 'bg-amber-400'   },
                    { label: 'Ausentes',  value: att.absent,  color: 'bg-red-400'     },
                    { label: 'Justificaciones', value: att.excused, color: 'bg-blue-400'    },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
                      <span className="text-xs text-slate-500 w-16">{row.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${row.color} transition-all`}
                          style={{ width: att.total > 0 ? `${(row.value / att.total) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-5 text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link href="/dashboard/asistencia"
                className="mt-4 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-eos-50 border border-slate-100 hover:border-eos-200 transition-colors group">
                <span className="text-xs font-medium text-slate-600 group-hover:text-eos-700">
                  {todayDone ? 'Ver asistencia de hoy' : 'Registrar asistencia'}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-eos-500" />
              </Link>
            </>
          )}
        </div>

        {/* Top 3 */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Top Estudiantes</h3>
          </div>
          {!hasGrades ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <Award className="w-10 h-10 text-slate-200" />
              <p>Sin calificaciones aún</p>
              <Link href="/dashboard/academico/notas"
                className="text-eos-600 text-xs font-medium hover:underline">
                Ingresar notas →
              </Link>
            </div>
          ) : top3.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <Award className="w-10 h-10 text-slate-200" />
              <p>Sin calificaciones registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {top3.map((s, i) => {
                const config = [
                  { Icon: Trophy, color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
                  { Icon: Medal,  color: 'text-slate-400',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
                  { Icon: Medal,  color: 'text-orange-400', bg: 'bg-orange-50', border: 'border-orange-200' },
                ][i]
                return (
                  <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${config.bg} ${config.border}`}>
                    <config.Icon className={`w-5 h-5 shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.full_name}</p>
                      <p className="text-xs text-slate-400">{s.student_code}</p>
                    </div>
                    <span className={`text-lg font-bold tabular-nums ${scoreColor(s.avg)}`}>
                      {s.avg?.toFixed(2)}
                    </span>
                  </div>
                )
              })}
              {withGrade.length > 3 && (
                <p className="text-xs text-center text-slate-400 pt-1">
                  +{withGrade.length - 3} estudiantes más con calificación
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Rendimiento global (solo si hay notas) ───────────────── */}
      {hasGrades && students.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Rendimiento del Grado</h3>
            </div>
            <div className="flex items-center gap-3">
              {totalAvg != null && (
                <>
                  <span className="text-xs text-slate-500">
                    <span className="font-semibold text-emerald-600">{approving}</span>
                    {' '}/ {withGrade.length} aprobando
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${scoreBg(totalAvg)} ${scoreColor(totalAvg)}`}>
                    Prom. {totalAvg.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {students.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                <StudentAvatar url={s.avatar_url} name={s.full_name} size="xs" variant="violet" />
                <p className="text-xs font-medium text-slate-700 w-36 truncate shrink-0">{s.full_name}</p>
                <div className="flex-1 bg-slate-100 rounded-full h-2 min-w-0">
                  {s.avg != null && (
                    <div
                      className={`h-2 rounded-full transition-all ${
                        s.avg >= 9 ? 'bg-emerald-400' : s.avg >= 7 ? 'bg-blue-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${(s.avg / 10) * 100}%` }}
                    />
                  )}
                </div>
                <span className={`text-xs font-bold tabular-nums w-10 text-right shrink-0 ${scoreColor(s.avg)}`}>
                  {s.avg != null ? s.avg.toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-50">
            {[
              { color: 'bg-emerald-400', label: '≥9.0 Excelente' },
              { color: 'bg-blue-400',    label: '≥7.0 Aprobado'  },
              { color: 'bg-red-400',     label: '<7.0 Reprobado'  },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                <span className="text-xs text-slate-400">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Accesos rápidos ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/dashboard/asistencia"
          className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Tomar Asistencia</p>
            <p className="text-xs text-slate-400">{todayDone ? 'Ver / actualizar de hoy' : 'Pendiente para hoy'}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </Link>
        <Link href="/dashboard/academico/notas"
          className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Libro de Notas</p>
            <p className="text-xs text-slate-400">Ingresar y revisar calificaciones</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </Link>
      </div>

      {/* ── Lista de estudiantes (con edición de nombre) ─────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Lista de Estudiantes</h3>
          <span className="ml-auto text-xs text-slate-400">
            Toca <Pencil className="w-3 h-3 inline" /> para corregir un nombre
          </span>
        </div>
        {nameList.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-6">Sin estudiantes registrados en esta sección.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {nameList.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                <StudentAvatar url={s.avatar_url} name={s.full_name} size="xs" variant="violet" />
                <span className="flex-1 text-sm text-slate-700 truncate">{s.full_name}</span>
                <span className="text-xs text-slate-400 shrink-0">{s.student_code}</span>
                <button
                  onClick={() => { setEditStudent(s); setEditName(s.full_name) }}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-eos-500 hover:bg-eos-50 transition-colors"
                  title="Editar nombre"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit name modal */}
      {editStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Editar nombre</h3>
              <button onClick={() => setEditStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Código: <span className="font-mono font-medium">{editStudent.student_code}</span>
            </p>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-400 mb-4"
              placeholder="Nombre completo del estudiante"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditStudent(null)}
                className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveName}
                disabled={savingName || !editName.trim()}
                className="px-4 py-2 rounded-xl text-sm bg-eos-600 hover:bg-eos-700 text-white font-medium disabled:opacity-50 transition-colors"
              >
                {savingName ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
