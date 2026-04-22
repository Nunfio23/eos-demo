'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { ClipboardList, Plus, Trash2, X, CalendarDays, Star, Link2, Upload, Paperclip, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskType = 'tarea' | 'actividad' | 'exposicion'

interface Task {
  id: string
  classroom_id: string
  created_by: string | null
  type: TaskType
  title: string
  description: string | null
  due_date: string | null
  max_score: number
  is_published: boolean
  created_at: string
}

interface TaskForm {
  type: TaskType
  title: string
  description: string
  due_date: string
  max_score: number
  is_published: boolean
  resource_url: string
  resource_label: string
}

interface Props {
  classroom: { id: string; section_id: string; school_year_id: string }
  canManage: boolean
  teacherAssignmentId?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const emptyForm: TaskForm = {
  type: 'tarea',
  title: '',
  description: '',
  due_date: '',
  max_score: 10,
  is_published: true,
  resource_url: '',
  resource_label: '',
}

const TYPE_LABELS: Record<TaskType, string> = {
  tarea: 'Tarea',
  actividad: 'Actividad',
  exposicion: 'Exposición',
}

const TYPE_COLORS: Record<TaskType, string> = {
  tarea: 'bg-violet-100 text-violet-700',
  actividad: 'bg-blue-100 text-blue-700',
  exposicion: 'bg-amber-100 text-amber-700',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TareasTab({ classroom, canManage, teacherAssignmentId }: Props) {
  const { profile } = useAuth()
  const db = supabase as any

  const [tasks,        setTasks]        = useState<Task[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [form,         setForm]         = useState<TaskForm>(emptyForm)
  const [resourceTab,  setResourceTab]  = useState<'url' | 'file'>('url')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    let q = db
      .from('classroom_tasks')
      .select('*')
      .eq('classroom_id', classroom.id)
    if (teacherAssignmentId) q = q.eq('teacher_assignment_id', teacherAssignmentId)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) {
      toast.error('Error al cargar tareas')
    } else {
      setTasks((data ?? []) as Task[])
    }
    setLoading(false)
  }, [classroom.id])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadTasks().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadTasks])

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error('El título es requerido')
      return
    }
    if (!profile) {
      toast.error('Sesión no disponible')
      return
    }
    setSaving(true)
    const { error } = await db.from('classroom_tasks').insert({
      classroom_id: classroom.id,
      created_by: profile.id,
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      max_score: form.max_score,
      is_published: form.is_published,
      resource_url: form.resource_url.trim() || null,
      resource_label: form.resource_label.trim() || null,
      teacher_assignment_id: teacherAssignmentId ?? null,
    })
    setSaving(false)
    if (error) {
      toast.error('Error al crear la tarea')
      return
    }
    toast.success('Tarea creada')
    setShowModal(false)
    setForm(emptyForm)
    loadTasks()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `tasks/${classroom.id}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage.from('task-resources').upload(path, file)
    if (error) { toast.error('Error al subir archivo: ' + error.message); setUploading(false); return }
    const { data: pub } = supabase.storage.from('task-resources').getPublicUrl(data.path)
    setForm(p => ({ ...p, resource_url: pub.publicUrl, resource_label: p.resource_label || file.name }))
    toast.success('Archivo subido correctamente')
    setUploading(false)
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return
    const { error } = await db.from('classroom_tasks').delete().eq('id', taskId)
    if (error) {
      toast.error('Error al eliminar')
      return
    }
    toast.success('Tarea eliminada')
    loadTasks()
  }

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => { setForm(emptyForm); setResourceTab('url'); setShowModal(true) }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Nueva Tarea
          </button>
        </div>
      )}

      {/* Lista de tareas */}
      {tasks.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3">
          <ClipboardList className="w-10 h-10 text-slate-200" />
          <p className="text-slate-400 text-sm">No hay tareas registradas en este aula</p>
          {canManage && (
            <button
              onClick={() => { setForm(emptyForm); setResourceTab('url'); setShowModal(true) }}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> Crear tarea
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', TYPE_COLORS[task.type])}>
                      {TYPE_LABELS[task.type]}
                    </span>
                    {!task.is_published && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        No publicada
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                  {task.description && (
                    <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <CalendarDays className="w-3 h-3" />
                        Entrega: {formatDueDate(task.due_date)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Star className="w-3 h-3" />
                      Puntaje: {task.max_score} pts
                    </span>
                    {(task as any).resource_url && (
                      <a href={(task as any).resource_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                        <Paperclip className="w-3 h-3" />
                        {(task as any).resource_label || 'Recurso adjunto'}
                      </a>
                    )}
                  </div>
                </div>
                {canManage ? (
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Eliminar tarea"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <Link
                    href="/dashboard/alumno/tareas"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Hacer entrega
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nueva Tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Nueva Tarea</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo *</label>
                <select
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value as TaskType }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                >
                  <option value="tarea">Tarea</option>
                  <option value="actividad">Actividad</option>
                  <option value="exposicion">Exposición</option>
                </select>
              </div>
              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Título *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Investigación sobre la célula"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                />
              </div>
              {/* Descripción */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Descripción (opcional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Instrucciones o detalles de la tarea..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 resize-none"
                />
              </div>
              {/* Fecha límite */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha límite (opcional)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                />
              </div>
              {/* Puntaje máximo */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Puntaje máximo</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.max_score}
                  onChange={e => setForm(p => ({ ...p, max_score: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                />
              </div>
              {/* Recurso adjunto */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Recurso adjunto (opcional)</label>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex border-b border-slate-200">
                    <button type="button" onClick={() => setResourceTab('url')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${resourceTab === 'url' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Link2 className="w-3.5 h-3.5" /> Pegar enlace
                    </button>
                    <button type="button" onClick={() => setResourceTab('file')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-l border-slate-200 transition-colors ${resourceTab === 'file' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Upload className="w-3.5 h-3.5" /> Subir archivo
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {resourceTab === 'url' ? (
                      <>
                        <input
                          type="url"
                          value={form.resource_url}
                          onChange={e => setForm(p => ({ ...p, resource_url: e.target.value }))}
                          placeholder="https://drive.google.com/... o cualquier URL"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <p className="text-[11px] text-slate-400">Opcional · Los alumnos podrán ver y descargar este recurso</p>
                      </>
                    ) : (
                      <label className={`flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Upload className="w-5 h-5 text-slate-400" />
                        <span className="text-xs text-slate-500">
                          {uploading ? 'Subiendo...' : form.resource_url && resourceTab === 'file' ? '✓ Archivo subido · haz clic para cambiar' : 'Haz clic para seleccionar un archivo'}
                        </span>
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                      </label>
                    )}
                    {form.resource_url && (
                      <input
                        type="text"
                        value={form.resource_label}
                        onChange={e => setForm(p => ({ ...p, resource_label: e.target.value }))}
                        placeholder="Nombre del recurso (opcional)"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Publicada */}
              <div className="flex items-center gap-3">
                <input
                  id="is_published"
                  type="checkbox"
                  checked={form.is_published}
                  onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="is_published" className="text-sm text-slate-700 cursor-pointer">
                  Publicar inmediatamente
                </label>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.title.trim()}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                  : 'Crear Tarea'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
