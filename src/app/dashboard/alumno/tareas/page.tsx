'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  ClipboardList, Clock, CheckCircle2, AlertCircle, Calendar,
  Send, Star, MessageSquare, Link as LinkIcon, X, ChevronDown, ChevronUp, Bot,
  Paperclip, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'
import { apiUrl } from '@/lib/api-url'

const db = supabase as any

const TYPE_COLORS: Record<string, string> = {
  tarea:      'bg-violet-100 text-violet-700 border-violet-200',
  actividad:  'bg-blue-100 text-blue-700 border-blue-200',
  exposicion: 'bg-amber-100 text-amber-700 border-amber-200',
  proyecto:   'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: 'bg-slate-100 text-slate-500 border-slate-200' },
  submitted: { label: 'Entregada',  color: 'bg-blue-100 text-blue-700 border-blue-200'   },
  graded:    { label: 'Calificada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  late:      { label: 'Tarde',      color: 'bg-red-100 text-red-600 border-red-200'       },
}

interface Task {
  id: string
  title: string
  description: string | null
  type: string
  due_date: string | null
  max_score: number | null
  is_published: boolean
  resource_url: string | null
  resource_label: string | null
}

interface Submission {
  id: string
  task_id: string
  content: string | null
  link_url: string | null
  status: 'pending' | 'submitted' | 'graded' | 'late'
  score: number | null
  feedback: string | null
  submitted_at: string | null
  // AI grading
  ai_score: number | null
  ai_justification: string | null
  ai_feedback: string | null
  ai_graded_at: string | null
  teacher_approved: boolean
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.floor((dt.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff < 0) return `Venció hace ${Math.abs(diff)} día${Math.abs(diff) > 1 ? 's' : ''}`
  return dt.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
}

function urgencyColor(d: string | null) {
  if (!d) return 'text-slate-400'
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.floor((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86400000)
  if (diff < 0) return 'text-red-500'
  if (diff <= 2) return 'text-amber-500'
  return 'text-slate-500'
}

export default function AlumnoTareasPage() {
  const { profile } = useAuth()

  const [loading, setLoading]           = useState(true)
  const [tasks, setTasks]               = useState<Task[]>([])
  const [submissions, setSubmissions]   = useState<Map<string, Submission>>(new Map())
  const [filter, setFilter]             = useState<'proximas' | 'todas' | 'vencidas'>('proximas')
  const [noClassroom, setNoClassroom]   = useState(false)
  const [studentId, setStudentId]       = useState<string | null>(null)
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [formContent, setFormContent]   = useState('')
  const [formLink, setFormLink]         = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [aiGrading, setAiGrading]       = useState<string | null>(null) // task_id being AI-graded

  const loadSubmissions = useCallback(async (sid: string, taskIds: string[]) => {
    if (taskIds.length === 0) return
    const { data } = await db.from('classroom_task_submissions')
      .select('id, task_id, content, link_url, status, score, feedback, submitted_at, ai_score, ai_justification, ai_feedback, ai_graded_at, teacher_approved')
      .eq('student_id', sid)
      .in('task_id', taskIds)
    const map = new Map<string, Submission>()
    for (const s of (data ?? [])) map.set(s.task_id, s)
    setSubmissions(map)
  }, [])

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      const { data: student } = await db.from('students').select('id').eq('user_id', profile.id).maybeSingle()
      if (!student) { setLoading(false); clearTimeout(t); return }
      setStudentId(student.id)

      const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      if (!sy) { setLoading(false); clearTimeout(t); return }

      const { data: enroll } = await db.from('enrollments').select('section_id').eq('student_id', student.id).eq('school_year_id', sy.id).maybeSingle()
      if (!enroll) { setLoading(false); clearTimeout(t); return }

      const { data: classroomsData } = await db.from('classrooms').select('id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id)
      const classroomIds = (classroomsData ?? []).map((c: any) => c.id as string)
      if (classroomIds.length === 0) { setNoClassroom(true); setLoading(false); clearTimeout(t); return }

      const { data: tasksData } = await db.from('classroom_tasks')
        .select('id, title, description, type, due_date, max_score, is_published, resource_url, resource_label')
        .in('classroom_id', classroomIds)
        .eq('is_published', true)
        .order('due_date', { ascending: true })

      const taskList: Task[] = tasksData ?? []
      setTasks(taskList)
      await loadSubmissions(student.id, taskList.map(t => t.id))
      setLoading(false)
      clearTimeout(t)
    }

    load().catch(() => { setLoading(false); clearTimeout(t) })
    return () => clearTimeout(t)
  }, [profile, loadSubmissions]) // eslint-disable-line

  const openSubmit = (task: Task) => {
    const existing = submissions.get(task.id)
    setFormContent(existing?.content ?? '')
    setFormLink(existing?.link_url ?? '')
    setExpanded(task.id)
  }

  const handleSubmit = async (task: Task) => {
    if (!studentId) return
    if (!formContent.trim() && !formLink.trim()) {
      toast.error('Agrega una respuesta o un enlace')
      return
    }
    setSubmitting(true)

    const today = new Date(); today.setHours(0,0,0,0)
    const isLate = task.due_date && new Date(task.due_date + 'T12:00:00') < today
    const existing = submissions.get(task.id)

    const payload = {
      task_id:      task.id,
      student_id:   studentId,
      content:      formContent.trim() || null,
      link_url:     formLink.trim() || null,
      status:       isLate ? 'late' : 'submitted',
      submitted_at: new Date().toISOString(),
    }

    let submissionId: string | null = null
    if (existing) {
      if (existing.status === 'graded') {
        toast.error('Esta tarea ya fue calificada y no puede modificarse')
        setSubmitting(false)
        return
      }
      const { error } = await db.from('classroom_task_submissions').update(payload).eq('id', existing.id)
      if (error) { toast.error('Error: ' + error.message); setSubmitting(false); return }
      submissionId = existing.id
    } else {
      const { data: inserted, error } = await db.from('classroom_task_submissions').insert(payload).select('id').single()
      if (error || !inserted) { toast.error('Error: ' + error?.message); setSubmitting(false); return }
      submissionId = inserted.id
    }

    setSubmitting(false)
    toast.success(existing ? 'Entrega actualizada' : '¡Tarea entregada!')
    setExpanded(null)
    await loadSubmissions(studentId, tasks.map(t => t.id))

    // ── Calificación IA (no bloquea UX) ──
    if (submissionId) {
      setAiGrading(task.id)
      try {
        const res = await fetch(apiUrl('/api/ai-grade-submission'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskTitle:         task.title,
            taskDescription:   task.description,
            taskType:          task.type,
            maxScore:          task.max_score ?? 10,
            submissionContent: formContent.trim() || null,
            submissionLink:    formLink.trim() || null,
          }),
        })
        if (res.ok) {
          const ai = await res.json()
          if (typeof ai.score === 'number') {
            await db.from('classroom_task_submissions').update({
              ai_score:         ai.score,
              ai_justification: ai.justification ?? null,
              ai_feedback:      ai.feedback ?? null,
              ai_graded_at:     new Date().toISOString(),
            }).eq('id', submissionId)
            await loadSubmissions(studentId, tasks.map(t => t.id))
            toast.success('¡La IA evaluó tu tarea!', { icon: '🤖' })
          }
        }
      } catch { /* IA no bloquea el envío */ }
      setAiGrading(null)
    }
  }

  const today = new Date(); today.setHours(0,0,0,0)

  const filtered = tasks.filter(task => {
    if (!task.due_date) return filter === 'todas'
    const due = new Date(task.due_date + 'T12:00:00')
    if (filter === 'proximas') return due >= today
    if (filter === 'vencidas') return due < today
    return true
  })

  const proxCount = tasks.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') >= today).length
  const vencCount = tasks.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') < today).length
  const entCount  = Array.from(submissions.values()).filter(s => s.status === 'submitted' || s.status === 'graded').length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (noClassroom) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-violet-600" />
        </div>
        <div><h1 className="page-title">Mis Tareas</h1></div>
      </div>
      <div className="card flex flex-col items-center justify-center h-48 gap-3">
        <ClipboardList className="w-10 h-10 text-slate-200" />
        <p className="text-slate-500 text-sm font-medium">Aula virtual no configurada aún</p>
        <p className="text-slate-400 text-xs">El docente aún no ha abierto el aula para tu sección</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="page-title">Mis Tareas</h1>
          <p className="page-subtitle">{proxCount} próxima{proxCount !== 1 ? 's' : ''} · {entCount} entregada{entCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Próximas',   count: proxCount,      icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { label: 'Entregadas', count: entCount,        icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Vencidas',   count: vencCount,       icon: AlertCircle,   color: 'text-red-500',     bg: 'bg-red-50'     },
          { label: 'Total',      count: tasks.length,    icon: ClipboardList, color: 'text-slate-600',   bg: 'bg-slate-50'   },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800 tabular-nums">{s.count}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'proximas', label: 'Próximas' },
          { key: 'todas',    label: 'Todas'    },
          { key: 'vencidas', label: 'Vencidas' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              filter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-200" />
          <p className="text-slate-400 text-sm">
            {filter === 'proximas' ? '¡Sin tareas pendientes!' : 'Sin tareas en esta categoría'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const sub     = submissions.get(task.id)
            const typeClr = TYPE_COLORS[task.type] ?? 'bg-slate-100 text-slate-600 border-slate-200'
            const dateClr = urgencyColor(task.due_date)
            const isPast  = task.due_date && new Date(task.due_date + 'T12:00:00') < today
            const status  = sub?.status ?? 'pending'
            const stCfg   = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
            const isOpen  = expanded === task.id
            const isBeingAiGraded = aiGrading === task.id

            return (
              <div key={task.id} className="card overflow-hidden">
                {/* Task header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                      status === 'graded' ? 'bg-emerald-50' : status === 'submitted' ? 'bg-blue-50' : 'bg-violet-50')}>
                      {status === 'graded'
                        ? <Star className="w-5 h-5 text-emerald-500" />
                        : status === 'submitted'
                          ? <CheckCircle2 className="w-5 h-5 text-blue-500" />
                          : <ClipboardList className="w-5 h-5 text-violet-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('font-semibold text-slate-800 leading-snug',
                          isPast && status === 'pending' && 'text-red-700')}>
                          {task.title}
                        </p>
                        {task.max_score != null && (
                          <span className="text-xs font-semibold text-slate-400 shrink-0">{task.max_score} pts</span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                      )}
                      {task.resource_url && (
                        <a
                          href={task.resource_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {task.resource_label || 'Ver recurso del docente'}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      )}
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', typeClr)}>
                          {task.type}
                        </span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', stCfg.color)}>
                          {stCfg.label}
                        </span>
                        {!task.is_published && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
                            próximamente
                          </span>
                        )}
                        <span className={cn('text-xs flex items-center gap-1', dateClr)}>
                          <Calendar className="w-3 h-3" />{formatDate(task.due_date)}
                        </span>
                      </div>

                      {/* ── AI grading in progress ── */}
                      {isBeingAiGraded && (
                        <div className="mt-3 flex items-center gap-2 p-3 bg-violet-50 rounded-xl border border-violet-100">
                          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                          <p className="text-xs text-violet-700 font-medium">La IA está evaluando tu tarea…</p>
                        </div>
                      )}

                      {/* ── AI score (pending teacher review) ── */}
                      {!isBeingAiGraded && sub?.ai_graded_at && status !== 'graded' && (
                        <div className="mt-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Bot className="w-3.5 h-3.5 text-violet-600" />
                              <span className="text-xs font-semibold text-violet-700">Calificación preliminar IA</span>
                            </div>
                            {sub.ai_score != null && (
                              <span className="text-base font-bold text-violet-700 tabular-nums">
                                {sub.ai_score}/{task.max_score ?? 10}
                              </span>
                            )}
                          </div>
                          {sub.ai_feedback && (
                            <p className="text-xs text-violet-800 leading-snug">{sub.ai_feedback}</p>
                          )}
                          <p className="text-[10px] text-violet-400 mt-1.5">Pendiente de revisión y confirmación por el docente</p>
                        </div>
                      )}

                      {/* ── Teacher-graded result ── */}
                      {status === 'graded' && sub && (
                        <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-emerald-700">
                              {sub.teacher_approved ? '✓ Calificación del docente' : 'Calificación oficial'}
                            </span>
                            {sub.score != null && (
                              <span className="text-lg font-bold text-emerald-600 tabular-nums">{sub.score}/{task.max_score ?? 10}</span>
                            )}
                          </div>
                          {sub.feedback && (
                            <p className="text-sm text-emerald-800 mt-1">{sub.feedback}</p>
                          )}
                        </div>
                      )}

                      {/* ── Already submitted (no AI yet) ── */}
                      {(status === 'submitted' || status === 'late') && sub && !sub.ai_graded_at && !isBeingAiGraded && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                          <p className="text-xs font-semibold text-blue-700 mb-1">Entregado</p>
                          {sub.content && <p className="text-sm text-blue-800 line-clamp-2">{sub.content}</p>}
                          {sub.link_url && (
                            <a href={sub.link_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline flex items-center gap-1 mt-1">
                              <LinkIcon className="w-3 h-3" />{sub.link_url}
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {status !== 'graded' && (
                      <button
                        onClick={() => isOpen ? setExpanded(null) : openSubmit(task)}
                        className={cn(
                          'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-all',
                          status === 'submitted' || status === 'late'
                            ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            : 'bg-violet-600 text-white hover:bg-violet-700'
                        )}>
                        {status === 'submitted' || status === 'late' ? (
                          <><MessageSquare className="w-3.5 h-3.5" />Editar</>
                        ) : (
                          <><Send className="w-3.5 h-3.5" />Entregar</>
                        )}
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Submission form */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">
                        {status === 'submitted' ? 'Actualizar entrega' : 'Entregar tarea'}
                      </p>
                      <button onClick={() => setExpanded(null)} className="p-1 rounded-lg hover:bg-slate-200 transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
                        Tu respuesta
                      </label>
                      <textarea
                        rows={4}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white resize-none"
                        placeholder="Escribe tu respuesta aquí…"
                        value={formContent}
                        onChange={e => setFormContent(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
                        Enlace (Google Drive, Docs, etc.)
                      </label>
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                          placeholder="https://drive.google.com/…"
                          value={formLink}
                          onChange={e => setFormLink(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 bg-violet-50 rounded-xl">
                      <Bot className="w-4 h-4 text-violet-500 shrink-0" />
                      <p className="text-xs text-violet-700">La IA evaluará tu entrega automáticamente. El docente revisará y confirmará la nota.</p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button onClick={() => setExpanded(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSubmit(task)}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        {submitting ? 'Enviando…' : status === 'submitted' ? 'Actualizar' : 'Entregar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
