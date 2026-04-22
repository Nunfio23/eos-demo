'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Trophy, Medal, Award, Star, ShieldAlert, AlertOctagon,
  TrendingUp, CheckCircle2, AlertTriangle, X,
  Users, BookOpen, Calendar, ClipboardList, GraduationCap,
  Activity, BarChart3, ChevronRight, Baby, Heart,
} from 'lucide-react'
import {
  GraduationCap as GradCap, Star as StarIcon, CheckCircle2 as Check2,
  ClipboardList as ClipList, FileText, DollarSign, AlertCircle,
  ChevronDown, ChevronUp, Clock, ArrowRight, User as UserIcon, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'
import StudentAvatar from '@/components/ui/StudentAvatar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const MONTH_NAMES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6']

// ─── Types ────────────────────────────────────────────────────────────────────

type PerfLevel = 'elite' | 'destacado' | 'estable' | 'bajo' | 'critico'

function calcLevel(score: number): PerfLevel {
  if (score >= 85) return 'elite'
  if (score >= 70) return 'destacado'
  if (score >= 55) return 'estable'
  if (score >= 35) return 'bajo'
  return 'critico'
}

const LEVEL_CONFIG: Record<PerfLevel, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  elite:     { label: 'Élite',     color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',  icon: Trophy },
  destacado: { label: 'Destacado', color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',   icon: StarIcon },
  estable:   { label: 'Estable',   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',icon: Check2 },
  bajo:      { label: 'Bajo',      color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200', icon: AlertTriangle },
  critico:   { label: 'Crítico',   color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',    icon: AlertOctagon },
}

interface ChildData {
  student_id: string
  student_code: string
  full_name: string
  avatar_url?: string | null
  grade_name: string
  section_name: string
  section_id: string | null
  avg_score: number | null
  att_pct: number | null
  rank_class: { pos: number; total: number } | null
  subjects: { name: string; score: number | null; month: number }[]
  tasks: { id: string; title: string; type: string; due_date: string | null }[]
  exams: { id: string; title: string; exam_type: string; scheduled_at: string | null }[]
  invoices_pending: number
  invoices_overdue_count: number
  invoices_amount: number
  invoices_overdue_amount: number
  performance_score: number
  level: PerfLevel
  score_breakdown: { academic: number; attendance: number; tasks: number }
}

interface ChildDetailData {
  monthlyGrades: any[]
  taMap: Map<string, string>
  bySubject: { name: string; promedio: number }[]
  monthlyTrend: { name: string; promedio: number }[]
  attBreakdown: { name: string; value: number; color: string }[]
  tasksList: { id: string; title: string; type: string; due_date: string | null; status: string | null }[]
  tasksSubmitted: number
  tasksPending: number
  classRank: { pos: number; total: number } | null
}

function formatShortDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
}

function scoreColor(s: number | null) {
  if (!s) return 'text-slate-400'
  if (s >= 9) return 'text-emerald-600'
  if (s >= 7) return 'text-blue-600'
  if (s >= 6) return 'text-amber-500'
  return 'text-red-500'
}
function scoreBg(s: number | null) {
  if (!s) return 'bg-slate-100'
  if (s >= 9) return 'bg-emerald-100'
  if (s >= 7) return 'bg-blue-100'
  if (s >= 6) return 'bg-amber-100'
  return 'bg-red-100'
}

// ─── Child Detail Drawer ──────────────────────────────────────────────────────

function ChildDetailDrawer({ child, detail, onClose }: { child: ChildData; detail: ChildDetailData | null; loading: boolean; onClose: () => void }) {
  const lvl = LEVEL_CONFIG[child.level]
  const LvlIcon = lvl.icon
  const isAlert = child.level === 'bajo' || child.level === 'critico'

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto flex flex-col animate-slide-in-right shadow-2xl">

        {/* Header */}
        <div className={cn('px-6 py-5 border-b', lvl.bg, lvl.border)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <StudentAvatar
                url={child.avatar_url}
                name={child.full_name}
                size="lg"
                variant={
                  child.level === 'elite' ? 'amber' :
                  child.level === 'destacado' ? 'blue' :
                  child.level === 'estable' ? 'emerald' :
                  child.level === 'bajo' ? 'orange' : 'red'
                }
              />
              <div>
                <h2 className="font-bold text-slate-900 text-base leading-tight">{child.full_name}</h2>
                <p className="text-xs text-slate-500">{child.grade_name}{child.section_name && ` · ${child.section_name}`}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border', lvl.bg, lvl.color, lvl.border)}>
                    <LvlIcon className="w-3 h-3 inline mr-1" />{lvl.label}
                  </span>
                  <span className="text-xs text-slate-500">{child.performance_score} pts</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/80 rounded-xl transition-colors shrink-0">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {isAlert && (
            <div className={cn('mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border',
              child.level === 'critico' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-orange-100 text-orange-800 border-orange-200'
            )}>
              <LvlIcon className="w-4 h-4 shrink-0" />
              {child.level === 'critico' ? 'Tu hijo/a requiere atención urgente. Contacta al docente.' : 'Tu hijo/a necesita apoyo adicional en algunas áreas.'}
            </div>
          )}
        </div>

        {!detail ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 p-6 space-y-6">

            {/* Score breakdown */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Desglose de Rendimiento
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Académico', pts: child.score_breakdown.academic, max: 60, color: 'bg-blue-500', note: child.avg_score != null ? `Promedio: ${child.avg_score.toFixed(1)}/10` : '' },
                  { label: 'Asistencia', pts: child.score_breakdown.attendance, max: 25, color: 'bg-emerald-500', note: child.att_pct != null ? `${child.att_pct}% de asistencia` : '' },
                  { label: 'Tareas', pts: child.score_breakdown.tasks, max: 15, color: 'bg-violet-500', note: '' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{item.label} {item.note && <span className="text-slate-400">· {item.note}</span>}</span>
                      <span className="text-slate-500 font-mono">{item.pts} / {item.max} pts</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={cn('h-2 rounded-full transition-all', item.color)} style={{ width: `${(item.pts / item.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {detail.classRank && (
                <div className="mt-3 bg-amber-50 rounded-xl px-4 py-2.5 flex items-center gap-2 border border-amber-100">
                  <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-800">
                    Posición #{detail.classRank.pos} de {detail.classRank.total} en su clase
                  </p>
                </div>
              )}
            </div>

            {/* Monthly trend */}
            {detail.monthlyTrend.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Tendencia Mensual (últimos 6 meses)
                </h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={detail.monthlyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [Number(v).toFixed(1), 'Promedio']} />
                    <Bar dataKey="promedio" fill="#0ea5e9" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* By subject */}
            {detail.bySubject.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Promedio por Materia
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(120, detail.bySubject.length * 32)}>
                  <BarChart data={detail.bySubject} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: any) => [Number(v).toFixed(1), 'Promedio']} />
                    <Bar dataKey="promedio" fill="#8b5cf6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Attendance pie */}
            {detail.attBreakdown.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Asistencia
                </h3>
                <div className="flex items-center gap-4">
                  <PieChart width={130} height={130}>
                    <Pie data={detail.attBreakdown} cx={60} cy={60} innerRadius={30} outerRadius={55} dataKey="value">
                      {detail.attBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="space-y-1.5">
                    {detail.attBreakdown.map(item => (
                      <div key={item.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                        <span className="text-slate-600">{item.name}:</span>
                        <span className="font-bold text-slate-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tasks */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <ClipList className="w-3.5 h-3.5" /> Tareas
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-600">{detail.tasksSubmitted}</p>
                  <p className="text-xs text-emerald-700 font-medium">Entregadas</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                  <p className="text-2xl font-bold text-orange-600">{Math.max(0, detail.tasksPending)}</p>
                  <p className="text-xs text-orange-700 font-medium">Pendientes</p>
                </div>
              </div>
              {detail.tasksList.length > 0 && (
                <div className="space-y-2">
                  {detail.tasksList.slice(0, 6).map(task => (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                      <div className={cn('w-2 h-2 rounded-full shrink-0',
                        task.status === 'graded' ? 'bg-emerald-500' :
                        task.status === 'submitted' ? 'bg-blue-500' : 'bg-slate-300'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{task.title}</p>
                        {task.due_date && <p className="text-[10px] text-slate-400">{formatShortDate(task.due_date)}</p>}
                      </div>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        task.status === 'graded' ? 'bg-emerald-100 text-emerald-700' :
                        task.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                      )}>
                        {task.status === 'graded' ? 'Calificado' : task.status === 'submitted' ? 'Entregado' : 'Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ─── Child Card ───────────────────────────────────────────────────────────────

function ChildCard({ child, onAnalysis }: { child: ChildData; onAnalysis: (c: ChildData) => void }) {
  const [expanded, setExpanded] = useState(false)
  const lvl = LEVEL_CONFIG[child.level]
  const LvlIcon = lvl.icon

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-5 border-b border-slate-100">
        <StudentAvatar
          url={child.avatar_url}
          name={child.full_name}
          size="lg"
          variant={
            child.level === 'elite' ? 'amber' :
            child.level === 'destacado' ? 'blue' :
            child.level === 'estable' ? 'emerald' :
            child.level === 'bajo' ? 'orange' : 'red'
          }
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 truncate">{child.full_name}</h3>
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', lvl.bg, lvl.color)}>
              <LvlIcon className="w-2.5 h-2.5 inline mr-0.5" />{lvl.label}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {child.grade_name}{child.section_name && ` · Sección ${child.section_name}`}
            {child.student_code && ` · ${child.student_code}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onAnalysis(child)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-lg text-xs font-medium transition-colors border border-sky-200"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Ver Análisis
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-5 divide-x divide-slate-100">
        {[
          { label: 'Promedio', value: child.avg_score != null ? child.avg_score.toFixed(1) : '—', color: scoreColor(child.avg_score) },
          { label: 'Ranking', value: child.rank_class ? `#${child.rank_class.pos}/${child.rank_class.total}` : '—', color: child.rank_class ? 'text-amber-500' : 'text-slate-300' },
          { label: 'Asistencia', value: child.att_pct != null ? `${child.att_pct}%` : '—', color: child.att_pct != null && child.att_pct >= 90 ? 'text-emerald-600' : child.att_pct != null && child.att_pct >= 75 ? 'text-amber-500' : 'text-red-500' },
          { label: 'Puntaje', value: `${child.performance_score}`, color: lvl.color },
          {
            label: child.invoices_overdue_count > 0 ? 'Con Mora' : 'Pagos Pend.',
            value: child.invoices_overdue_count > 0 ? child.invoices_overdue_count : child.invoices_pending > 0 ? child.invoices_pending : '✓',
            color: child.invoices_overdue_count > 0 ? 'text-red-500' : child.invoices_pending > 0 ? 'text-amber-500' : 'text-emerald-600',
          },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center py-3 px-1">
            <span className={cn('text-sm font-bold tabular-nums', s.color)}>{s.value}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 text-center leading-tight">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-100 space-y-4 p-5">

          {/* Grades by subject */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Notas por Materia
            </h4>
            {child.subjects.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">Sin notas registradas</p>
            ) : (
              <div className="space-y-2">
                {child.subjects.map(sub => {
                  const pct = sub.score != null ? (sub.score / 10) * 100 : 0
                  return (
                    <div key={sub.name} className="flex items-center gap-3">
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0', scoreBg(sub.score), scoreColor(sub.score))}>
                        {sub.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-medium text-slate-700 truncate">{sub.name}</p>
                          <span className={cn('text-xs font-bold tabular-nums ml-2 shrink-0', scoreColor(sub.score))}>
                            {sub.score != null ? sub.score.toFixed(1) : '—'}
                          </span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-1">
                          <div className={cn('h-1 rounded-full', sub.score != null && sub.score >= 9 ? 'bg-emerald-500' : sub.score != null && sub.score >= 7 ? 'bg-blue-500' : sub.score != null && sub.score >= 6 ? 'bg-amber-500' : 'bg-red-400')}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{sub.month ? MONTH_NAMES_SHORT[sub.month - 1] : ''}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tasks & Exams */}
          {(child.tasks.length > 0 || child.exams.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {child.tasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <ClipList className="w-3.5 h-3.5" /> Tareas Próximas
                  </h4>
                  <div className="space-y-1.5">
                    {child.tasks.slice(0, 3).map(t => (
                      <div key={t.id} className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                        <div>
                          <p className="text-slate-700 font-medium leading-snug">{t.title}</p>
                          {t.due_date && <p className="text-slate-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatShortDate(t.due_date)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {child.exams.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Próximos Exámenes
                  </h4>
                  <div className="space-y-1.5">
                    {child.exams.slice(0, 3).map(e => (
                      <div key={e.id} className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                        <div>
                          <p className="text-slate-700 font-medium leading-snug">{e.title}</p>
                          {e.scheduled_at && <p className="text-slate-400 flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" />{formatShortDate(e.scheduled_at)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending invoice alert */}
          {child.invoices_overdue_count > 0 ? (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-700">
                  {child.invoices_overdue_count} pago{child.invoices_overdue_count > 1 ? 's' : ''} con mora · ${child.invoices_overdue_amount.toFixed(2)}
                </p>
              </div>
              <Link href="/dashboard/padre/mis-pagos" className="text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-lg hover:bg-red-200 transition-colors">Ver</Link>
            </div>
          ) : child.invoices_pending > 0 ? (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-700">
                  {child.invoices_pending} pago{child.invoices_pending > 1 ? 's' : ''} pendiente{child.invoices_pending > 1 ? 's' : ''} de confirmación
                </p>
              </div>
              <Link href="/dashboard/padre/mis-pagos" className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-lg hover:bg-amber-200 transition-colors">Ver</Link>
            </div>
          ) : null}

          {/* Full analysis CTA */}
          <button
            onClick={() => onAnalysis(child)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-xl text-sm font-medium transition-colors border border-sky-200"
          >
            <BarChart3 className="w-4 h-4" />
            Ver Análisis Completo
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PadreDashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [children, setChildren] = useState<ChildData[]>([])
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; created_at: string }[]>([])

  // Drawer
  const [drawerChild, setDrawerChild] = useState<ChildData | null>(null)
  const [drawerDetail, setDrawerDetail] = useState<ChildDetailData | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return

    // Buscar hijos vinculados: primero en student_parents (tabla nueva),
    // con fallback a students.parent_id (columna legacy)
    const { data: spRows } = await db.from('student_parents').select('student_id').eq('parent_id', profile.id)
    const spIds = (spRows ?? []).map((r: any) => r.student_id)

    // Fallback: ids que estén en students.parent_id pero no en student_parents
    const { data: legacyRaw } = await db.from('students').select('id').eq('parent_id', profile.id)
    const legacyIds = (legacyRaw ?? []).map((r: any) => r.id).filter((id: string) => !spIds.includes(id))

    const allChildIds = [...new Set([...spIds, ...legacyIds])]
    if (allChildIds.length === 0) { setLoading(false); return }

    const { data: studentsRaw } = await db.from('students').select('id, enrollment_number, user_id').in('id', allChildIds)
    const studentsArr: any[] = studentsRaw ?? []
    if (studentsArr.length === 0) { setLoading(false); return }

    const childUserIds = studentsArr.map((s: any) => s.user_id).filter(Boolean)
    const { data: profilesRaw } = childUserIds.length > 0
      ? await db.from('profiles').select('id, full_name, avatar_url').in('id', childUserIds)
      : { data: [] }
    const profileMap = new Map((profilesRaw ?? []).map((p: any) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url ?? null }]))

    const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()

    const childResults = await Promise.all(studentsArr.map(async (student: any) => {
      const childData: ChildData = {
        student_id: student.id,
        student_code: student.enrollment_number ?? '',
        full_name: profileMap.get(student.user_id)?.full_name ?? 'Estudiante',
        avatar_url: profileMap.get(student.user_id)?.avatar_url ?? null,
        grade_name: '',
        section_name: '',
        section_id: null,
        avg_score: null,
        att_pct: null,
        rank_class: null,
        subjects: [],
        tasks: [],
        exams: [],
        invoices_pending: 0,
        invoices_amount: 0,
        invoices_overdue_count: 0,
        invoices_overdue_amount: 0,
        performance_score: 0,
        level: 'estable',
        score_breakdown: { academic: 25, attendance: 12, tasks: 8 },
      }

      let enrolledSectionId: string | null = null

      if (sy) {
        const { data: enroll } = await db.from('enrollments').select('section_id').eq('student_id', student.id).eq('school_year_id', sy.id).maybeSingle()
        if (enroll) {
          enrolledSectionId = enroll.section_id
          childData.section_id = enroll.section_id
          const { data: section } = await db.from('sections').select('id, name, grade_id').eq('id', enroll.section_id).maybeSingle()
          if (section) {
            childData.section_name = section.name
            const { data: grade } = await db.from('grades').select('name').eq('id', section.grade_id).maybeSingle()
            if (grade) childData.grade_name = grade.name

            const { data: classroom } = await db.from('classrooms').select('id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id).maybeSingle()
            if (classroom) {
              const today = new Date().toISOString().split('T')[0]
              const [{ data: tasksData }, { data: examsData }] = await Promise.all([
                db.from('classroom_tasks').select('id, title, type, due_date').eq('classroom_id', classroom.id).eq('is_published', true).gte('due_date', today).order('due_date').limit(4),
                db.from('classroom_exams').select('id, title, exam_type, scheduled_at').eq('classroom_id', classroom.id).eq('is_published', true).gte('scheduled_at', today).order('scheduled_at').limit(3),
              ])
              childData.tasks = tasksData ?? []
              childData.exams = examsData ?? []
            }
          }
        }

        // Monthly grades
        const { data: mgs } = await db.from('monthly_grades').select('teacher_assignment_id, month, final_score').eq('student_id', student.id).eq('school_year_id', sy.id).order('month', { ascending: false })
        const mgsArr: any[] = mgs ?? []
        if (mgsArr.length > 0) {
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
          const gsMap = new Map(gsArr.map((g: any) => [g.id, catMap.get(g.subject_catalog_id) ?? '—']))
          const taMap = new Map(tasArr.map((ta: any) => [ta.id, gsMap.get(ta.grade_subject_id) ?? '—']))

          const subjectMap = new Map<string, { name: string; score: number | null; month: number }>()
          for (const mg of mgsArr) {
            const name = taMap.get(mg.teacher_assignment_id) ?? 'Materia'
            if (!subjectMap.has(name)) {
              subjectMap.set(name, { name, score: mg.final_score, month: mg.month })
            } else {
              const entry = subjectMap.get(name)!
              if (mg.month >= entry.month) { entry.score = mg.final_score; entry.month = mg.month }
            }
          }
          childData.subjects = Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
          const validScores = childData.subjects.filter(s => s.score != null).map(s => Number(s.score))
          if (validScores.length > 0) {
            childData.avg_score = validScores.reduce((a, b) => a + b, 0) / validScores.length
          }

          // Class ranking
          if (enrolledSectionId) {
            const { data: classEnrolls } = await db.from('enrollments').select('student_id').eq('section_id', enrolledSectionId).eq('school_year_id', sy.id)
            const classIds: string[] = (classEnrolls ?? []).map((e: any) => e.student_id)
            if (classIds.length > 1) {
              const { data: classMGs } = await db.from('monthly_grades').select('student_id, final_score').in('student_id', classIds).eq('school_year_id', sy.id).not('final_score', 'is', null)
              const avgMap = new Map<string, number[]>()
              for (const mg of (classMGs ?? [])) {
                if (!avgMap.has(mg.student_id)) avgMap.set(mg.student_id, [])
                avgMap.get(mg.student_id)!.push(Number(mg.final_score))
              }
              if (avgMap.has(student.id)) {
                const sorted = Array.from(avgMap.entries())
                  .map(([sid, s]) => ({ sid, avg: s.reduce((a: number, b: number) => a + b, 0) / s.length }))
                  .sort((a, b) => b.avg - a.avg)
                const pos = sorted.findIndex(r => r.sid === student.id) + 1
                if (pos > 0) childData.rank_class = { pos, total: classIds.length }
              }
            }
          }
        }
      }

      // Attendance
      const { data: sessions } = enrolledSectionId
        ? await db.from('attendance_sessions').select('id').eq('section_id', enrolledSectionId)
        : { data: [] }
      const sessionIds = (sessions ?? []).map((s: any) => s.id)
      let presentRecs = 0
      let totalRecs = 0
      if (sessionIds.length > 0) {
        const { data: records } = await db.from('attendance_records').select('status').eq('student_id', student.id).in('attendance_session_id', sessionIds)
        const recArr: any[] = records ?? []
        totalRecs = recArr.length
        presentRecs = recArr.filter((r: any) => r.status === 'present' || r.status === 'late').length
        if (totalRecs > 0) childData.att_pct = Math.round((presentRecs / totalRecs) * 100)
      }

      // Pending payments — solo meses ya transcurridos o el mes actual (no meses futuros)
      const now = new Date()
      const currentMonthDue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: invData } = await db.from('payments')
        .select('id, amount, status, due_date')
        .eq('student_id', student.id)
        .in('status', ['pending', 'overdue'])
        .lte('due_date', currentMonthDue)
      const invArr: any[] = invData ?? []
      const overdueArr = invArr.filter((i: any) => i.status === 'overdue')
      childData.invoices_pending = invArr.length
      childData.invoices_overdue_count = overdueArr.length
      childData.invoices_amount = invArr.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0)
      childData.invoices_overdue_amount = overdueArr.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0)

      // Performance score calculation
      const validAcadScores = childData.subjects.filter(s => s.score != null).map(s => Number(s.score))
      const avgAcad = validAcadScores.length > 0 ? validAcadScores.reduce((a, b) => a + b, 0) / validAcadScores.length : null
      const academicPts = avgAcad != null ? Math.round((avgAcad / 10) * 60) : 25
      const attendancePts = totalRecs > 0 ? Math.round((presentRecs / totalRecs) * 25) : 12
      const tasksPts = 8  // simplified for main load; detailed in drawer
      const totalScore = Math.min(100, academicPts + attendancePts + tasksPts)

      childData.performance_score = totalScore
      childData.level = calcLevel(totalScore)
      childData.score_breakdown = { academic: academicPts, attendance: attendancePts, tasks: tasksPts }

      return childData
    }))

    setChildren(childResults)

    const { data: annData } = await db.from('announcements').select('id, title, created_at')
      .in('audience', ['all', 'padres']).eq('is_published', true)
      .order('created_at', { ascending: false }).limit(4)
    setAnnouncements(annData ?? [])

    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  // Load detail drawer data
  const openAnalysis = useCallback(async (child: ChildData) => {
    setDrawerChild(child)
    setDrawerDetail(null)
    setDrawerLoading(true)

    try {
      const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      if (!sy) { setDrawerLoading(false); return }

      // Monthly grades
      const { data: mgsData } = await db.from('monthly_grades').select('teacher_assignment_id, month, final_score').eq('student_id', child.student_id).eq('school_year_id', sy.id).not('final_score', 'is', null)
      const mgs: any[] = mgsData ?? []

      // Build taMap
      let taMap = new Map<string, string>()
      if (mgs.length > 0) {
        const taIds = [...new Set(mgs.map(m => m.teacher_assignment_id))] as string[]
        const { data: tas } = await db.from('teacher_assignments').select('id, grade_subject_id').in('id', taIds)
        const tasArr: any[] = tas ?? []
        const gsIds = [...new Set(tasArr.map(t => t.grade_subject_id))] as string[]
        const { data: gsData } = await db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds)
        const gsArr: any[] = gsData ?? []
        const scIds = [...new Set(gsArr.map(g => g.subject_catalog_id))] as string[]
        const { data: scData } = await db.from('subject_catalog').select('id, name').in('id', scIds)
        const scMap = new Map((scData ?? []).map((c: any) => [c.id, c.name]))
        const gsMap = new Map(gsArr.map((g: any) => [g.id, scMap.get(g.subject_catalog_id) ?? '—']))
        taMap = new Map(tasArr.map((ta: any) => [ta.id, gsMap.get(ta.grade_subject_id) ?? '—']))
      }

      // Monthly trend (last 6)
      const monthMap = new Map<number, number[]>()
      for (const g of mgs) {
        if (!monthMap.has(g.month)) monthMap.set(g.month, [])
        monthMap.get(g.month)!.push(Number(g.final_score))
      }
      const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => a - b).slice(-6)
      const monthlyTrend = sortedMonths.map(m => ({
        name: MONTH_NAMES_SHORT[m - 1] ?? `M${m}`,
        promedio: parseFloat((monthMap.get(m)!.reduce((a, b) => a + b, 0) / monthMap.get(m)!.length).toFixed(2)),
      }))

      // By subject
      const subMap = new Map<string, number[]>()
      for (const g of mgs) {
        const subj = taMap.get(g.teacher_assignment_id) ?? 'Materia'
        if (!subMap.has(subj)) subMap.set(subj, [])
        subMap.get(subj)!.push(Number(g.final_score))
      }
      const bySubject = Array.from(subMap.entries()).map(([name, scores]) => ({
        name: name.length > 12 ? name.slice(0, 12) + '…' : name,
        promedio: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
      })).sort((a, b) => b.promedio - a.promedio)

      // Attendance
      let attBreakdown: { name: string; value: number; color: string }[] = []
      if (child.section_id) {
        const { data: sessData } = await db.from('attendance_sessions').select('id').eq('section_id', child.section_id)
        const sessIds = (sessData ?? []).map((s: any) => s.id)
        if (sessIds.length > 0) {
          const { data: recData } = await db.from('attendance_records').select('status').eq('student_id', child.student_id).in('attendance_session_id', sessIds)
          const counts: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 }
          for (const r of (recData ?? [])) counts[r.status] = (counts[r.status] ?? 0) + 1
          attBreakdown = [
            { name: 'Presente', value: counts.present, color: '#10b981' },
            { name: 'Ausente',  value: counts.absent,  color: '#ef4444' },
            { name: 'Tardanza', value: counts.late,     color: '#f59e0b' },
            { name: 'Justific.', value: counts.excused, color: '#3b82f6' },
          ].filter(e => e.value > 0)
        }
      }

      // Tasks
      let tasksList: any[] = []
      let tasksSubmitted = 0
      let tasksPending = 0
      if (child.section_id) {
        const { data: clData } = await db.from('classrooms').select('id').eq('section_id', child.section_id).eq('school_year_id', sy.id).maybeSingle()
        if (clData) {
          const { data: allTasks } = await db.from('classroom_tasks').select('id, title, type, due_date').eq('classroom_id', clData.id)
          const allTasksArr: any[] = allTasks ?? []

          let submissions: any[] = []
          try {
            const { data: subData } = await db.from('classroom_task_submissions').select('task_id, status').eq('student_id', child.student_id)
            submissions = subData ?? []
          } catch { submissions = [] }

          const subMap2 = new Map(submissions.map((s: any) => [s.task_id, s.status]))
          tasksList = allTasksArr.map(t => ({
            ...t,
            status: subMap2.get(t.id) ?? null,
          }))
          tasksSubmitted = tasksList.filter(t => t.status === 'submitted' || t.status === 'graded').length
          tasksPending = allTasksArr.length - tasksSubmitted
        }
      }

      // Class rank
      let classRank: { pos: number; total: number } | null = null
      if (child.section_id && mgs.length > 0) {
        const { data: classEnrolls } = await db.from('enrollments').select('student_id').eq('section_id', child.section_id).eq('school_year_id', sy.id)
        const classIds: string[] = (classEnrolls ?? []).map((e: any) => e.student_id)
        if (classIds.length > 1) {
          const { data: classMGs } = await db.from('monthly_grades').select('student_id, final_score').in('student_id', classIds).eq('school_year_id', sy.id).not('final_score', 'is', null)
          const avgMap = new Map<string, number[]>()
          for (const mg of (classMGs ?? [])) {
            if (!avgMap.has(mg.student_id)) avgMap.set(mg.student_id, [])
            avgMap.get(mg.student_id)!.push(Number(mg.final_score))
          }
          if (avgMap.has(child.student_id)) {
            const sorted = Array.from(avgMap.entries())
              .map(([sid, s]) => ({ sid, avg: s.reduce((a: number, b: number) => a + b, 0) / s.length }))
              .sort((a, b) => b.avg - a.avg)
            const pos = sorted.findIndex(r => r.sid === child.student_id) + 1
            if (pos > 0) classRank = { pos, total: classIds.length }
          }
        }
      }

      setDrawerDetail({ monthlyGrades: mgs, taMap, bySubject, monthlyTrend, attBreakdown, tasksList, tasksSubmitted, tasksPending, classRank })
    } catch (e) {
      console.error(e)
      toast.error('Error al cargar análisis')
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const totalPending = children.reduce((s, c) => s + c.invoices_pending, 0)
  const totalOverdue = children.reduce((s, c) => s + c.invoices_overdue_count, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sky-200 text-sm font-medium mb-1">Portal de Padres de Familia</p>
            <h1 className="text-2xl font-bold">¡Bienvenido, {firstName}!</h1>
            {children.length > 0 ? (
              <div className="mt-2 space-y-1">
                {children.map(c => (
                  <div key={c.student_id} className="flex items-center gap-2">
                    <GradCap className="w-4 h-4 text-sky-200 shrink-0" />
                    <span className="text-white font-semibold text-sm truncate">
                      Alumno asignado: {c.full_name}
                    </span>
                    {c.grade_name && (
                      <span className="text-sky-200 text-xs shrink-0">
                        · {c.grade_name}{c.section_name ? ` ${c.section_name}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sky-200 text-sm mt-1">Colegio E-OS Demo</p>
            )}
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 ml-4">
            <UserIcon className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Hijos Matriculados', value: children.length || '—', icon: GradCap, color: 'text-sky-600', bg: 'bg-sky-50',
            sub: children.length === 0 ? 'Sin matrícula' : `${children.length} activo${children.length > 1 ? 's' : ''}`,
          },
          {
            label: 'Promedio Familiar',
            value: (() => {
              const all = children.filter(c => c.avg_score != null)
              if (all.length === 0) return '—'
              return (all.reduce((s, c) => s + c.avg_score!, 0) / all.length).toFixed(1)
            })(),
            icon: StarIcon, color: 'text-amber-500', bg: 'bg-amber-50', sub: 'Promedio de todos los hijos',
          },
          {
            label: 'Puntaje Promedio',
            value: children.length > 0 ? Math.round(children.reduce((s, c) => s + c.performance_score, 0) / children.length) : '—',
            icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50', sub: 'Rendimiento general',
          },
          {
            label: 'Estado de Pagos',
            value: totalOverdue > 0
              ? `$${children.reduce((s, c) => s + c.invoices_overdue_amount, 0).toFixed(2)}`
              : '✓',
            icon: DollarSign,
            color: totalOverdue > 0 ? 'text-red-600' : totalPending > 0 ? 'text-amber-500' : 'text-emerald-600',
            bg: totalOverdue > 0 ? 'bg-red-50' : totalPending > 0 ? 'bg-amber-50' : 'bg-emerald-50',
            sub: totalOverdue > 0
              ? `${totalOverdue} pago${totalOverdue > 1 ? 's' : ''} con mora`
              : totalPending > 0
              ? `${totalPending} pago${totalPending > 1 ? 's' : ''} pend. de confirmación`
              : 'Al día',
            valueColor: totalOverdue > 0 ? 'text-red-600' : totalPending > 0 ? 'text-amber-500' : 'text-emerald-600',
          },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', s.bg)}>
                <s.icon className={cn('w-5 h-5', s.color)} />
              </div>
              <span className={cn('text-2xl font-bold tabular-nums', (s as any).valueColor ?? 'text-slate-800')}>{s.value}</span>
            </div>
            <p className="text-xs font-semibold text-slate-600">{s.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Children */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <GradCap className="w-4 h-4 text-slate-400" /> Mis Hijos
            </h2>
            <span className="text-xs text-slate-400">Toca "Ver Análisis" para análisis detallado</span>
          </div>

          {children.length === 0 ? (
            <div className="card p-10 text-center">
              <GradCap className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No hay estudiantes vinculados a tu cuenta.</p>
              <p className="text-xs text-slate-400 mt-1">Contacta a administración para vincular a tus hijos.</p>
            </div>
          ) : (
            children.map(child => <ChildCard key={child.student_id} child={child} onAnalysis={openAnalysis} />)
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Announcements */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Comunicados</h3>
              </div>
              <Link href="/dashboard/comunicados" className="text-xs text-sky-600 flex items-center gap-1 hover:underline">
                Ver todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {announcements.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bell className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">Sin comunicados recientes</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {announcements.map(a => (
                  <div key={a.id} className="px-4 py-3">
                    <p className="text-xs font-medium text-slate-800 line-clamp-2">{a.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatShortDate(a.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Mis Pagos',    href: '/dashboard/padre/mis-pagos', icon: DollarSign, color: 'bg-amber-50 text-amber-600' },
                { label: 'Calendario',   href: '/dashboard/calendario',  icon: Calendar,   color: 'bg-sky-50 text-sky-600' },
                { label: 'Comunicados',  href: '/dashboard/comunicados', icon: Bell,       color: 'bg-violet-50 text-violet-600' },
                { label: 'Biblioteca',   href: '/dashboard/biblioteca',  icon: BookOpen,   color: 'bg-emerald-50 text-emerald-600' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link key={href} href={href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all text-center">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700">{label}</span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Child detail drawer */}
      {drawerChild && (
        <ChildDetailDrawer
          child={drawerChild}
          detail={drawerDetail}
          loading={drawerLoading}
          onClose={() => { setDrawerChild(null); setDrawerDetail(null) }}
        />
      )}
    </div>
  )
}

