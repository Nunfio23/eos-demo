'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  Bot, CheckCircle2, Clock, AlertTriangle, Star,
  Link as LinkIcon, ChevronDown, ChevronUp, Search, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

type FilterKey = 'pending' | 'approved' | 'all'

interface AISubmission {
  submissionId: string
  taskId: string
  taskTitle: string
  taskType: string
  maxScore: number
  studentName: string
  studentId: string
  content: string | null
  linkUrl: string | null
  submittedAt: string | null
  status: string
  // AI
  aiScore: number | null
  aiJustification: string | null
  aiFeedback: string | null
  aiGradedAt: string | null
  // Teacher
  teacherApproved: boolean
  teacherScore: number | null
  teacherFeedback: string | null
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function ScoreBadge({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = (score / max) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-sm font-bold tabular-nums min-w-[3rem] text-right', color.replace('bg-', 'text-').replace('-500', '-700').replace('-400', '-700'))}>
        {score}/{max}
      </span>
    </div>
  )
}

export default function CalificacionesIAPage() {
  const { profile } = useAuth()
  const [loading, setLoading]         = useState(true)
  const [submissions, setSubmissions] = useState<AISubmission[]>([])
  const [filter, setFilter]           = useState<FilterKey>('pending')
  const [search, setSearch]           = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [saving, setSaving]           = useState<string | null>(null)
  // Override form
  const [overrideScore, setOverrideScore]     = useState<string>('')
  const [overrideFeedback, setOverrideFeedback] = useState<string>('')

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const { data: teacher } = await db.from('teachers').select('id').eq('user_id', profile.id).maybeSingle()
    if (!teacher) { setLoading(false); return }

    const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
    if (!sy) { setLoading(false); return }

    // Get teacher's sections → classrooms → tasks
    const { data: tas } = await db.from('teacher_assignments').select('id, section_id').eq('teacher_id', teacher.id).eq('school_year_id', sy.id)
    const sectionIds = [...new Set((tas ?? []).map((t: any) => t.section_id as string).filter(Boolean))]
    if (sectionIds.length === 0) { setLoading(false); return }

    const { data: classrooms } = await db.from('classrooms').select('id').in('section_id', sectionIds).eq('school_year_id', sy.id)
    const classroomIds = (classrooms ?? []).map((c: any) => c.id as string)
    if (classroomIds.length === 0) { setLoading(false); return }

    const { data: tasks } = await db.from('classroom_tasks').select('id, title, type, max_score').in('classroom_id', classroomIds)
    const taskArr: any[] = tasks ?? []
    if (taskArr.length === 0) { setLoading(false); return }

    const taskIds = taskArr.map((t: any) => t.id as string)
    const taskMap = new Map(taskArr.map((t: any) => [t.id, t]))

    // Only submissions with AI grading
    const { data: subs } = await db.from('classroom_task_submissions')
      .select('id, task_id, student_id, content, link_url, status, score, feedback, submitted_at, ai_score, ai_justification, ai_feedback, ai_graded_at, teacher_approved')
      .in('task_id', taskIds)
      .not('ai_graded_at', 'is', null)
      .order('ai_graded_at', { ascending: false })
    const subsArr: any[] = subs ?? []
    if (subsArr.length === 0) { setLoading(false); return }

    // Student profiles
    const studentIds = [...new Set(subsArr.map((s: any) => s.student_id as string))]
    const { data: students } = await db.from('students').select('id, user_id').in('id', studentIds)
    const userIds = [...new Set((students ?? []).map((s: any) => s.user_id as string).filter(Boolean))]
    const { data: profs } = userIds.length ? await db.from('profiles').select('id, full_name').in('id', userIds) : { data: [] }
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]))
    const studentProfileMap = new Map((students ?? []).map((s: any) => [s.id, profMap.get(s.user_id) ?? '—']))

    const result: AISubmission[] = subsArr.map((s: any) => {
      const task = taskMap.get(s.task_id)
      return {
        submissionId:    s.id,
        taskId:          s.task_id,
        taskTitle:       task?.title ?? '—',
        taskType:        task?.type ?? '—',
        maxScore:        task?.max_score ?? 10,
        studentName:     studentProfileMap.get(s.student_id) ?? '—',
        studentId:       s.student_id,
        content:         s.content,
        linkUrl:         s.link_url,
        submittedAt:     s.submitted_at,
        status:          s.status,
        aiScore:         s.ai_score != null ? Number(s.ai_score) : null,
        aiJustification: s.ai_justification,
        aiFeedback:      s.ai_feedback,
        aiGradedAt:      s.ai_graded_at,
        teacherApproved: s.teacher_approved ?? false,
        teacherScore:    s.score != null ? Number(s.score) : null,
        teacherFeedback: s.feedback,
      }
    })

    setSubmissions(result)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const handleApprove = async (sub: AISubmission) => {
    if (sub.aiScore == null) return
    setSaving(sub.submissionId)
    const { error } = await db.from('classroom_task_submissions').update({
      score:            sub.aiScore,
      feedback:         sub.aiFeedback,
      status:           'graded',
      teacher_approved: true,
    }).eq('id', sub.submissionId)
    setSaving(null)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Calificación IA aprobada')
    setExpanded(null)
    await load()
  }

  const handleOverride = async (sub: AISubmission) => {
    const score = parseFloat(overrideScore)
    if (isNaN(score) || score < 0 || score > sub.maxScore) {
      toast.error(`Puntaje inválido (0–${sub.maxScore})`)
      return
    }
    setSaving(sub.submissionId)
    const { error } = await db.from('classroom_task_submissions').update({
      score:            score,
      feedback:         overrideFeedback.trim() || sub.aiFeedback,
      status:           'graded',
      teacher_approved: false,
    }).eq('id', sub.submissionId)
    setSaving(null)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Calificación guardada')
    setExpanded(null)
    await load()
  }

  const openOverride = (sub: AISubmission) => {
    setOverrideScore(sub.aiScore?.toString() ?? '')
    setOverrideFeedback(sub.aiFeedback ?? '')
    setExpanded(sub.submissionId)
  }

  const filtered = submissions.filter(s => {
    if (filter === 'pending')  return !s.teacherApproved && s.status !== 'graded'
    if (filter === 'approved') return s.teacherApproved || s.status === 'graded'
    return true
  }).filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.studentName.toLowerCase().includes(q) || s.taskTitle.toLowerCase().includes(q)
  })

  const pendingCount  = submissions.filter(s => !s.teacherApproved && s.status !== 'graded').length
  const approvedCount = submissions.filter(s => s.teacherApproved || s.status === 'graded').length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-violet-200 text-sm font-medium mb-1">Calificaciones IA</p>
            <h1 className="text-2xl font-bold">Revisión de Entregas</h1>
            <p className="text-violet-200 text-sm mt-1">La IA evaluó las tareas — revisa y confirma o ajusta</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <Bot className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pendientes de revisión', value: pendingCount,          icon: Clock,         color: 'text-amber-600',   bg: 'bg-amber-50',   extra: pendingCount > 0 },
          { label: 'Revisadas / aprobadas',  value: approvedCount,         icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50', extra: false },
          { label: 'Total con IA',           value: submissions.length,    icon: Bot,           color: 'text-violet-600',  bg: 'bg-violet-50',  extra: false },
        ].map(s => (
          <div key={s.label} className={cn('card p-5 flex items-center gap-4', s.extra ? 'border-amber-200' : '')}>
            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold tabular-nums', s.extra ? 'text-amber-600' : 'text-slate-800')}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar alumno o tarea…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
        </div>
        <div className="flex gap-2">
          {([
            { key: 'pending',  label: `⏳ Pendientes (${pendingCount})` },
            { key: 'approved', label: '✓ Revisadas' },
            { key: 'all',      label: 'Todas' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn('px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                filter === f.key
                  ? (f.key === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-violet-600 text-white border-violet-600')
                  : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submissions list */}
      {filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <Bot className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {filter === 'pending' ? '¡Sin entregas pendientes de revisión!' : 'Sin entregas en esta categoría.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => {
            const isReviewed = sub.teacherApproved || sub.status === 'graded'
            const isExpanded = expanded === sub.submissionId
            const isSaving   = saving === sub.submissionId
            const scoreColor = sub.aiScore == null ? 'bg-slate-200'
              : sub.aiScore / sub.maxScore >= 0.8 ? 'bg-emerald-500'
              : sub.aiScore / sub.maxScore >= 0.6 ? 'bg-blue-500'
              : sub.aiScore / sub.maxScore >= 0.4 ? 'bg-amber-500'
              : 'bg-red-400'

            return (
              <div key={sub.submissionId} className={cn('card overflow-hidden border',
                isReviewed ? 'border-emerald-100' : 'border-amber-100')}>

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Student avatar */}
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-indigo-700 font-bold text-xs">{getInitials(sub.studentName)}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{sub.studentName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{sub.taskTitle} · <span className="capitalize">{sub.taskType}</span></p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isReviewed ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {sub.teacherApproved ? 'IA aprobada' : 'Modificada'}
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Pendiente
                            </span>
                          )}
                        </div>
                      </div>

                      {/* AI score bar */}
                      {sub.aiScore != null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Bot className="w-3 h-3 text-violet-500" /> Puntuación IA
                            </span>
                          </div>
                          <ScoreBadge score={sub.aiScore} max={sub.maxScore} color={scoreColor} />
                        </div>
                      )}

                      {/* AI justification preview */}
                      {sub.aiJustification && (
                        <p className="text-xs text-slate-500 mt-2 line-clamp-2">{sub.aiJustification}</p>
                      )}

                      {/* Final score if reviewed */}
                      {isReviewed && sub.teacherScore != null && (
                        <div className="mt-2 flex items-center gap-2">
                          <Star className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-semibold text-emerald-700">Nota final: {sub.teacherScore}/{sub.maxScore}</span>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isReviewed && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApprove(sub)}
                            disabled={isSaving || sub.aiScore == null}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isSaving ? 'Guardando…' : `Aprobar IA (${sub.aiScore ?? '—'}/${sub.maxScore})`}
                          </button>
                          <button
                            onClick={() => isExpanded ? setExpanded(null) : openOverride(sub)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                            <Star className="w-3.5 h-3.5" />
                            Modificar
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      )}

                      {isReviewed && (
                        <button
                          onClick={() => isExpanded ? setExpanded(null) : openOverride(sub)}
                          className="flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                          Ajustar nota
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded section — see full submission + override form */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Detalle de la entrega</p>
                      <button onClick={() => setExpanded(null)} className="p-1 rounded-lg hover:bg-slate-200">
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>

                    {/* Student's submission */}
                    <div className="bg-white rounded-xl p-3 border border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Respuesta del estudiante</p>
                      {sub.content ? (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{sub.content}</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Sin texto escrito</p>
                      )}
                      {sub.linkUrl && (
                        <a href={sub.linkUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 underline">
                          <LinkIcon className="w-3 h-3" />{sub.linkUrl}
                        </a>
                      )}
                      <p className="text-[10px] text-slate-400 mt-2">Entregado: {fmtDate(sub.submittedAt)}</p>
                    </div>

                    {/* AI analysis */}
                    <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                      <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5 mb-2">
                        <Bot className="w-3.5 h-3.5" /> Análisis de la IA
                      </p>
                      {sub.aiJustification && (
                        <p className="text-xs text-violet-800 mb-2">{sub.aiJustification}</p>
                      )}
                      {sub.aiFeedback && (
                        <div className="mt-1">
                          <p className="text-[10px] font-semibold text-violet-600 mb-0.5">Retroalimentación al alumno:</p>
                          <p className="text-xs text-violet-700">{sub.aiFeedback}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-violet-400 mt-2">Evaluado: {fmtDate(sub.aiGradedAt)}</p>
                    </div>

                    {/* Override form */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        {isReviewed ? 'Ajustar calificación' : 'Modificar calificación'}
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Puntaje (0–{sub.maxScore})</label>
                          <input
                            type="number"
                            min={0}
                            max={sub.maxScore}
                            step="0.5"
                            value={overrideScore}
                            onChange={e => setOverrideScore(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                          />
                        </div>
                        <div className="flex items-end">
                          <div className="text-sm text-slate-400">
                            Sugerencia IA: <span className="font-bold text-violet-700">{sub.aiScore ?? '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-xs text-slate-500 mb-1 block">Retroalimentación al alumno</label>
                        <textarea
                          rows={3}
                          value={overrideFeedback}
                          onChange={e => setOverrideFeedback(e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white resize-none"
                          placeholder="Comentario opcional para el alumno…"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setExpanded(null)}
                          className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleOverride(sub)}
                          disabled={isSaving}
                          className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          {isSaving ? 'Guardando…' : 'Guardar calificación'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Alert if has pending */}
      {pendingCount > 0 && filter !== 'pending' && (
        <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-amber-500 text-white px-4 py-3 rounded-2xl shadow-lg z-30">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-semibold">{pendingCount} entrega{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''} de revisión</p>
        </div>
      )}
    </div>
  )
}
