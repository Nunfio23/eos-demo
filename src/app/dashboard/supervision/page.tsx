'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users, BookOpen, FileText, TrendingUp,
  AlertTriangle, CheckCircle2, X, GraduationCap,
  Search, ChevronRight, Star, BarChart3, Activity,
  Trophy, Medal, Award, AlertOctagon, ShieldAlert,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Types ────────────────────────────────────────────────────────────────────

type PerfLevel = 'elite' | 'destacado' | 'estable' | 'bajo' | 'critico'

interface TeacherCard {
  teacherId: string
  profileId: string
  teacherName: string
  teacherEmail: string
  photoUrl: string | null
  assignments: Assignment[]
  guionesTotal: number
  guionesThisMonth: number
  lastGuionDate: string | null
  examsTotal: number
  tasksTotal: number
  avgStudentScore: number | null  // 0–10
  studentsWithGrades: number      // # students who have at least 1 grade
  totalStudents: number           // total enrolled students
  status: 'active' | 'inactive'
  // Ranking
  performanceScore: number        // 0–100
  rank: number
  level: PerfLevel
  scoreBreakdown: { guiones: number; gradeEntry: number; studentPerf: number; content: number }
  // Meta for drawer
  expectedGuiones: number         // target guiones/month = assignments.length × 4
  // Grade inflation detection
  gradeStdDev: number | null      // standard deviation of student scores
  gradeInflationRisk: boolean     // avg > 9.2 AND std dev < 0.8
}

interface Assignment {
  taId: string
  sectionId: string
  sectionName: string
  gradeName: string
  subjectName: string
  classroomId: string | null
}

interface TeacherDetail {
  teacher: TeacherCard
  guionesByMonth: { month: string; count: number }[]
  subjects: { name: string; grade: string; avgScore: number | null; studentCount: number }[]
  recentGuiones: { id: string; date: string; title: string | null; section: string }[]
  activityBreakdown: { name: string; value: number; color: string }[]
  attendanceGradeCorrelation: number | null  // Pearson r between attendance% and grade
  correlationPairs: number                   // # students used for correlation
}

// Pearson correlation coefficient
function pearsonR(pairs: [number, number][]): number | null {
  const n = pairs.length
  if (n < 4) return null
  const xs = pairs.map(p => p[0])
  const ys = pairs.map(p => p[1])
  const mx = xs.reduce((a, b) => a + b) / n
  const my = ys.reduce((a, b) => a + b) / n
  const num = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0)
  const dx  = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0))
  const dy  = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0))
  if (dx === 0 || dy === 0) return null
  return num / (dx * dy)
}

// ─── Performance config ────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<PerfLevel, {
  label: string; badge: string; color: string; bg: string;
  border: string; icon: React.ElementType; alert: string | null
}> = {
  elite:     { label: 'Élite',          badge: '🏆', color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-300', icon: Trophy,      alert: null },
  destacado: { label: 'Destacado',      badge: '⭐', color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-300', icon: Star,        alert: null },
  estable:   { label: 'Estable',        badge: '✓',  color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2, alert: null },
  bajo:      { label: 'Bajo rendimiento','badge': '⚠', color: 'text-orange-700',bg: 'bg-orange-50',  border: 'border-orange-300', icon: AlertTriangle, alert: 'Rendimiento por debajo del estándar. Requiere seguimiento y capacitación.' },
  critico:   { label: 'Crítico',        badge: '🚨', color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-300',    icon: AlertOctagon,  alert: 'Rendimiento crítico. Considerar reemplazo o plan de mejora inmediata.' },
}

function calcLevel(score: number): PerfLevel {
  if (score >= 80) return 'elite'
  if (score >= 62) return 'destacado'
  if (score >= 44) return 'estable'
  if (score >= 22) return 'bajo'
  return 'critico'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Score bar color
function scoreBarColor(score: number) {
  if (score >= 82) return 'bg-amber-400'
  if (score >= 65) return 'bg-indigo-500'
  if (score >= 48) return 'bg-emerald-500'
  if (score >= 30) return 'bg-orange-400'
  return 'bg-red-500'
}

// ─── Podio Top 3 ──────────────────────────────────────────────────────────────

function Podio({ top3, onSelect }: { top3: TeacherCard[]; onSelect: (t: TeacherCard) => void }) {
  const order = [1, 0, 2] // visually: 2nd, 1st, 3rd
  const heights = ['h-24', 'h-36', 'h-16']
  const podioColors = [
    'from-slate-300 to-slate-200 border-slate-300',
    'from-amber-400 to-yellow-300 border-amber-400',
    'from-orange-300 to-amber-200 border-orange-300',
  ]
  const medals = [<Medal key="s" className="w-5 h-5 text-slate-500" />, <Trophy key="g" className="w-5 h-5 text-amber-500" />, <Award key="b" className="w-5 h-5 text-orange-400" />]

  if (top3.length === 0) return null

  return (
    <div className="card p-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h2 className="font-bold text-slate-800">Ranking de Rendimiento</h2>
        <span className="text-xs text-slate-400 ml-auto">Puntuación 0–100</span>
      </div>

      <div className="flex items-end justify-center gap-3 mb-6">
        {order.map((idx, pos) => {
          const t = top3[idx]
          if (!t) return <div key={idx} className="w-24" />
          const initials = getInitials(t.teacherName)
          return (
            <button key={t.teacherId} onClick={() => onSelect(t)}
              className="flex flex-col items-center gap-2 group cursor-pointer w-28">
              {/* Avatar + medal */}
              <div className="relative">
                {t.photoUrl ? (
                  <img src={t.photoUrl} alt={t.teacherName} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-white shadow">
                    <span className="text-indigo-700 font-bold text-sm">{initials}</span>
                  </div>
                )}
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center">
                  {medals[pos]}
                </div>
              </div>
              {/* Name */}
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-700 leading-tight group-hover:text-indigo-700 transition-colors line-clamp-2">
                  {t.teacherName.split(' ').slice(0, 2).join(' ')}
                </p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">#{t.rank}</p>
              </div>
              {/* Podium block */}
              <div className={cn(
                'w-full rounded-t-xl border-t-2 flex flex-col items-center justify-center gap-1 transition-all group-hover:scale-105',
                heights[pos], `bg-gradient-to-b ${podioColors[pos]}`
              )}>
                <span className="text-lg font-black text-slate-700 tabular-nums">{t.performanceScore}</span>
                <span className="text-[10px] font-semibold text-slate-500">pts</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Full ranking list (4th+) */}
      {top3.length > 3 && (
        <div className="space-y-1.5 mt-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Posiciones siguientes</p>
          {/* handled by the cards below — just show mini list */}
        </div>
      )}
    </div>
  )
}

// ─── Teacher Card Component ───────────────────────────────────────────────────

function TeacherCardItem({ t, onClick }: { t: TeacherCard; onClick: () => void }) {
  const initials = getInitials(t.teacherName)
  const level = LEVEL_CONFIG[t.level]
  const uniqueGrades = Array.from(new Set(t.assignments.map(a => a.gradeName)))
  const LevelIcon = level.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        'card p-4 text-left hover:shadow-md transition-all group cursor-pointer w-full border',
        t.level === 'critico' ? 'border-red-200 hover:border-red-300' :
        t.level === 'bajo'    ? 'border-orange-200 hover:border-orange-300' :
        t.level === 'elite'   ? 'border-amber-200 hover:border-amber-300' :
                                 'border-slate-100 hover:border-indigo-200'
      )}
    >
      {/* Rank badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1', level.bg, level.color)}>
          <LevelIcon className="w-3 h-3" />
          #{t.rank} · {level.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-sm font-black tabular-nums',
            t.level === 'elite' ? 'text-amber-600' :
            t.level === 'destacado' ? 'text-indigo-600' :
            t.level === 'estable' ? 'text-emerald-600' :
            t.level === 'bajo' ? 'text-orange-600' : 'text-red-600'
          )}>{t.performanceScore}</span>
          <span className="text-[10px] text-slate-400">pts</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-slate-100 rounded-full h-1 mb-3">
        <div className={cn('h-1 rounded-full transition-all', scoreBarColor(t.performanceScore))}
          style={{ width: `${t.performanceScore}%` }} />
      </div>

      {/* Avatar + info */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          {t.photoUrl ? (
            <img src={t.photoUrl} alt={t.teacherName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-700 font-bold text-xs">{initials}</span>
            </div>
          )}
          <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
            t.status === 'active' ? 'bg-emerald-500' : 'bg-red-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm leading-tight truncate group-hover:text-indigo-700 transition-colors">
            {t.teacherName}
          </h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {uniqueGrades.slice(0, 2).map(g => (
              <span key={g} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{g}</span>
            ))}
            {uniqueGrades.length > 2 && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">+{uniqueGrades.length - 2}</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 shrink-0 mt-1" />
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          {
            label: 'Guiones/mes',
            value: `${t.guionesThisMonth}/${t.expectedGuiones}`,
            color: t.guionesThisMonth === 0 ? 'text-red-600' : t.guionesThisMonth >= t.expectedGuiones ? 'text-emerald-600' : 'text-amber-600',
            bg: t.guionesThisMonth === 0 ? 'bg-red-50' : 'bg-indigo-50',
          },
          {
            label: 'Calificados',
            value: t.totalStudents > 0 ? `${Math.round((t.studentsWithGrades/t.totalStudents)*100)}%` : '—',
            color: t.studentsWithGrades === 0 ? 'text-red-600' : 'text-violet-600',
            bg: t.studentsWithGrades === 0 ? 'bg-red-50' : 'bg-violet-50',
          },
          {
            label: 'Prom. alumnos',
            value: t.avgStudentScore != null ? t.avgStudentScore.toFixed(1) : '—',
            color: t.avgStudentScore == null ? 'text-red-600' : t.avgStudentScore >= 8 ? 'text-emerald-600' : 'text-slate-600',
            bg: t.avgStudentScore == null ? 'bg-red-50' : 'bg-emerald-50',
          },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg px-1.5 py-1 text-center', s.bg)}>
            <p className={cn('text-xs font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] text-slate-400 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grade inflation warning */}
      {t.gradeInflationRisk && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-orange-50 border border-orange-100">
          <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />
          <p className="text-[10px] text-orange-600 font-medium">Notas uniformes sospechosas</p>
        </div>
      )}

      {/* Alert if critical/low */}
      {(t.level === 'critico' || t.level === 'bajo') && (
        <div className={cn('mt-3 flex items-start gap-1.5 rounded-lg p-2',
          t.level === 'critico' ? 'bg-red-50' : 'bg-orange-50')}>
          <ShieldAlert className={cn('w-3 h-3 shrink-0 mt-0.5', t.level === 'critico' ? 'text-red-500' : 'text-orange-500')} />
          <p className={cn('text-[10px] leading-snug', t.level === 'critico' ? 'text-red-600' : 'text-orange-600')}>
            {t.level === 'critico' ? 'Rendimiento crítico — requiere atención inmediata' : 'Necesita mejorar — requiere seguimiento'}
          </p>
        </div>
      )}
    </button>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ detail, totalTeachers, onClose }: { detail: TeacherDetail; totalTeachers: number; onClose: () => void }) {
  const { teacher: t } = detail
  const initials = getInitials(t.teacherName)
  const level = LEVEL_CONFIG[t.level]

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">

        {/* Header */}
        <div className={cn('p-6 text-white shrink-0',
          t.level === 'elite'   ? 'bg-gradient-to-r from-amber-500 to-yellow-500' :
          t.level === 'critico' ? 'bg-gradient-to-r from-red-600 to-rose-700' :
          t.level === 'bajo'    ? 'bg-gradient-to-r from-orange-500 to-amber-600' :
          'bg-gradient-to-r from-indigo-600 to-violet-700'
        )}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              {t.photoUrl ? (
                <img src={t.photoUrl} alt={t.teacherName} className="w-14 h-14 rounded-full object-cover border-2 border-white/30" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{initials}</span>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{t.teacherName}</h2>
                <p className="text-white/70 text-sm">{t.teacherEmail}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20">
                    {level.badge} {level.label} · #{t.rank} de {totalTeachers}
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20">
                    {t.performanceScore} pts
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Guiones', value: t.guionesTotal },
              { label: 'Este mes', value: t.guionesThisMonth },
              { label: 'Exámenes', value: t.examsTotal },
              { label: 'Tareas', value: t.tasksTotal },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
                <p className="text-white/60 text-[10px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Alerta crítica ── */}
          {level.alert && (
            <div className={cn('flex items-start gap-3 rounded-xl p-4 border',
              t.level === 'critico' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200')}>
              <ShieldAlert className={cn('w-5 h-5 shrink-0 mt-0.5', t.level === 'critico' ? 'text-red-500' : 'text-orange-500')} />
              <div>
                <p className={cn('text-sm font-semibold mb-0.5', t.level === 'critico' ? 'text-red-800' : 'text-orange-800')}>
                  {t.level === 'critico' ? '⚠ Acción inmediata requerida' : '⚠ Seguimiento requerido'}
                </p>
                <p className={cn('text-xs', t.level === 'critico' ? 'text-red-600' : 'text-orange-600')}>
                  {level.alert}
                </p>
              </div>
            </div>
          )}

          {/* ── Grade inflation alert ── */}
          {t.gradeInflationRisk && (
            <div className="flex items-start gap-3 rounded-xl p-4 border bg-orange-50 border-orange-200">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-orange-500" />
              <div>
                <p className="text-sm font-semibold mb-0.5 text-orange-800">⚠ Posible inflación de notas detectada</p>
                <p className="text-xs text-orange-600">
                  Promedio {'>'} 9.2 con desviación estándar de {t.gradeStdDev?.toFixed(2)} — todos los alumnos reciben notas muy similares y altas. Se aplicó una penalización del 40% en el componente de rendimiento.
                </p>
              </div>
            </div>
          )}

          {/* ── Correlación asistencia-notas ── */}
          {detail.correlationPairs >= 4 && (
            <div className={cn('rounded-xl p-4 border',
              detail.attendanceGradeCorrelation == null
                ? 'bg-slate-50 border-slate-200'
                : detail.attendanceGradeCorrelation >= 0.4
                  ? 'bg-emerald-50 border-emerald-200'
                  : detail.attendanceGradeCorrelation >= 0.1
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-orange-50 border-orange-200'
            )}>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">📊 Correlación Asistencia ↔ Notas</p>
              {detail.attendanceGradeCorrelation != null ? (
                <>
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="flex-1 bg-white/60 rounded-full h-2">
                      <div className={cn('h-2 rounded-full', detail.attendanceGradeCorrelation >= 0.4 ? 'bg-emerald-500' : detail.attendanceGradeCorrelation >= 0.1 ? 'bg-blue-500' : 'bg-orange-400')}
                        style={{ width: `${Math.abs(detail.attendanceGradeCorrelation) * 100}%` }} />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-700">r = {detail.attendanceGradeCorrelation.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {detail.attendanceGradeCorrelation >= 0.5
                      ? '✓ Correlación alta — los alumnos que asisten más obtienen mejores notas (evaluación objetiva)'
                      : detail.attendanceGradeCorrelation >= 0.2
                        ? '~ Correlación moderada — hay cierta relación entre asistencia y notas'
                        : detail.attendanceGradeCorrelation >= 0
                          ? '⚠ Correlación baja — las notas no dependen mucho de la asistencia del alumno'
                          : '🚨 Correlación negativa — alumnos que faltan más obtienen notas similares o mayores'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Basado en {detail.correlationPairs} estudiantes con asistencia y notas registradas</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Datos insuficientes para calcular correlación ({detail.correlationPairs} pares)</p>
              )}
            </div>
          )}

          {/* ── Score breakdown ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Desglose de Puntuación ({t.performanceScore}/100 pts)</h3>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: 'Guiones de Clase',
                  pts: t.scoreBreakdown.guiones, max: 20,
                  color: t.scoreBreakdown.guiones === 0 ? 'bg-red-400' : 'bg-indigo-500',
                  desc: `${t.guionesThisMonth} este mes · meta: ${t.expectedGuiones}/mes (${t.assignments.length} secc. × 4)`,
                  warn: null as string | null,
                },
                {
                  label: 'Registro de Calificaciones',
                  pts: t.scoreBreakdown.gradeEntry, max: 30,
                  color: t.scoreBreakdown.gradeEntry === 0 ? 'bg-red-400' : 'bg-violet-500',
                  desc: `${t.studentsWithGrades} de ${t.totalStudents} alumnos calificados`,
                  warn: null as string | null,
                },
                {
                  label: 'Rendimiento de Alumnos',
                  pts: t.scoreBreakdown.studentPerf, max: 35,
                  color: t.scoreBreakdown.studentPerf === 0 ? 'bg-red-400' : t.gradeInflationRisk ? 'bg-orange-400' : 'bg-emerald-500',
                  desc: t.avgStudentScore != null ? `${t.avgStudentScore.toFixed(1)} promedio general` : 'Sin notas registradas → 0 pts',
                  warn: t.gradeInflationRisk ? `⚠ Notas uniformes sospechosas (desv. ${t.gradeStdDev?.toFixed(2)}) — penalización −40%` : null,
                },
                {
                  label: 'Contenido Creado',
                  pts: t.scoreBreakdown.content, max: 15,
                  color: 'bg-amber-500',
                  desc: `${t.examsTotal} exámenes · ${t.tasksTotal} tareas · meta: ${Math.max(2, t.assignments.length * 2)} items`,
                  warn: null as string | null,
                },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-slate-700">{s.label}</p>
                    <span className="text-xs font-bold text-slate-600 tabular-nums">{s.pts.toFixed(0)}/{s.max} pts</span>
                  </div>
                  <div className="bg-slate-200 rounded-full h-2 mb-1">
                    <div className={cn('h-2 rounded-full', s.color)} style={{ width: `${(s.pts / s.max) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400">{s.desc}</p>
                  {s.warn && <p className="text-[10px] text-orange-500 mt-1 font-medium">{s.warn}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* ── Gráfico actividad mensual ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Guiones por Mes (últimos 6)</h3>
            </div>
            {detail.guionesByMonth.every(d => d.count === 0) ? (
              <div className="bg-slate-50 rounded-xl p-6 text-center">
                <p className="text-xs text-slate-400">Sin guiones registrados</p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-4">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={detail.guionesByMonth} barSize={18}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: number) => [v, 'Guiones']} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]}
                      label={{ position: 'top', fontSize: 10, fill: '#6366f1', formatter: (v: number) => v > 0 ? v : '' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* ── Distribución ── */}
          {(t.guionesTotal + t.examsTotal + t.tasksTotal) > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-violet-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Distribución de Actividad</h3>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={detail.activityBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                      {detail.activityBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── Materias ── */}
          {detail.subjects.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Materias y Promedio de Alumnos</h3>
              </div>
              <div className="space-y-2">
                {detail.subjects.map((sub, i) => {
                  const score = sub.avgScore
                  const pct = score != null ? Math.min((score / 10) * 100, 100) : 0
                  const scoreColor = score == null ? 'text-slate-300' : score >= 9 ? 'text-emerald-600' : score >= 7 ? 'text-blue-600' : score >= 6 ? 'text-amber-500' : 'text-red-500'
                  const barColor   = score == null ? 'bg-slate-200'  : score >= 9 ? 'bg-emerald-500'  : score >= 7 ? 'bg-blue-500'   : score >= 6 ? 'bg-amber-500' : 'bg-red-400'
                  return (
                    <div key={i} className="bg-slate-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{sub.name}</p>
                          <p className="text-[11px] text-slate-400">{sub.grade} · {sub.studentCount} estudiantes</p>
                        </div>
                        <div className="text-right">
                          <span className={cn('text-lg font-bold tabular-nums', scoreColor)}>{score != null ? score.toFixed(1) : '—'}</span>
                          <p className="text-[10px] text-slate-400">promedio</p>
                        </div>
                      </div>
                      <div className="bg-slate-200 rounded-full h-1.5">
                        <div className={cn('h-1.5 rounded-full', barColor)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Radar ── */}
          {detail.subjects.filter(s => s.avgScore != null).length >= 3 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Rendimiento por Materia</h3>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={detail.subjects.filter(s => s.avgScore != null).map(s => ({
                    subject: s.name.length > 10 ? s.name.slice(0, 10) + '…' : s.name,
                    score: s.avgScore ?? 0,
                  }))}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                    <Tooltip formatter={(v: number) => [v.toFixed(1), 'Promedio']} contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── Guiones recientes ── */}
          {detail.recentGuiones.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Guiones Recientes</h3>
              </div>
              <div className="space-y-2">
                {detail.recentGuiones.map(g => (
                  <div key={g.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 font-medium truncate">{g.title ?? 'Guión de clase'}</p>
                      <p className="text-[11px] text-slate-400">{g.section} · {fmtDate(g.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Asignaciones ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Asignaciones ({t.assignments.length})</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {t.assignments.map(a => (
                <div key={a.taId} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-700">{a.subjectName}</p>
                  <p className="text-[11px] text-slate-400">{a.gradeName} · Sección {a.sectionName}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupervisionPage() {
  const [loading, setLoading]             = useState(true)
  const [teachers, setTeachers]           = useState<TeacherCard[]>([])
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState<'all' | 'active' | 'inactive' | 'alert'>('all')
  const [detail, setDetail]               = useState<TeacherDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [syId, setSyId]                   = useState<string | null>(null)
  const [stats, setStats]                 = useState({ total: 0, guionesMes: 0, examenes: 0, alertas: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).single()
    if (!sy?.id) { setLoading(false); return }
    setSyId(sy.id)

    const { data: tas } = await db.from('teacher_assignments').select('id, section_id, teacher_id, grade_subject_id').eq('school_year_id', sy.id)
    const tasArr: any[] = tas ?? []
    if (tasArr.length === 0) { setLoading(false); return }

    const sectionIds = Array.from(new Set(tasArr.map((ta: any) => ta.section_id as string).filter(Boolean))) as string[]
    const { data: sections } = await db.from('sections').select('id, name, grade_id').in('id', sectionIds)
    const sectionMap = new Map((sections ?? []).map((s: any) => [s.id, s]))

    const gradeIds = Array.from(new Set((sections ?? []).map((s: any) => s.grade_id as string).filter(Boolean))) as string[]
    const { data: grades } = gradeIds.length ? await db.from('grades').select('id, name').in('id', gradeIds) : { data: [] as any[] }
    const gradeMap = new Map((grades ?? []).map((g: any) => [g.id, g]))

    const gsIds = Array.from(new Set(tasArr.map((ta: any) => ta.grade_subject_id as string).filter(Boolean))) as string[]
    const { data: gsubjects } = gsIds.length ? await db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds) : { data: [] as any[] }
    const gsMap = new Map((gsubjects ?? []).map((g: any) => [g.id, g.subject_catalog_id]))
    const scIds = Array.from(new Set((gsubjects ?? []).map((g: any) => g.subject_catalog_id as string).filter(Boolean))) as string[]
    const { data: catalog } = scIds.length ? await db.from('subject_catalog').select('id, name').in('id', scIds) : { data: [] as any[] }
    const catMap = new Map((catalog ?? []).map((c: any) => [c.id, c.name]))

    const teacherIds = Array.from(new Set(tasArr.map((ta: any) => ta.teacher_id as string).filter(Boolean))) as string[]
    const { data: teachersData } = await db.from('teachers').select('id, user_id').in('id', teacherIds)
    const teachersArr: any[] = teachersData ?? []
    const userIds = Array.from(new Set(teachersArr.map((t: any) => t.user_id as string).filter(Boolean))) as string[]
    const { data: profs } = userIds.length ? await db.from('profiles').select('id, full_name, email, avatar_url').in('id', userIds) : { data: [] as any[] }
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]))
    const teacherProfileMap = new Map(teachersArr.map((t: any) => [t.id, profMap.get(t.user_id)]))

    const { data: classrooms } = await db.from('classrooms').select('id, section_id').eq('school_year_id', sy.id).in('section_id', sectionIds)
    const classroomArr: any[] = classrooms ?? []
    const classroomBySection = new Map(classroomArr.map((c: any) => [c.section_id, c.id]))
    const classroomIds = classroomArr.map((c: any) => c.id as string)

    const taIds = tasArr.map((ta: any) => ta.id as string)
    const { data: guiones } = taIds.length ? await db.from('guiones_clase').select('id, teacher_assignment_id, date').in('teacher_assignment_id', taIds) : { data: [] }
    const guionesArr: any[] = guiones ?? []

    let examsArr: any[] = [], tasksArr: any[] = []
    if (classroomIds.length) {
      const [{ data: ex }, { data: tk }] = await Promise.all([
        db.from('classroom_exams').select('id, classroom_id').in('classroom_id', classroomIds),
        db.from('classroom_tasks').select('id, classroom_id').in('classroom_id', classroomIds),
      ])
      examsArr = ex ?? []
      tasksArr = tk ?? []
    }

    // Monthly grades (only non-null) — for student performance + grade entry rate
    const { data: mgsAll } = taIds.length
      ? await db.from('monthly_grades').select('teacher_assignment_id, student_id, final_score').in('teacher_assignment_id', taIds).not('final_score', 'is', null)
      : { data: [] }
    const mgsArr: any[] = mgsAll ?? []

    // All enrollments per section — to count total students per teacher
    const { data: enrollsAll } = sectionIds.length
      ? await db.from('enrollments').select('student_id, section_id').in('section_id', sectionIds).eq('school_year_id', sy.id)
      : { data: [] }
    const enrollsArr: any[] = enrollsAll ?? []

    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const examsByClassroom = new Map<string, number>()
    for (const e of examsArr) examsByClassroom.set(e.classroom_id, (examsByClassroom.get(e.classroom_id) ?? 0) + 1)
    const tasksByClassroom = new Map<string, number>()
    for (const tk of tasksArr) tasksByClassroom.set(tk.classroom_id, (tasksByClassroom.get(tk.classroom_id) ?? 0) + 1)

    // Map taId → teacherId, sectionId
    const taToTeacher = new Map(tasArr.map((ta: any) => [ta.id, ta.teacher_id]))

    // Students per section
    const studentsBySection = new Map<string, Set<string>>()
    for (const e of enrollsArr) {
      if (!studentsBySection.has(e.section_id)) studentsBySection.set(e.section_id, new Set())
      studentsBySection.get(e.section_id)!.add(e.student_id)
    }

    // Students with grades per teacher_assignment
    const gradedStudentsByTA = new Map<string, Set<string>>()
    const gradesByTeacher = new Map<string, number[]>()
    for (const mg of mgsArr) {
      const tid = taToTeacher.get(mg.teacher_assignment_id)
      if (!tid) continue
      // Track which students have been graded per TA
      if (!gradedStudentsByTA.has(mg.teacher_assignment_id)) gradedStudentsByTA.set(mg.teacher_assignment_id, new Set())
      gradedStudentsByTA.get(mg.teacher_assignment_id)!.add(mg.student_id)
      // Aggregate scores per teacher
      if (!gradesByTeacher.has(tid)) gradesByTeacher.set(tid, [])
      gradesByTeacher.get(tid)!.push(Number(mg.final_score))
    }

    // Build teacher cards
    type PartialCard = Omit<TeacherCard, 'performanceScore' | 'rank' | 'level' | 'scoreBreakdown' | 'expectedGuiones' | 'gradeStdDev' | 'gradeInflationRisk'>
    const teacherMap = new Map<string, PartialCard>()
    for (const ta of tasArr) {
      const prof = teacherProfileMap.get(ta.teacher_id) as any
      if (!prof) continue
      const sec  = sectionMap.get(ta.section_id) as any
      const grade = sec ? gradeMap.get(sec.grade_id) as any : null
      const classroomId = classroomBySection.get(ta.section_id) ?? null
      const subjectName: string = (catMap.get(gsMap.get(ta.grade_subject_id) ?? '') ?? '—') as string

      const existing: PartialCard = teacherMap.get(ta.teacher_id) ?? {
        teacherId: ta.teacher_id, profileId: prof.id as string,
        teacherName: (prof.full_name ?? '—') as string, teacherEmail: (prof.email ?? '') as string,
        photoUrl: (prof.avatar_url ?? null) as string | null, assignments: [] as Assignment[],
        guionesTotal: 0, guionesThisMonth: 0, lastGuionDate: null,
        examsTotal: 0, tasksTotal: 0, avgStudentScore: null,
        studentsWithGrades: 0, totalStudents: 0,
        status: 'inactive' as const,
      }

      existing.assignments.push({ taId: ta.id, sectionId: ta.section_id, sectionName: (sec?.name ?? '—') as string, gradeName: (grade?.name ?? '—') as string, subjectName, classroomId })
      if (classroomId) {
        existing.examsTotal = Math.max(existing.examsTotal, examsByClassroom.get(classroomId) ?? 0)
        existing.tasksTotal = Math.max(existing.tasksTotal, tasksByClassroom.get(classroomId) ?? 0)
      }
      teacherMap.set(ta.teacher_id, existing)
    }

    for (const g of guionesArr) {
      const ta = tasArr.find((t: any) => t.id === g.teacher_assignment_id)
      if (!ta) continue
      const card = teacherMap.get(ta.teacher_id)
      if (!card) continue
      card.guionesTotal++
      if (g.date >= monthStart) card.guionesThisMonth++
      if (!card.lastGuionDate || g.date > card.lastGuionDate) card.lastGuionDate = g.date
    }

    // Add avg student scores — use forEach to avoid Map iterator issues
    gradesByTeacher.forEach((scores: number[], tid: string) => {
      const card = teacherMap.get(tid)
      if (card && scores.length > 0) {
        card.avgStudentScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
      }
    })

    // Count total students and graded students per teacher
    teacherMap.forEach((card: PartialCard) => {
      const uniqueSections = card.assignments.map(a => a.sectionId).filter((v, i, arr) => arr.indexOf(v) === i)
      let total = 0
      uniqueSections.forEach(sid => { total += studentsBySection.get(sid)?.size ?? 0 })
      card.totalStudents = total

      const gradedIds: string[] = []
      card.assignments.forEach(a => {
        const graded = gradedStudentsByTA.get(a.taId)
        if (graded) graded.forEach(sid => { if (!gradedIds.includes(sid)) gradedIds.push(sid) })
      })
      card.studentsWithGrades = gradedIds.length
    })

    const rawCards = Array.from(teacherMap.values()).map(c => ({
      ...c,
      status: (c.lastGuionDate && c.lastGuionDate >= thirtyDaysAgo ? 'active' : 'inactive') as 'active' | 'inactive',
    }))

    // ── OBJECTIVE SCORING ──────────────────────────────────────────────────────
    //
    // 20 pts — Guiones de clase (presencia, actividad — importante pero no lo único)
    //   → guionesThisMonth / expectedGuiones × 20
    //   → Si NO hace guiones = 0 pts (sin excusas)
    //
    // 30 pts — Registro de calificaciones
    //   → studentsWithGrades / totalStudents × 30
    //   → Si NO califica ningún alumno = 0 pts
    //
    // 35 pts — Rendimiento de alumnos (lo más importante)
    //   → (avgStudentScore / 10) × 35
    //   → Si hay inflación (avg > 9.2 Y desv < 0.8) → penalización del 40%
    //   → Si NO hay notas = 0 pts
    //
    // 15 pts — Contenido creado (exámenes + tareas = preparación)
    //   → min(1, (exams+tasks) / (assignments.length × 2)) × 15
    // ───────────────────────────────────────────────────────────────────────────

    const withScores: TeacherCard[] = rawCards.map(c => {
      const expectedGuiones = Math.max(4, c.assignments.length * 4)

      // Grade inflation detection
      const scores = gradesByTeacher.get(c.teacherId) ?? []
      let gradeStdDev: number | null = null
      let gradeInflationRisk = false
      if (scores.length >= 3) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length
        const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
        gradeStdDev = Math.sqrt(variance)
        if (mean > 9.2 && gradeStdDev < 0.8) gradeInflationRisk = true
      }

      // 20 pts: guiones (presence/activity, not the most important)
      const guionesPts = Math.min(20, (c.guionesThisMonth / expectedGuiones) * 20)

      // 30 pts: grade entry rate
      const gradeEntryPts = c.totalStudents > 0
        ? Math.min(30, (c.studentsWithGrades / c.totalStudents) * 30)
        : 0

      // 35 pts: student performance — most important indicator
      // Apply 40% penalty when grade inflation is detected
      const rawStudentPerfPts = c.avgStudentScore != null
        ? Math.min(35, (c.avgStudentScore / 10) * 35)
        : 0
      const studentPerfPts = gradeInflationRisk ? rawStudentPerfPts * 0.6 : rawStudentPerfPts

      // 15 pts: content created (exams + tasks = class preparation)
      const expectedContent = Math.max(2, c.assignments.length * 2)
      const contentPts = Math.min(15, ((c.examsTotal + c.tasksTotal) / expectedContent) * 15)

      const total = Math.round(guionesPts + gradeEntryPts + studentPerfPts + contentPts)
      return {
        ...c,
        performanceScore: Math.min(100, total),
        expectedGuiones,
        rank: 0,
        level: calcLevel(total),
        scoreBreakdown: { guiones: guionesPts, gradeEntry: gradeEntryPts, studentPerf: studentPerfPts, content: contentPts },
        gradeStdDev,
        gradeInflationRisk,
      }
    }).sort((a, b) => b.performanceScore - a.performanceScore)
      .map((c, i) => ({ ...c, rank: i + 1 }))

    setTeachers(withScores)
    setStats({
      total: withScores.length,
      guionesMes: guionesArr.filter((g: any) => g.date >= monthStart).length,
      examenes: examsArr.length,
      alertas: withScores.filter(c => c.level === 'bajo' || c.level === 'critico').length,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const openDetail = async (t: TeacherCard) => {
    setLoadingDetail(true)
    const taIds = t.assignments.map(a => a.taId)
    const { data: guiones } = taIds.length
      ? await db.from('guiones_clase').select('id, teacher_assignment_id, date, title').in('teacher_assignment_id', taIds).order('date', { ascending: false })
      : { data: [] }
    const guionesArr: any[] = guiones ?? []

    const now = new Date()
    const monthlyMap = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, 0)
    }
    for (const g of guionesArr) {
      const key = g.date?.slice(0, 7)
      if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1)
    }
    const guionesByMonth = Array.from(monthlyMap.entries()).map(([key, count]) => {
      const [, m] = key.split('-')
      return { month: MONTH_NAMES[parseInt(m) - 1], count }
    })

    const sectionNameById = new Map(t.assignments.map(a => [a.taId, `${a.gradeName} ${a.sectionName}`]))
    const recentGuiones = guionesArr.slice(0, 5).map((g: any) => ({
      id: g.id, date: g.date, title: g.title,
      section: sectionNameById.get(g.teacher_assignment_id) ?? '—',
    }))

    const subjectRows: TeacherDetail['subjects'] = []
    for (const a of t.assignments) {
      if (!syId) continue
      const { data: enrolls } = await db.from('enrollments').select('student_id').eq('section_id', a.sectionId).eq('school_year_id', syId)
      const studentIds = (enrolls ?? []).map((e: any) => e.student_id)
      let avgScore: number | null = null
      if (studentIds.length > 0) {
        const { data: mgs } = await db.from('monthly_grades').select('final_score').eq('teacher_assignment_id', a.taId).in('student_id', studentIds).not('final_score', 'is', null)
        const arr: any[] = mgs ?? []
        if (arr.length > 0) avgScore = arr.reduce((s: number, m: any) => s + Number(m.final_score), 0) / arr.length
      }
      subjectRows.push({ name: a.subjectName, grade: a.gradeName, avgScore, studentCount: studentIds.length })
    }

    const activityBreakdown = [
      { name: 'Guiones', value: t.guionesTotal, color: '#6366f1' },
      { name: 'Exámenes', value: t.examsTotal, color: '#f59e0b' },
      { name: 'Tareas', value: t.tasksTotal, color: '#10b981' },
    ].filter(a => a.value > 0)

    // ── Attendance-grade correlation ──
    let attendanceGradeCorrelation: number | null = null
    let correlationPairs = 0
    if (syId) {
      const sectionIds = t.assignments.map(a => a.sectionId).filter((v, i, arr) => arr.indexOf(v) === i)
      const taIds2 = t.assignments.map(a => a.taId)
      const [{ data: attSessions }, { data: mgsCorr }] = await Promise.all([
        sectionIds.length ? db.from('attendance_sessions').select('id, section_id').in('section_id', sectionIds).eq('school_year_id', syId) : Promise.resolve({ data: [] }),
        taIds2.length ? db.from('monthly_grades').select('teacher_assignment_id, student_id, final_score').in('teacher_assignment_id', taIds2).not('final_score', 'is', null) : Promise.resolve({ data: [] }),
      ])
      const sessionArr: any[] = attSessions ?? []
      const mgrArr: any[]    = mgsCorr ?? []
      if (sessionArr.length > 0) {
        const sessionIds = sessionArr.map((s: any) => s.id as string)
        const { data: attRecords } = await db.from('attendance_records').select('attendance_session_id, student_id, status').in('attendance_session_id', sessionIds)
        const recArr: any[] = attRecords ?? []
        // Map session → section
        const sessionToSection = new Map<string, string>()
        sessionArr.forEach((s: any) => sessionToSection.set(s.id, s.section_id))
        // Per-student: total sessions & present count (in teacher's sections)
        const attMap = new Map<string, { total: number; present: number }>()
        recArr.forEach((r: any) => {
          const key = r.student_id as string
          const curr = attMap.get(key) ?? { total: 0, present: 0 }
          curr.total++
          if (r.status === 'present') curr.present++
          if (r.status === 'late')    curr.present += 0.5
          attMap.set(key, curr)
        })
        // Per-student average grade from this teacher
        const gradeMap2 = new Map<string, number[]>()
        mgrArr.forEach((m: any) => {
          const key = m.student_id as string
          const arr = gradeMap2.get(key) ?? []
          arr.push(Number(m.final_score))
          gradeMap2.set(key, arr)
        })
        // Build pairs
        const pairs: [number, number][] = []
        attMap.forEach((att, sid) => {
          const grades2 = gradeMap2.get(sid)
          if (!grades2 || grades2.length === 0 || att.total === 0) return
          const attRate  = att.present / att.total
          const avgGrade = grades2.reduce((a: number, b: number) => a + b, 0) / grades2.length
          pairs.push([attRate, avgGrade])
        })
        attendanceGradeCorrelation = pearsonR(pairs)
        correlationPairs = pairs.length
      }
    }

    setDetail({ teacher: t, guionesByMonth, subjects: subjectRows, recentGuiones, activityBreakdown, attendanceGradeCorrelation, correlationPairs })
    setLoadingDetail(false)
  }

  const filtered = teachers.filter(t => {
    if (filter === 'active')   return t.status === 'active'
    if (filter === 'inactive') return t.status === 'inactive'
    if (filter === 'alert')    return t.level === 'bajo' || t.level === 'critico'
    return true
  }).filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.teacherName.toLowerCase().includes(q) || t.teacherEmail.toLowerCase().includes(q) ||
      t.assignments.some(a => a.gradeName.toLowerCase().includes(q) || a.subjectName.toLowerCase().includes(q))
  })

  const top3 = teachers.slice(0, 3)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-sm font-medium mb-1">Supervisión Docente</p>
            <h1 className="text-2xl font-bold">Monitor de Rendimiento</h1>
            <p className="text-indigo-200 text-sm mt-1">Ranking y alertas del año escolar activo</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Docentes',         value: stats.total,      icon: Users,       color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Guiones este mes', value: stats.guionesMes, icon: BookOpen,     color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Exámenes totales', value: stats.examenes,   icon: FileText,     color: 'text-amber-600',  bg: 'bg-amber-50'  },
          { label: 'Con alertas',      value: stats.alertas,    icon: ShieldAlert,  color: 'text-red-500',    bg: 'bg-red-50',   extra: stats.alertas > 0 },
        ].map(s => (
          <div key={s.label} className={cn('card p-5 flex items-center gap-4', (s as any).extra ? 'border-red-200' : '')}>
            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold tabular-nums', (s as any).extra ? 'text-red-600' : 'text-slate-800')}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Podio */}
      {top3.length > 0 && <Podio top3={top3} onSelect={openDetail} />}

      {/* Alerts banner */}
      {teachers.filter(t => t.level === 'critico').length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {teachers.filter(t => t.level === 'critico').length} docente{teachers.filter(t => t.level === 'critico').length > 1 ? 's' : ''} con rendimiento crítico
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {teachers.filter(t => t.level === 'critico').map(t => t.teacherName.split(' ').slice(0, 2).join(' ')).join(', ')} — Considerar plan de mejora o reemplazo
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar docente, materia, grado…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'active', label: '✓ Al día' },
            { key: 'inactive', label: 'Sin actividad' },
            { key: 'alert', label: `⚠ Alertas (${stats.alertas})` },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn('px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                filter === f.key
                  ? (f.key === 'alert' ? 'bg-red-600 text-white border-red-600' : 'bg-indigo-600 text-white border-indigo-600')
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay docentes que coincidan.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {filtered.length} docente{filtered.length !== 1 ? 's' : ''} · Toca una tarjeta para ver el perfil completo
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(t => (
              <TeacherCardItem key={t.teacherId} t={t} onClick={() => openDetail(t)} />
            ))}
          </div>
        </>
      )}

      {/* Loading overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-2xl">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-700">Cargando perfil docente…</p>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detail && <DetailDrawer detail={detail} totalTeachers={teachers.length} onClose={() => setDetail(null)} />}
    </div>
  )
}
