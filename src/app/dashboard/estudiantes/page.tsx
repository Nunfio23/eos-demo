'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Trophy, Medal, Award, Star, ShieldAlert, AlertOctagon,
  TrendingUp, TrendingDown, CheckCircle2, AlertTriangle,
  X, Search, Users, BookOpen, Calendar, ClipboardList,
  GraduationCap, Activity, BarChart3, ChevronRight,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import PhotoUpload from '@/components/ui/PhotoUpload'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { CheckCircle, XCircle, Pencil, BarChart2, ChevronLeft } from 'lucide-react'
import type { Student } from '@/types/database'
import BackButton from '@/components/ui/BackButton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ───────────────────────────────────────────────────────────────────

type PerfLevel = 'elite' | 'destacado' | 'estable' | 'bajo' | 'critico'

function calcLevel(score: number): PerfLevel {
  if (score >= 85) return 'elite'
  if (score >= 70) return 'destacado'
  if (score >= 55) return 'estable'
  if (score >= 35) return 'bajo'
  return 'critico'
}

interface StudentCard {
  studentId: string
  userId: string
  studentName: string
  enrollmentNumber: string
  sectionId: string
  sectionName: string
  gradeName: string
  gradeCode: string
  avgAcademic: number | null
  attendancePct: number | null
  tasksPct: number | null
  performanceScore: number
  rank: number
  level: PerfLevel
  scoreBreakdown: { academic: number; attendance: number; tasks: number }
  isActive: boolean
  avatarUrl?: string | null
}

// ─── Level config ─────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<PerfLevel, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  elite:     { label: 'Élite',     color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',  icon: Trophy },
  destacado: { label: 'Destacado', color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',   icon: Star },
  estable:   { label: 'Estable',   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',icon: CheckCircle2 },
  bajo:      { label: 'Bajo',      color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200', icon: AlertTriangle },
  critico:   { label: 'Crítico',   color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',    icon: AlertOctagon },
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6']

// ─── Podio ────────────────────────────────────────────────────────────────────

function Podio({ top3, onSelect }: { top3: StudentCard[]; onSelect: (s: StudentCard) => void }) {
  const medals = [
    { icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-300', size: 'h-28', label: '1°' },
    { icon: Medal,  color: 'text-slate-400',  bg: 'bg-slate-50',  border: 'border-slate-200',  size: 'h-20', label: '2°' },
    { icon: Award,  color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', size: 'h-16', label: '3°' },
  ]
  const order = [top3[1], top3[0], top3[2]].filter(Boolean)
  const orderMedals = [medals[1], medals[0], medals[2]]

  return (
    <div className="flex items-end justify-center gap-4 py-4">
      {order.map((student, i) => {
        const actualIdx = top3.indexOf(student)
        const m = orderMedals[i]
        const MIcon = m.icon
        if (!student) return null
        return (
          <button
            key={student.studentId}
            onClick={() => onSelect(student)}
            className="flex flex-col items-center gap-0 transition-all hover:scale-105 cursor-pointer group"
            style={{ minWidth: 120 }}
          >
            {/* Card content */}
            <div className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 shadow-sm w-full',
              m.bg, m.border
            )}>
              <MIcon className={cn('w-8 h-8', m.color)} />
              <StudentAvatar
                url={student.avatarUrl}
                name={student.studentName}
                size="lg"
                variant={actualIdx === 0 ? 'amber' : actualIdx === 1 ? 'slate' : 'orange'}
              />
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2 max-w-24">
                  {student.studentName.split(' ').slice(0,2).join(' ')}
                </p>
                <p className={cn('text-sm font-bold mt-0.5', m.color)}>{student.performanceScore} pts</p>
                <p className="text-[10px] text-slate-400">{student.gradeName} · {student.sectionName}</p>
              </div>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', m.bg, m.color)}>
                {m.label} Lugar
              </span>
            </div>
            {/* Podium block — height defines rank hierarchy */}
            <div className={cn(
              'w-full rounded-t-none rounded-b-xl border-2 border-t-0 group-hover:brightness-95',
              m.size, m.bg, m.border
            )} />
          </button>
        )
      })}
    </div>
  )
}

// ─── StudentCardItem ───────────────────────────────────────────────────────────

function StudentCardItem({ student, onSelect }: { student: StudentCard; onSelect: (s: StudentCard) => void }) {
  const lvl = LEVEL_CONFIG[student.level]
  const LvlIcon = lvl.icon
  const isAlert = student.level === 'bajo' || student.level === 'critico'

  return (
    <button
      onClick={() => onSelect(student)}
      className={cn(
        'w-full text-left card p-4 hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer',
        isAlert && 'border-l-4',
        student.level === 'critico' && 'border-l-red-500',
        student.level === 'bajo' && 'border-l-orange-400',
        !student.isActive && 'opacity-50 grayscale',
      )}
    >
      <div className="flex items-center gap-3">
        {/* Rank badge */}
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0">
          <span className="text-xs font-bold text-slate-600">#{student.rank}</span>
        </div>

        {/* Avatar */}
        <StudentAvatar
          url={student.avatarUrl}
          name={student.studentName}
          size="md"
          variant={
            student.level === 'elite' ? 'amber' :
            student.level === 'destacado' ? 'blue' :
            student.level === 'estable' ? 'emerald' :
            student.level === 'bajo' ? 'orange' : 'red'
          }
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 text-sm truncate">{student.studentName}</p>
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', lvl.bg, lvl.color)}>
              {lvl.label}
            </span>
          </div>
          <p className="text-xs text-slate-400">{student.gradeName} · {student.sectionName} · #{student.enrollmentNumber}</p>
        </div>

        {/* Score */}
        <div className="text-right shrink-0">
          <p className={cn('text-lg font-bold', lvl.color)}>{student.performanceScore}</p>
          <p className="text-[10px] text-slate-400">/ 100 pts</p>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </div>

      {/* Score bar */}
      <div className="mt-3 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-1.5 rounded-full transition-all',
            student.level === 'elite' ? 'bg-amber-500' :
            student.level === 'destacado' ? 'bg-blue-500' :
            student.level === 'estable' ? 'bg-emerald-500' :
            student.level === 'bajo' ? 'bg-orange-500' : 'bg-red-500'
          )}
          style={{ width: `${student.performanceScore}%` }}
        />
      </div>

      {/* Mini stats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Académico', value: student.avgAcademic != null ? student.avgAcademic.toFixed(1) : '—', suffix: '/10', icon: BookOpen },
          { label: 'Asistencia', value: student.attendancePct != null ? `${student.attendancePct}` : '—', suffix: '%', icon: Calendar },
          { label: 'Tareas', value: student.tasksPct != null ? `${Math.round(student.tasksPct)}` : '—', suffix: '%', icon: ClipboardList },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-bold text-slate-700">{stat.value}<span className="text-[10px] text-slate-400">{stat.suffix}</span></p>
            <p className="text-[10px] text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Alert */}
      {isAlert && (
        <div className={cn('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
          student.level === 'critico' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
        )}>
          <LvlIcon className="w-3.5 h-3.5 shrink-0" />
          {student.level === 'critico' ? 'Requiere intervención urgente' : 'Necesita seguimiento y apoyo'}
        </div>
      )}
    </button>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface DrawerData {
  student: StudentCard
  allMonthlyGrades: any[]
  taMap: Map<string, string>  // taId → subjectName
  allAttendanceRecords: any[]
  allSessions: any[]
  allSubmissions: any[]
  allTasks: any[]
  classroomIds: string[]
}

function DetailDrawer({ data, onClose }: { data: DrawerData; onClose: () => void }) {
  const { student, allMonthlyGrades, taMap, allAttendanceRecords, allSessions, allSubmissions, allTasks } = data
  const lvl = LEVEL_CONFIG[student.level]
  const LvlIcon = lvl.icon
  const isAlert = student.level === 'bajo' || student.level === 'critico'

  // Monthly grades for this student (last 6 months)
  const myGrades = allMonthlyGrades.filter(g => g.student_id === student.studentId)
  const monthlyByMonth = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const g of myGrades) {
      if (g.final_score == null) continue
      if (!map.has(g.month)) map.set(g.month, [])
      map.get(g.month)!.push(Number(g.final_score))
    }
    const allMonths = Array.from(map.keys()).sort((a, b) => a - b).slice(-6)
    return allMonths.map(m => ({
      name: MONTH_NAMES[m - 1] ?? `M${m}`,
      promedio: parseFloat((map.get(m)!.reduce((a, b) => a + b, 0) / map.get(m)!.length).toFixed(2)),
    }))
  }, [myGrades])

  // By subject
  const bySubject = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const g of myGrades) {
      if (g.final_score == null) continue
      const subj = taMap.get(g.teacher_assignment_id) ?? 'Materia'
      if (!map.has(subj)) map.set(subj, [])
      map.get(subj)!.push(Number(g.final_score))
    }
    return Array.from(map.entries()).map(([name, scores]) => ({
      name: name.length > 12 ? name.slice(0, 12) + '…' : name,
      promedio: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
    })).sort((a, b) => b.promedio - a.promedio)
  }, [myGrades, taMap])

  // Attendance breakdown
  const mySessions = allSessions.filter(s => s.section_id === student.sectionId).map(s => s.id)
  const myRecords = allAttendanceRecords.filter(r => r.student_id === student.studentId && mySessions.includes(r.attendance_session_id))
  const attBreakdown = useMemo(() => {
    const counts: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 }
    for (const r of myRecords) counts[r.status] = (counts[r.status] ?? 0) + 1
    return [
      { name: 'Presente', value: counts.present, color: '#10b981' },
      { name: 'Ausente',  value: counts.absent,  color: '#ef4444' },
      { name: 'Tardanza', value: counts.late,     color: '#f59e0b' },
      { name: 'Justific.', value: counts.excused, color: '#3b82f6' },
    ].filter(e => e.value > 0)
  }, [myRecords])

  // Tasks summary
  const myClassroomIds = data.classroomIds
  const relevantTasks = allTasks.filter(t => myClassroomIds.includes(t.classroom_id))
  const mySubmissions = allSubmissions.filter(s => s.student_id === student.studentId && relevantTasks.some(t => t.id === s.task_id))
  const tasksPending = relevantTasks.length - mySubmissions.filter(s => s.status === 'submitted' || s.status === 'graded').length
  const tasksSubmitted = mySubmissions.filter(s => s.status === 'submitted' || s.status === 'graded').length

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto flex flex-col animate-slide-in-right shadow-2xl">

        {/* Header */}
        <div className={cn('px-6 py-5 border-b', lvl.bg, lvl.border)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <StudentAvatar
                url={student.avatarUrl}
                name={student.studentName}
                size="lg"
                variant={
                  student.level === 'elite' ? 'amber' :
                  student.level === 'destacado' ? 'blue' :
                  student.level === 'estable' ? 'emerald' :
                  student.level === 'bajo' ? 'orange' : 'red'
                }
              />
              <div>
                <h2 className="font-bold text-slate-900 text-base leading-tight">{student.studentName}</h2>
                <p className="text-xs text-slate-500">{student.gradeName} · {student.sectionName} · #{student.enrollmentNumber}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', lvl.bg, lvl.color, 'border', lvl.border)}>
                    <LvlIcon className="w-3 h-3 inline mr-1" />{lvl.label}
                  </span>
                  <span className="text-xs text-slate-500">#{student.rank} de {student.performanceScore} pts</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/80 rounded-xl transition-colors shrink-0">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Alert */}
          {isAlert && (
            <div className={cn('mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border',
              student.level === 'critico' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-orange-100 text-orange-800 border-orange-200'
            )}>
              <LvlIcon className="w-4 h-4 shrink-0" />
              {student.level === 'critico' ? 'Este estudiante requiere intervención urgente del equipo docente.' : 'Este estudiante necesita seguimiento y apoyo adicional.'}
            </div>
          )}
        </div>

        <div className="flex-1 p-6 space-y-6">

          {/* Score breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Desglose de Puntuación
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Académico', pts: student.scoreBreakdown.academic, max: 60, color: 'bg-blue-500' },
                { label: 'Asistencia', pts: student.scoreBreakdown.attendance, max: 25, color: 'bg-emerald-500' },
                { label: 'Tareas', pts: student.scoreBreakdown.tasks, max: 15, color: 'bg-violet-500' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="text-slate-500 font-mono">{item.pts} / {item.max} pts</span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={cn('h-2 rounded-full transition-all', item.color)}
                      style={{ width: `${(item.pts / item.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly trend */}
          {monthlyByMonth.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Tendencia Mensual (últimos 6 meses)
              </h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyByMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toFixed(1), 'Promedio']} />
                  <Bar dataKey="promedio" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By subject */}
          {bySubject.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Promedio por Materia
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(120, bySubject.length * 32)}>
                <BarChart data={bySubject} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v: any) => [Number(v).toFixed(1), 'Promedio']} />
                  <Bar dataKey="promedio" fill="#8b5cf6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Attendance pie */}
          {attBreakdown.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Desglose de Asistencia
              </h3>
              <div className="flex items-center gap-4">
                <PieChart width={130} height={130}>
                  <Pie data={attBreakdown} cx={60} cy={60} innerRadius={30} outerRadius={55} dataKey="value">
                    {attBreakdown.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="space-y-1.5">
                  {attBreakdown.map(item => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-slate-600">{item.name}:</span>
                      <span className="font-bold text-slate-800">{item.value}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 pt-1">{myRecords.length} registros totales</p>
                </div>
              </div>
              {/* Justification notes */}
              {myRecords.filter(r => r.status === 'excused' && r.note).length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Motivos de justificación</p>
                  {myRecords.filter(r => r.status === 'excused' && r.note).map((r, i) => (
                    <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                      <span className="text-blue-400 mt-0.5">›</span>
                      <p className="text-xs text-blue-800">{r.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tasks summary */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Tareas
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-2xl font-bold text-emerald-600">{tasksSubmitted}</p>
                <p className="text-xs text-emerald-700 font-medium">Entregadas</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                <p className="text-2xl font-bold text-orange-600">{Math.max(0, tasksPending)}</p>
                <p className="text-xs text-orange-700 font-medium">Pendientes</p>
              </div>
            </div>
            {relevantTasks.length > 0 && (
              <p className="text-xs text-slate-400 mt-2 text-center">{relevantTasks.length} tareas asignadas en total</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Gestión Tab ─────────────────────────────────────────────────────────────

type GestionStudent = Student & {
  profile?: { full_name: string; email: string; avatar_url?: string | null }
  gradeName: string
  sectionName: string
  enrollmentId: string | null
  enrollSectionId: string | null
}

function GestionTab() {
  const [students,  setStudents]  = useState<GestionStudent[]>([])
  const [grades,    setGrades]    = useState<{ id: string; name: string }[]>([])
  const [sections,  setSections]  = useState<{ id: string; name: string; grade_id: string }[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [selected,  setSelected]  = useState<GestionStudent | null>(null)
  const [selGradeId, setSelGradeId] = useState('')
  const [gSearch, setGSearch] = useState('')
  const [form, setForm] = useState({
    // Básico
    full_name: '', nie: '', section_id: '',
    date_of_birth: '', emergency_contact: '',
    avatar_url: '' as string | null,
    // Personales
    gender: '', nationality: '', id_type: '', address: '',
    handedness: '', shirt_size: '', pants_size: '', skirt_size: '',
    // Académico / Desarrollo
    previous_school: '', interests: '',
    special_needs: false, special_needs_description: '', professional_support: false,
    extracurricular: '',
    // Autorizaciones
    auth_exit: false, auth_photos: false, auth_internet: false,
    // Otros
    siblings_in_school: false, siblings_info: '', additional_info: '',
    // Salud (tabla student_health)
    blood_type: '', allergies: '', medical_conditions: '', medications: '',
    doctor_name: '', doctor_phone: '', insurance_provider: '', insurance_number: '', health_notes: '',
  })
  const [healthId, setHealthId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadStudents = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch grades + sections
      const [{ data: gradesData }, { data: sectionsData }] = await Promise.all([
        supabase.from('grades').select('id, name').order('sort_order'),
        supabase.from('sections').select('id, name, grade_id').order('name'),
      ])
      const gList = gradesData ?? []
      const sList = sectionsData ?? []
      setGrades(gList)
      setSections(sList)
      const gradeMap   = new Map(gList.map((g: any) => [g.id, g]))
      const sectionMap = new Map(sList.map((s: any) => [s.id, s]))

      // 2. Fetch students with profiles
      const { data: studData } = await supabase
        .from('students')
        .select('*, profile:profiles!students_user_id_fkey(full_name, email, avatar_url)')
        .order('created_at', { ascending: false })
      const stud: any[] = studData ?? []
      if (stud.length === 0) { setStudents([]); return }

      // 3. Get enrollments — prefer current school year, fallback to any year
      const { data: syData } = await supabase
        .from('school_years').select('id').eq('is_current', true).maybeSingle()
      const studentIds = stud.map((s: any) => s.id)

      let enrollsData: any[] = []
      if (syData) {
        const { data } = await supabase
          .from('enrollments').select('id, student_id, section_id')
          .eq('school_year_id', syData.id).in('student_id', studentIds)
        enrollsData = data ?? []
      }
      // If no current year or no results, fall back to all enrollments (no order — no created_at column)
      if (enrollsData.length === 0) {
        const { data } = await supabase
          .from('enrollments').select('id, student_id, section_id')
          .in('student_id', studentIds)
        enrollsData = data ?? []
      }
      // Keep one enrollment per student (first found)
      const enrollMap = new Map<string, { id: string; section_id: string }>()
      for (const e of enrollsData) {
        if (!enrollMap.has(e.student_id)) enrollMap.set(e.student_id, e)
      }

      // 4. Merge
      const merged: GestionStudent[] = stud.map((s: any) => {
        const enroll  = enrollMap.get(s.id)
        const section = enroll ? sectionMap.get(enroll.section_id) as any : null
        const grade   = section ? gradeMap.get(section.grade_id) as any : null
        return {
          ...s,
          enrollmentId:   enroll?.id       ?? null,
          enrollSectionId: enroll?.section_id ?? null,
          gradeName:   grade?.name   ?? s.grade_level ?? '—',
          sectionName: section?.name ?? s.section     ?? '—',
        }
      })
      setStudents(merged)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadStudents().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadStudents])

  const openEdit = async (s: GestionStudent) => {
    setSelected(s)
    const gradeId = s.enrollSectionId
      ? (sections.find(sec => sec.id === s.enrollSectionId)?.grade_id ?? '')
      : ''
    setSelGradeId(gradeId)

    // Load address from profile
    const { data: profileData } = await supabase.from('profiles').select('address').eq('id', s.user_id).maybeSingle()

    // Load health data
    const { data: healthData } = await supabase.from('student_health').select('*').eq('student_id', s.id).maybeSingle()
    setHealthId((healthData as any)?.id ?? null)

    setForm({
      full_name:         (s as any).profile?.full_name ?? '',
      nie:               (s as any).nie ?? s.enrollment_number ?? '',
      section_id:        s.enrollSectionId ?? '',
      date_of_birth:     s.date_of_birth ?? '',
      emergency_contact: s.emergency_contact ?? '',
      avatar_url:        (s as any).profile?.avatar_url ?? null,
      // Personales
      gender:            (s as any).gender ?? '',
      nationality:       (s as any).nationality ?? '',
      id_type:           (s as any).id_type ?? '',
      address:           (profileData as any)?.address ?? '',
      handedness:        (s as any).handedness ?? '',
      shirt_size:        (s as any).shirt_size ?? '',
      pants_size:        (s as any).pants_size ?? '',
      skirt_size:        (s as any).skirt_size ?? '',
      // Académico / Desarrollo
      previous_school:   (s as any).previous_school ?? '',
      interests:         (s as any).interests ?? '',
      special_needs:     (s as any).special_needs ?? false,
      special_needs_description: (s as any).special_needs_description ?? '',
      professional_support: (s as any).professional_support ?? false,
      extracurricular:   (s as any).extracurricular ?? '',
      // Autorizaciones
      auth_exit:         (s as any).auth_exit ?? false,
      auth_photos:       (s as any).auth_photos ?? false,
      auth_internet:     (s as any).auth_internet ?? false,
      // Otros
      siblings_in_school: (s as any).siblings_in_school ?? false,
      siblings_info:     (s as any).siblings_info ?? '',
      additional_info:   (s as any).additional_info ?? '',
      // Salud
      blood_type:        (healthData as any)?.blood_type ?? '',
      allergies:         (healthData as any)?.allergies ?? '',
      medical_conditions: (healthData as any)?.medical_conditions ?? '',
      medications:       (healthData as any)?.medications ?? '',
      doctor_name:       (healthData as any)?.doctor_name ?? '',
      doctor_phone:      (healthData as any)?.doctor_phone ?? '',
      insurance_provider: (healthData as any)?.insurance_provider ?? '',
      insurance_number:  (healthData as any)?.insurance_number ?? '',
      health_notes:      (healthData as any)?.notes ?? '',
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)

    // Update students table
    const studUpdate: Record<string, unknown> = {
      enrollment_number:        form.nie.trim() || selected.enrollment_number,
      nie:                      form.nie.trim() || null,
      date_of_birth:            form.date_of_birth || null,
      emergency_contact:        form.emergency_contact || null,
      gender:                   form.gender || null,
      nationality:              form.nationality.trim() || null,
      id_type:                  form.id_type.trim() || null,
      handedness:               form.handedness || null,
      shirt_size:               form.shirt_size.trim() || null,
      pants_size:               form.pants_size.trim() || null,
      skirt_size:               form.skirt_size.trim() || null,
      previous_school:          form.previous_school.trim() || null,
      interests:                form.interests.trim() || null,
      special_needs:            form.special_needs,
      special_needs_description: form.special_needs_description.trim() || null,
      professional_support:     form.professional_support,
      extracurricular:          form.extracurricular.trim() || null,
      auth_exit:                form.auth_exit,
      auth_photos:              form.auth_photos,
      auth_internet:            form.auth_internet,
      siblings_in_school:       form.siblings_in_school,
      siblings_info:            form.siblings_info.trim() || null,
      additional_info:          form.additional_info.trim() || null,
    }
    if (form.full_name.trim()) studUpdate.display_name = form.full_name.trim()
    const { error } = await supabase.from('students').update(studUpdate).eq('id', selected.id)

    // Update enrollment section if changed
    if (form.section_id && selected.enrollmentId) {
      await supabase.from('enrollments').update({ section_id: form.section_id }).eq('id', selected.enrollmentId)
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = { address: form.address.trim() || null }
    if (form.full_name.trim()) profileUpdate.full_name = form.full_name.trim()
    if (form.avatar_url !== null) profileUpdate.avatar_url = form.avatar_url || null
    await supabase.from('profiles').update(profileUpdate).eq('id', selected.user_id)

    // Upsert health data
    const healthPayload: Record<string, unknown> = {
      student_id:        selected.id,
      blood_type:        form.blood_type || null,
      allergies:         form.allergies.trim() || null,
      medical_conditions: form.medical_conditions.trim() || null,
      medications:       form.medications.trim() || null,
      doctor_name:       form.doctor_name.trim() || null,
      doctor_phone:      form.doctor_phone.trim() || null,
      insurance_provider: form.insurance_provider.trim() || null,
      insurance_number:  form.insurance_number.trim() || null,
      notes:             form.health_notes.trim() || null,
    }
    if (healthId) {
      await supabase.from('student_health').update(healthPayload).eq('id', healthId)
    } else {
      await supabase.from('student_health').insert(healthPayload)
    }

    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Estudiante actualizado')
    setModal(false)
    loadStudents()
  }

  const sectionsForGrade = sections.filter(s => s.grade_id === selGradeId)

  const gFiltered = gSearch
    ? students.filter(s => {
        const q = gSearch.toLowerCase()
        const name = ((s as any).profile?.full_name ?? '').toLowerCase()
        const email = ((s as any).profile?.email ?? '').toLowerCase()
        const nie = ((s as any).nie ?? s.enrollment_number ?? '').toLowerCase()
        return name.includes(q) || email.includes(q) || nie.includes(q)
      })
    : students

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
        <GraduationCap className="w-4 h-4 shrink-0" />
        Para crear o editar estudiantes, usa <strong>Matrícula</strong>. Aquí puedes consultar y editar datos básicos.
      </div>

      {/* Search for gestión */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          className="input pl-9 py-2 text-sm w-full"
          placeholder="Buscar por nombre, NIE o correo..."
          value={gSearch}
          onChange={e => setGSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estudiante</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">NIE</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Grado / Sección</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gFiltered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shrink-0 overflow-hidden">
                        {(s as any).profile?.avatar_url
                          ? <img src={(s as any).profile.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <span className="text-white text-[10px] font-bold">
                              {((s as any).profile?.full_name ?? 'E').split(' ').slice(0,2).map((n: string) => n[0]).join('')}
                            </span>
                        }
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{(s as any).profile?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{(s as any).profile?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                      {(s as any).nie ?? s.enrollment_number ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800 font-medium text-sm">{s.gradeName}</p>
                    <p className="text-xs text-slate-400">{s.sectionName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', s.is_active ? 'text-emerald-600' : 'text-slate-400')}>
                      {s.is_active ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-eos-600 hover:bg-eos-50 rounded-lg transition-colors" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {gFiltered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  {gSearch ? 'No hay estudiantes que coincidan con la búsqueda' : 'No hay estudiantes registrados'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Editar Estudiante">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* Foto */}
          <div className="flex items-center gap-4 pb-3 border-b border-slate-100">
            <PhotoUpload currentUrl={form.avatar_url} onUpload={url => setForm(f => ({ ...f, avatar_url: url }))} folder="students" size="lg" shape="circle" />
            <div className="text-xs text-slate-400 space-y-0.5">
              <p className="font-medium text-slate-600">Foto del estudiante</p>
              <p>JPG, PNG o WebP — máx. 5 MB</p>
            </div>
          </div>

          {/* I. Datos Personales */}
          <EditSection title="I. Datos Personales">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nombre completo</label>
                <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">NIE / N° documento</label>
                <input className="input" value={form.nie} onChange={e => setForm(f => ({ ...f, nie: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo de documento</label>
                <select className="input" value={form.id_type} onChange={e => setForm(f => ({ ...f, id_type: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  <option value="Partida de nacimiento">Partida de nacimiento</option>
                  <option value="DUI">DUI</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="label">Fecha de Nacimiento</label>
                <input type="date" className="input" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </div>
              <div>
                <label className="label">Sexo</label>
                <select className="input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
              <div>
                <label className="label">Nacionalidad</label>
                <input className="input" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="Ej: Salvadoreña" />
              </div>
              <div>
                <label className="label">Lateralidad</label>
                <select className="input" value={form.handedness} onChange={e => setForm(f => ({ ...f, handedness: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  <option value="diestro">Diestro</option>
                  <option value="zurdo">Zurdo</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Dirección</label>
                <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección de residencia" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">Talla camisa</label>
                <input className="input" value={form.shirt_size} onChange={e => setForm(f => ({ ...f, shirt_size: e.target.value }))} placeholder="Ej: M, 10" />
              </div>
              <div>
                <label className="label">Talla pantalón</label>
                <input className="input" value={form.pants_size} onChange={e => setForm(f => ({ ...f, pants_size: e.target.value }))} placeholder="Ej: 28" />
              </div>
              <div>
                <label className="label">Talla falda</label>
                <input className="input" value={form.skirt_size} onChange={e => setForm(f => ({ ...f, skirt_size: e.target.value }))} placeholder="Ej: 28" />
              </div>
            </div>
          </EditSection>

          {/* II. Académico */}
          <EditSection title="II. Información Académica">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Grado</label>
                <select className="input" value={selGradeId} onChange={e => { setSelGradeId(e.target.value); setForm(f => ({ ...f, section_id: '' })) }}>
                  <option value="">Seleccionar...</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Sección</label>
                <select className="input" value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))} disabled={!selGradeId}>
                  <option value="">Seleccionar...</option>
                  {sectionsForGrade.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Escuela anterior</label>
                <input className="input" value={form.previous_school} onChange={e => setForm(f => ({ ...f, previous_school: e.target.value }))} placeholder="Nombre de la escuela anterior" />
              </div>
            </div>
          </EditSection>

          {/* III. Salud */}
          <EditSection title="III. Información de Salud">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tipo de sangre</label>
                <select className="input" value={form.blood_type} onChange={e => setForm(f => ({ ...f, blood_type: e.target.value }))}>
                  <option value="">No especificado</option>
                  {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Contacto de emergencia</label>
                <input className="input" value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} placeholder="Nombre y teléfono" />
              </div>
              <div>
                <label className="label">Médico tratante</label>
                <input className="input" value={form.doctor_name} onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Teléfono médico</label>
                <input type="tel" className="input" value={form.doctor_phone} onChange={e => setForm(f => ({ ...f, doctor_phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Aseguradora</label>
                <input className="input" value={form.insurance_provider} onChange={e => setForm(f => ({ ...f, insurance_provider: e.target.value }))} />
              </div>
              <div>
                <label className="label">N° de seguro</label>
                <input className="input" value={form.insurance_number} onChange={e => setForm(f => ({ ...f, insurance_number: e.target.value }))} />
              </div>
            </div>
            {(['allergies', 'medical_conditions', 'medications'] as const).map(field => (
              <div key={field} className="mt-3">
                <label className="label">{field === 'allergies' ? 'Alergias' : field === 'medical_conditions' ? 'Condiciones médicas' : 'Medicamentos'}</label>
                <textarea className="input resize-none" rows={2} value={(form as any)[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="mt-3">
              <label className="label">Notas adicionales de salud</label>
              <textarea className="input resize-none" rows={2} value={form.health_notes} onChange={e => setForm(f => ({ ...f, health_notes: e.target.value }))} />
            </div>
          </EditSection>

          {/* IV. Desarrollo */}
          <EditSection title="IV. Comportamiento y Desarrollo">
            <div>
              <label className="label">Intereses y habilidades</label>
              <textarea className="input resize-none" rows={2} value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="Ej: fútbol, música, arte..." />
            </div>
            <div className="mt-3">
              <label className="label">Actividades extracurriculares</label>
              <input className="input" value={form.extracurricular} onChange={e => setForm(f => ({ ...f, extracurricular: e.target.value }))} />
            </div>
            <EditCheckRow label="Necesidades especiales" checked={form.special_needs} onToggle={() => setForm(f => ({ ...f, special_needs: !f.special_needs }))} />
            {form.special_needs && (
              <div className="mt-2">
                <label className="label">Descripción de necesidades especiales</label>
                <textarea className="input resize-none" rows={2} value={form.special_needs_description} onChange={e => setForm(f => ({ ...f, special_needs_description: e.target.value }))} />
              </div>
            )}
            {form.special_needs && (
              <EditCheckRow label="Acompañado por profesional o institución" checked={form.professional_support} onToggle={() => setForm(f => ({ ...f, professional_support: !f.professional_support }))} />
            )}
          </EditSection>

          {/* V. Autorizaciones */}
          <EditSection title="V. Autorizaciones">
            <div className="space-y-2">
              <EditCheckRow label="Autorizo salida fuera del horario escolar" checked={form.auth_exit} onToggle={() => setForm(f => ({ ...f, auth_exit: !f.auth_exit }))} />
              <EditCheckRow label="Autorizo fotografías o videos para actividades escolares" checked={form.auth_photos} onToggle={() => setForm(f => ({ ...f, auth_photos: !f.auth_photos }))} />
              <EditCheckRow label="Autorizo uso de internet y equipos escolares" checked={form.auth_internet} onToggle={() => setForm(f => ({ ...f, auth_internet: !f.auth_internet }))} />
            </div>
          </EditSection>

          {/* VI. Otros */}
          <EditSection title="VI. Otros Datos">
            <EditCheckRow label="¿Tiene hermanos en la institución?" checked={form.siblings_in_school} onToggle={() => setForm(f => ({ ...f, siblings_in_school: !f.siblings_in_school }))} />
            {form.siblings_in_school && (
              <div className="mt-2">
                <label className="label">Nombre y grado de hermanos</label>
                <textarea className="input resize-none" rows={2} value={form.siblings_info} onChange={e => setForm(f => ({ ...f, siblings_info: e.target.value }))} />
              </div>
            )}
            <div className="mt-3">
              <label className="label">Información adicional</label>
              <textarea className="input resize-none" rows={2} value={form.additional_info} onChange={e => setForm(f => ({ ...f, additional_info: e.target.value }))} />
            </div>
          </EditSection>
        </div>

        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
          <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EstudiantesPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'ranking' | 'gestion'>('ranking')
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<StudentCard[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterLevel, setFilterLevel] = useState<'all' | PerfLevel | 'alerts'>('all')
  const [showInactive, setShowInactive] = useState(false)

  // Raw data (kept in memory for drawer)
  const [rawMonthlyGrades, setRawMonthlyGrades] = useState<any[]>([])
  const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([])
  const [rawSessions, setRawSessions] = useState<any[]>([])
  const [rawSubmissions, setRawSubmissions] = useState<any[]>([])
  const [rawTasks, setRawTasks] = useState<any[]>([])
  const [rawClassrooms, setRawClassrooms] = useState<any[]>([])
  const [taMap, setTaMap] = useState<Map<string, string>>(new Map())

  // Drawer
  const [drawerStudent, setDrawerStudent] = useState<StudentCard | null>(null)

  const loadRanking = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Active school year
      const { data: syData } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      const sy: any = syData
      if (!sy) { setLoading(false); return }

      // 2. All enrollments
      const { data: enrollsData } = await db.from('enrollments').select('id, student_id, section_id').eq('school_year_id', sy.id)
      const enrolls: any[] = enrollsData ?? []
      if (enrolls.length === 0) { setLoading(false); return }

      const enrollStudentIds = [...new Set(enrolls.map((e: any) => e.student_id))] as string[]
      const sectionIds = [...new Set(enrolls.map((e: any) => e.section_id))] as string[]

      // 3. Students (incluye inactivos para mostrarlos en el módulo)
      const { data: studentsData } = await db.from('students').select('id, user_id, enrollment_number, grade_level, section, is_active').in('id', enrollStudentIds)
      const students: any[] = studentsData ?? []
      const studentUserIds = [...new Set(students.map((s: any) => s.user_id).filter(Boolean))] as string[]

      // 4. Profiles
      const { data: profilesData } = studentUserIds.length > 0
        ? await db.from('profiles').select('id, full_name, email, avatar_url').in('id', studentUserIds)
        : { data: [] }
      const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))

      // 5. Sections
      const { data: sectionsData } = sectionIds.length > 0
        ? await db.from('sections').select('id, name, grade_id').in('id', sectionIds)
        : { data: [] }
      const sectionMap = new Map((sectionsData ?? []).map((s: any) => [s.id, s]))

      // 6. Grades
      const gradeIds = [...new Set((sectionsData ?? []).map((s: any) => s.grade_id))] as string[]
      const { data: gradesData } = gradeIds.length > 0
        ? await db.from('grades').select('id, name, code').in('id', gradeIds)
        : { data: [] }
      const gradeMap = new Map((gradesData ?? []).map((g: any) => [g.id, g]))

      // 7. Teacher assignments
      const { data: taData } = sectionIds.length > 0
        ? await db.from('teacher_assignments').select('id, section_id, grade_subject_id').in('section_id', sectionIds).eq('school_year_id', sy.id)
        : { data: [] }
      const tas: any[] = taData ?? []
      const gsIds = [...new Set(tas.map((t: any) => t.grade_subject_id))] as string[]

      // 8. Grade subjects
      const { data: gsData } = gsIds.length > 0
        ? await db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds)
        : { data: [] }
      const gsList: any[] = gsData ?? []
      const scIds = [...new Set(gsList.map((g: any) => g.subject_catalog_id))] as string[]

      // 9. Subject catalog
      const { data: scData } = scIds.length > 0
        ? await db.from('subject_catalog').select('id, name').in('id', scIds)
        : { data: [] }
      const scMap = new Map((scData ?? []).map((c: any) => [c.id, c.name]))
      const gsMap = new Map(gsList.map((g: any) => [g.id, scMap.get(g.subject_catalog_id) ?? '—']))
      const builtTaMap = new Map(tas.map((ta: any) => [ta.id, gsMap.get(ta.grade_subject_id) ?? '—']))
      setTaMap(builtTaMap)

      // 10. Monthly grades
      const { data: mgData } = enrollStudentIds.length > 0
        ? await db.from('monthly_grades').select('student_id, teacher_assignment_id, month, final_score').in('student_id', enrollStudentIds).eq('school_year_id', sy.id).not('final_score', 'is', null)
        : { data: [] }
      const mgs: any[] = mgData ?? []
      setRawMonthlyGrades(mgs)

      // 11. Attendance sessions
      const { data: sessionsData } = sectionIds.length > 0
        ? await db.from('attendance_sessions').select('id, section_id').in('section_id', sectionIds)
        : { data: [] }
      const sessions: any[] = sessionsData ?? []
      setRawSessions(sessions)

      // 12. Attendance records
      const sessionIds2 = sessions.map((s: any) => s.id)
      const { data: attData } = enrollStudentIds.length > 0 && sessionIds2.length > 0
        ? await db.from('attendance_records').select('student_id, attendance_session_id, status, note').in('student_id', enrollStudentIds)
        : { data: [] }
      const attRecords: any[] = attData ?? []
      setRawAttendanceRecords(attRecords)

      // 13. Classrooms
      const { data: classroomsData } = sectionIds.length > 0
        ? await db.from('classrooms').select('id, section_id').eq('school_year_id', sy.id).in('section_id', sectionIds)
        : { data: [] }
      const classrooms: any[] = classroomsData ?? []
      setRawClassrooms(classrooms)
      const classroomIds = classrooms.map((c: any) => c.id)

      // 14. Classroom tasks
      const { data: tasksData } = classroomIds.length > 0
        ? await db.from('classroom_tasks').select('id, classroom_id').in('classroom_id', classroomIds)
        : { data: [] }
      const tasks: any[] = tasksData ?? []
      setRawTasks(tasks)
      const taskIds = tasks.map((t: any) => t.id)

      // 15. Task submissions (graceful)
      let submissions: any[] = []
      try {
        const { data: subData, error: subError } = enrollStudentIds.length > 0 && taskIds.length > 0
          ? await db.from('classroom_task_submissions').select('student_id, task_id, status').in('student_id', enrollStudentIds)
          : { data: [], error: null }
        if (!subError) submissions = subData ?? []
      } catch { submissions = [] }
      setRawSubmissions(submissions)

      // ── Build section→classroomIds lookup ──
      const sectionToClassroomIds = new Map<string, string[]>()
      for (const c of classrooms) {
        if (!sectionToClassroomIds.has(c.section_id)) sectionToClassroomIds.set(c.section_id, [])
        sectionToClassroomIds.get(c.section_id)!.push(c.id)
      }

      // ── Build student cards ──
      const enrollBySid = new Map<string, string>()  // studentId → sectionId
      for (const e of enrolls) enrollBySid.set(e.student_id, e.section_id)

      const sessionsBySid = new Map<string, Set<string>>()  // sectionId → sessionIds
      for (const s of sessions) {
        if (!sessionsBySid.has(s.section_id)) sessionsBySid.set(s.section_id, new Set())
        sessionsBySid.get(s.section_id)!.add(s.id)
      }

      const builtCards: StudentCard[] = students.map(student => {
        const prof = profileMap.get(student.user_id)
        const sectionId = enrollBySid.get(student.id) ?? ''
        const section = sectionMap.get(sectionId) as any
        const grade = section ? gradeMap.get(section.grade_id) as any : null

        // Academic score
        const myGrades = mgs.filter(g => g.student_id === student.id)
        const validScores = myGrades.map(g => Number(g.final_score)).filter(n => !isNaN(n))
        const avgAcademic = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null
        const academicPts = avgAcademic != null ? Math.round((avgAcademic / 10) * 60) : 25

        // Attendance score
        const mySectionSessions = sessionsBySid.get(sectionId)
        const myRecords = attRecords.filter(r => r.student_id === student.id && mySectionSessions?.has(r.attendance_session_id))
        const totalRecs = myRecords.length
        const presentRecs = myRecords.filter(r => r.status === 'present' || r.status === 'late').length
        const attendancePct = totalRecs > 0 ? Math.round((presentRecs / totalRecs) * 100) : null
        const attendancePts = totalRecs > 0 ? Math.round((presentRecs / totalRecs) * 25) : 12

        // Tasks score
        const myCrIds = sectionToClassroomIds.get(sectionId) ?? []
        const myTasks = tasks.filter(t => myCrIds.includes(t.classroom_id))
        const mySubs = submissions.filter(s => s.student_id === student.id && myTasks.some(t => t.id === s.task_id))
        const submittedCount = mySubs.filter(s => s.status === 'submitted' || s.status === 'graded').length
        const tasksPct = myTasks.length > 0 ? Math.round((submittedCount / myTasks.length) * 100) : null
        const tasksPts = myTasks.length > 0 ? Math.round((submittedCount / myTasks.length) * 15) : 8

        const total = Math.min(100, academicPts + attendancePts + tasksPts)

        return {
          studentId: student.id,
          userId: student.user_id,
          studentName: prof?.full_name ?? 'Estudiante',
          enrollmentNumber: student.enrollment_number ?? '',
          sectionId,
          sectionName: section?.name ?? '—',
          gradeName: grade?.name ?? student.grade_level ?? '—',
          gradeCode: grade?.code ?? '',
          avgAcademic,
          attendancePct,
          tasksPct,
          performanceScore: total,
          rank: 0,  // assigned after sort
          level: calcLevel(total),
          scoreBreakdown: { academic: academicPts, attendance: attendancePts, tasks: tasksPts },
          isActive: student.is_active !== false,
          avatarUrl: prof?.avatar_url ?? null,
        }
      }).sort((a, b) => b.performanceScore - a.performanceScore)
        .map((c, i) => ({ ...c, rank: i + 1 }))

      setCards(builtCards)
    } catch (e) {
      console.error(e)
      toast.error('Error al cargar datos de ranking')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadRanking().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadRanking])

  // Derived grade/section options
  const gradeOptions = useMemo(() => [...new Set(cards.map(c => c.gradeName))].sort(), [cards])
  const sectionOptions = useMemo(() => {
    const base = filterGrade ? cards.filter(c => c.gradeName === filterGrade) : cards
    return [...new Set(base.map(c => c.sectionName))].sort()
  }, [cards, filterGrade])

  // Filtered cards
  const filtered = useMemo(() => {
    return cards.filter(c => {
      if (!showInactive && !c.isActive) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.studentName.toLowerCase().includes(q) && !c.enrollmentNumber.toLowerCase().includes(q)) return false
      }
      if (filterGrade && c.gradeName !== filterGrade) return false
      if (filterSection && c.sectionName !== filterSection) return false
      if (filterLevel === 'alerts') { if (c.level !== 'bajo' && c.level !== 'critico') return false }
      else if (filterLevel !== 'all' && c.level !== filterLevel) return false
      return true
    })
  }, [cards, search, filterGrade, filterSection, filterLevel, showInactive])

  // Stats
  const stats = useMemo(() => {
    const total = cards.length
    const avgScore = total > 0 ? cards.reduce((s, c) => s + c.performanceScore, 0) / total : 0
    const avgAtt = cards.filter(c => c.attendancePct != null)
    const attAvg = avgAtt.length > 0 ? avgAtt.reduce((s, c) => s + c.attendancePct!, 0) / avgAtt.length : 0
    const alerts = cards.filter(c => c.level === 'bajo' || c.level === 'critico').length
    return { total, avgScore: Math.round(avgScore), attAvg: Math.round(attAvg), alerts }
  }, [cards])

  const criticalStudents = useMemo(() => cards.filter(c => c.level === 'critico'), [cards])
  const top3 = cards.slice(0, 3)

  // Drawer data
  const drawerData: DrawerData | null = drawerStudent ? {
    student: drawerStudent,
    allMonthlyGrades: rawMonthlyGrades,
    taMap,
    allAttendanceRecords: rawAttendanceRecords,
    allSessions: rawSessions,
    allSubmissions: rawSubmissions,
    allTasks: rawTasks,
    classroomIds: rawClassrooms.filter(c => c.section_id === drawerStudent.sectionId).map(c => c.id),
  } : null

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Page header */}
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="page-title">Estudiantes</h1>
            <p className="page-subtitle">{cards.length} estudiantes activos</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'ranking', label: 'Ranking & Supervisión', icon: BarChart3 },
          { id: 'gestion', label: 'Gestión', icon: Users },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gestion' && <GestionTab />}

      {tab === 'ranking' && (
        <>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Calculando rankings...</p>
            </div>
          ) : (
            <>
              {/* Red alert banner */}
              {criticalStudents.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
                  <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      {criticalStudents.length} estudiante{criticalStudents.length > 1 ? 's' : ''} en estado crítico
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      {criticalStudents.map(s => s.studentName.split(' ').slice(0,2).join(' ')).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Estudiantes', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', sub: 'activos este año' },
                  { label: 'Puntaje Promedio', value: `${stats.avgScore} pts`, icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50', sub: 'promedio del colegio' },
                  { label: '% Asistencia', value: `${stats.attAvg}%`, icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'asistencia general' },
                  { label: 'Con Alertas', value: stats.alerts, icon: ShieldAlert, color: stats.alerts > 0 ? 'text-red-600' : 'text-slate-400', bg: stats.alerts > 0 ? 'bg-red-50' : 'bg-slate-50', sub: 'bajo o crítico' },
                ].map(s => (
                  <div key={s.label} className="card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', s.bg)}>
                        <s.icon className={cn('w-5 h-5', s.color)} />
                      </div>
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600">{s.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Podio */}
              {top3.length >= 2 && (
                <div className="card p-6">
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-amber-500" /> Podio de Honor
                    <span className="text-xs text-slate-400 font-normal ml-1">— Toca para ver detalles</span>
                  </h2>
                  <Podio top3={top3} onSelect={setDrawerStudent} />
                </div>
              )}

              {/* Filters */}
              <div className="card p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-48">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      className="input pl-9 py-2 text-sm"
                      placeholder="Buscar por nombre o NIE..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <select className="input py-2 text-sm w-auto" value={filterGrade} onChange={e => { setFilterGrade(e.target.value); setFilterSection('') }}>
                    <option value="">Todos los grados</option>
                    {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className="input py-2 text-sm w-auto" value={filterSection} onChange={e => setFilterSection(e.target.value)}>
                    <option value="">Todas las secciones</option>
                    {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={() => setShowInactive(p => !p)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${showInactive ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {showInactive ? 'Ocultando inactivos' : 'Ver inactivos'}
                  </button>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'elite', label: 'Élite' },
                      { id: 'destacado', label: 'Destacado' },
                      { id: 'estable', label: 'Estable' },
                      { id: 'alerts', label: '⚠ Alertas' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFilterLevel(f.id as any)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                          filterLevel === f.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Student list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{filtered.length} estudiante{filtered.length !== 1 ? 's' : ''} mostrado{filtered.length !== 1 ? 's' : ''}</p>
                </div>
                {filtered.length === 0 ? (
                  <div className="card p-12 text-center">
                    <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">No hay estudiantes que coincidan con los filtros aplicados.</p>
                  </div>
                ) : (
                  filtered.map(student => (
                    <StudentCardItem key={student.studentId} student={student} onSelect={setDrawerStudent} />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Detail Drawer */}
      {drawerData && (
        <DetailDrawer data={drawerData} onClose={() => setDrawerStudent(null)} />
      )}
    </div>
  )
}

// ─── Helpers para el modal de edición ────────────────────────────────────────

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">{title}</p>
      {children}
    </div>
  )
}

function EditCheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2.5 w-full text-left group py-1 mt-2">
      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors
        ${checked ? 'bg-blue-500 border-blue-500' : 'border-slate-300 group-hover:border-blue-400'}`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  )
}
