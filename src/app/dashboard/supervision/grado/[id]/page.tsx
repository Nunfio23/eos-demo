'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Users, Trophy, Medal, TrendingUp,
  ClipboardCheck, Award, Star,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface Student { id: string; full_name: string; student_code: string; avg: number | null }
interface SectionInfo { id: string; name: string; gradeName: string; gradeCode: string }
interface AttStats { total: number; present: number; absent: number; late: number; excused: number; pct: number }

function AttRing({ pct }: { pct: number }) {
  const r = 36
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
  if (avg >= 9) return 'text-emerald-600'
  if (avg >= 7) return 'text-blue-600'
  return 'text-red-500'
}

function scoreBg(avg: number | null) {
  if (avg == null) return 'bg-slate-100'
  if (avg >= 9) return 'bg-emerald-100'
  if (avg >= 7) return 'bg-blue-100'
  return 'bg-red-100'
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function SupervisionGradoPage() {
  const params = useParams()
  const sectionId = params.id as string

  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<SectionInfo | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [att, setAtt] = useState<AttStats | null>(null)
  const [hasGrades, setHasGrades] = useState(false)

  useEffect(() => {
    if (!sectionId) return
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      // 1. Active school year
      const { data: sy } = await db
        .from('school_years').select('id').eq('is_active', true).single()
      if (!sy?.id) { setLoading(false); clearTimeout(t); return }

      // 2. Section info
      const { data: secData } = await db
        .from('sections')
        .select('id, name, grade_id, grades(name, code)')
        .eq('id', sectionId)
        .single()

      if (!secData) { setLoading(false); clearTimeout(t); return }

      setSection({
        id: secData.id,
        name: secData.name,
        gradeName: secData.grades?.name ?? '—',
        gradeCode: secData.grades?.code ?? '—',
      })

      // 3. Students via enrollments
      const { data: enrollments } = await db
        .from('enrollments')
        .select('student_id, students(id, enrollment_number, display_name, profiles(full_name))')
        .eq('section_id', sectionId)
        .eq('school_year_id', sy.id)

      const enrollmentsArr: any[] = enrollments ?? []
      if (enrollmentsArr.length === 0) { setLoading(false); clearTimeout(t); return }

      const studentList: Student[] = enrollmentsArr
        .filter((e: any) => e.students)
        .map((e: any) => {
          const s = e.students
          const displayName = s.display_name || s.profiles?.full_name || '—'
          return {
            id: s.id,
            student_code: s.enrollment_number ?? '',
            full_name: displayName,
            avg: null,
          }
        })

      // 4. Academic averages from monthly_grades
      const studentIds = studentList.map(s => s.id)
      if (studentIds.length > 0) {
        const { data: mgEntries } = await db
          .from('monthly_grades')
          .select('student_id, final_score')
          .in('student_id', studentIds)
          .eq('school_year_id', sy.id)

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

      // 5. Attendance stats this month via attendance_sessions + records
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      const { data: sessions } = await db
        .from('attendance_sessions')
        .select('id, session_date')
        .eq('section_id', sectionId)
        .eq('school_year_id', sy.id)
        .is('subject_catalog_id', null)
        .gte('session_date', monthStart)
        .lte('session_date', monthEnd)

      const sessionIds = (sessions ?? []).map((s: any) => s.id)

      if (sessionIds.length > 0) {
        const { data: records } = await db
          .from('attendance_records')
          .select('status')
          .in('attendance_session_id', sessionIds)

        const attStats: AttStats = { total: 0, present: 0, absent: 0, late: 0, excused: 0, pct: 0 }
        for (const r of (records ?? [])) {
          attStats.total++
          if (r.status === 'present') attStats.present++
          else if (r.status === 'absent') attStats.absent++
          else if (r.status === 'late') attStats.late++
          else if (r.status === 'excused') attStats.excused++
        }
        attStats.pct = attStats.total > 0
          ? Math.round((attStats.present + attStats.late) / attStats.total * 100) : 0
        setAtt(attStats)
      }

      setLoading(false)
      clearTimeout(t)
    }

    load().catch(() => { setLoading(false); clearTimeout(t) })
    return () => clearTimeout(t)
  }, [sectionId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!section) return (
    <div className="space-y-6">
      <Link href="/dashboard/supervision"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-eos-600 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Supervisión
      </Link>
      <div className="card p-16 text-center">
        <Star className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Sección no encontrada</p>
        <p className="text-xs text-slate-400 mt-1">Verifica que el ID de la sección sea correcto.</p>
      </div>
    </div>
  )

  const withGrade = students.filter(s => s.avg != null)
  const top3 = withGrade.slice(0, 3)
  const totalAvg = withGrade.length > 0
    ? Math.round(withGrade.reduce((s, st) => s + (st.avg ?? 0), 0) / withGrade.length * 100) / 100
    : null
  const approving = withGrade.filter(s => (s.avg ?? 0) >= 7).length
  const currentMonth = MONTHS[new Date().getMonth()]

  return (
    <div className="space-y-6">

      {/* Back button */}
      <Link href="/dashboard/supervision"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-eos-600 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Supervisión
      </Link>

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-eos-600 via-eos-700 to-indigo-800 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-eos-200 text-sm font-medium mb-1">Supervisión · Vista de Grado</p>
            <h1 className="text-2xl font-bold">{section.gradeName}</h1>
            <p className="text-eos-200 mt-0.5">Sección {section.name}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 border border-white/20">
            <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
            <span className="text-sm font-bold">{section.gradeCode} — {section.name}</span>
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

      {/* Asistencia + Top 3 */}
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
            </div>
          ) : (
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
                  { label: 'Tardanzas', value: att.late,    color: 'bg-amber-400' },
                  { label: 'Ausentes',  value: att.absent,  color: 'bg-red-400' },
                  { label: 'Justificaciones', value: att.excused, color: 'bg-blue-400' },
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

      {/* Rendimiento global */}
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
                <div className="w-7 h-7 rounded-full bg-eos-100 text-eos-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {s.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
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

      {/* Lista de estudiantes (solo lectura) */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Lista de Estudiantes</h3>
          <span className="ml-auto text-xs text-slate-400">{students.length} matriculados</span>
        </div>
        {students.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-6">Sin estudiantes registrados en esta sección.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {students.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                <div className="w-6 h-6 rounded-full bg-eos-100 text-eos-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {s.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 text-sm text-slate-700 truncate">{s.full_name}</span>
                <span className="text-xs text-slate-400 shrink-0">{s.student_code}</span>
                {s.avg != null && (
                  <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0 ${scoreBg(s.avg)} ${scoreColor(s.avg)}`}>
                    {s.avg.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
