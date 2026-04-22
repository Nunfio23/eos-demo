'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { ClipboardList, Plus, Trash2, X, CalendarDays, Star, ExternalLink, Monitor, Pencil, Link2, Paperclip, Upload, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import BackButton from '@/components/ui/BackButton'

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskType = 'tarea' | 'actividad' | 'exposicion'

interface Classroom {
  id: string
  name: string
  color: string
  section_id: string
  school_year_id: string
}

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
  resource_url: string | null
  resource_label: string | null
}

interface TaskForm {
  classroom_id: string
  type: TaskType
  title: string
  description: string
  due_date: string
  max_score: number
  is_published: boolean
  resource_url: string
  resource_label: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const emptyForm: TaskForm = {
  classroom_id: '',
  type: 'tarea',
  title: '',
  description: '',
  due_date: '',
  max_score: 10,
  is_published: true,
  resource_url: '',
  resource_label: '',
}

const formatDueDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TareasPage() {
  const { profile } = useAuth()
  const db = supabase as any

  const isAdmin = profile?.role && ['master', 'direccion', 'administracion'].includes(profile.role)
  const isTeacher = profile?.role === 'docente'

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [uploading, setUploading] = useState(false)
  const [resourceTab, setResourceTab] = useState<'url' | 'file'>('url')

  const loadData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    try {
      let classroomIds: string[] = []

      if (isAdmin) {
        // Admin: load all active classrooms
        const { data: cls } = await db
          .from('classrooms')
          .select('id, name, color, section_id, school_year_id')
          .eq('is_active', true)
          .order('name')
        setClassrooms((cls ?? []) as Classroom[])
        classroomIds = (cls ?? []).map((c: Classroom) => c.id)
      } else if (isTeacher) {
        // Teacher: find their teacher record, then assignments, then classrooms
        const { data: teacherRow } = await db
          .from('teachers')
          .select('id')
          .eq('user_id', profile.id)
          .single()

        if (!teacherRow) {
          setClassrooms([])
          setTasks([])
          setLoading(false)
          return
        }

        // Get active school year
        const { data: years } = await db.from('school_years').select('id, is_active')
        const activeYear = (years ?? []).find((y: any) => y.is_active)

        let assignmentsData: any[] = []
        if (activeYear?.id) {
          const { data } = await db
            .from('teacher_assignments')
            .select('section_id')
            .eq('teacher_id', teacherRow.id)
            .eq('school_year_id', activeYear.id)
            .neq('is_active', false)
          assignmentsData = data ?? []
        }
        // Fallback: any assignment without year filter
        if (assignmentsData.length === 0) {
          const { data } = await db
            .from('teacher_assignments')
            .select('section_id')
            .eq('teacher_id', teacherRow.id)
            .neq('is_active', false)
          assignmentsData = data ?? []
        }

        const sectionIds = assignmentsData.map((a: any) => a.section_id).filter(Boolean)

        if (sectionIds.length === 0) {
          setClassrooms([])
          setTasks([])
          setLoading(false)
          return
        }

        const { data: cls } = await db
          .from('classrooms')
          .select('id, name, color, section_id, school_year_id')
          .in('section_id', sectionIds)
          .eq('is_active', true)
          .order('name')
        setClassrooms((cls ?? []) as Classroom[])
        classroomIds = (cls ?? []).map((c: Classroom) => c.id)
      }

      // Load tasks for those classrooms
      if (classroomIds.length > 0) {
        let query = db
          .from('classroom_tasks')
          .select('*')
          .in('classroom_id', classroomIds)
          .order('created_at', { ascending: false })

        // Teachers only see their own tasks
        if (isTeacher) {
          query = query.eq('created_by', profile.id)
        }

        const { data: taskData, error } = await query
        if (error) toast.error('Error al cargar tareas')
        setTasks((taskData ?? []) as Task[])
      } else {
        setTasks([])
      }
    } catch {
      toast.error('Error al cargar datos')
    }

    setLoading(false)
  }, [profile, isAdmin, isTeacher])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadData().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadData])

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setForm({
      classroom_id: task.classroom_id,
      type: task.type,
      title: task.title,
      description: task.description ?? '',
      due_date: task.due_date ?? '',
      max_score: task.max_score,
      is_published: task.is_published,
      resource_url: task.resource_url ?? '',
      resource_label: task.resource_label ?? '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.classroom_id) { toast.error('Selecciona un aula'); return }
    if (!form.title.trim()) { toast.error('El título es requerido'); return }
    if (!profile) { toast.error('Sesión no disponible'); return }
    setSaving(true)

    if (editingTask) {
      // Update existing task
      const { error } = await db.from('classroom_tasks').update({
        classroom_id: form.classroom_id,
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        max_score: form.max_score,
        is_published: form.is_published,
        resource_url: form.resource_url.trim() || null,
        resource_label: form.resource_label.trim() || null,
      }).eq('id', editingTask.id)
      setSaving(false)
      if (error) { toast.error('Error al actualizar la tarea'); return }
      toast.success('Tarea actualizada')
    } else {
      // Create new task
      const { error } = await db.from('classroom_tasks').insert({
        classroom_id: form.classroom_id,
        created_by: profile.id,
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        max_score: form.max_score,
        is_published: form.is_published,
        resource_url: form.resource_url.trim() || null,
        resource_label: form.resource_label.trim() || null,
      })
      setSaving(false)
      if (error) { toast.error('Error al crear la tarea'); return }
      toast.success('Tarea creada')
    }

    setShowModal(false)
    setEditingTask(null)
    setForm(emptyForm)
    loadData()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('El archivo no puede superar 20MB'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `tasks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('task-resources').upload(path, file, { upsert: true })
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
    loadData()
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  const stats = {
    total: tasks.length,
    tareas: tasks.filter(t => t.type === 'tarea').length,
    actividades: tasks.filter(t => t.type === 'actividad').length,
    exposiciones: tasks.filter(t => t.type === 'exposicion').length,
  }

  // ─── Classrooms grouped with their tasks ─────────────────────────────────

  const classroomsWithTasks = classrooms.map(c => ({
    ...c,
    tasks: tasks.filter(t => t.classroom_id === c.id),
  }))

  // ─── Loading / Empty ─────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!isAdmin && !isTeacher) return (
    <div className="card flex flex-col items-center justify-center h-48 gap-3">
      <ClipboardList className="w-10 h-10 text-slate-200" />
      <p className="text-slate-400 text-sm">No tienes acceso a esta sección</p>
    </div>
  )

  if (classrooms.length === 0) return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Tareas y Actividades</h1>
        <p className="page-subtitle">Gestión de tareas por aula virtual</p>
      </div>
      <div className="card flex flex-col items-center justify-center h-48 gap-3">
        <Monitor className="w-10 h-10 text-slate-200" />
        <p className="text-slate-400 text-sm">
          {isTeacher
            ? 'No tienes aulas asignadas. Contacta a la administración.'
            : 'No hay aulas activas disponibles.'}
        </p>
        <Link href="/dashboard/aulas" className="btn-secondary text-sm flex items-center gap-2">
          <ExternalLink className="w-3.5 h-3.5" /> Ir a Aulas Virtuales
        </Link>
      </div>
    </div>
  )

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Tareas y Actividades</h1>
          <p className="page-subtitle">Gestión de tareas por aula virtual</p>
        </div>
        <button
          onClick={() => { setEditingTask(null); setForm(emptyForm); setShowModal(true) }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Nueva Tarea
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-400 mt-0.5">Total</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-violet-600">{stats.tareas}</p>
          <p className="text-xs text-slate-400 mt-0.5">Tareas</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.actividades}</p>
          <p className="text-xs text-slate-400 mt-0.5">Actividades</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.exposiciones}</p>
          <p className="text-xs text-slate-400 mt-0.5">Exposiciones</p>
        </div>
      </div>

      {/* Tareas agrupadas por aula */}
      <div className="space-y-6">
        {classroomsWithTasks.map(classroom => (
          <div key={classroom.id} className="card overflow-hidden">
            {/* Classroom header */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ backgroundColor: classroom.color + '22', borderBottom: `2px solid ${classroom.color}44` }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: classroom.color }}
                />
                <span className="font-semibold text-slate-800 text-sm">{classroom.name}</span>
                <span className="text-xs text-slate-400 ml-1">
                  ({classroom.tasks.length} {classroom.tasks.length === 1 ? 'tarea' : 'tareas'})
                </span>
              </div>
              <Link
                href="/dashboard/aulas"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium"
              >
                Ver en Aula Virtual <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {/* Tasks list */}
            {classroom.tasks.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-slate-400 text-sm">
                Sin tareas en este aula
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {classroom.tasks.map(task => (
                  <div key={task.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', TYPE_COLORS[task.type])}>
                          {TYPE_LABELS[task.type]}
                        </span>
                        {!task.is_published && (
                          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            No publicada
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {task.due_date && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <CalendarDays className="w-3 h-3" />
                            {formatDueDate(task.due_date)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Star className="w-3 h-3" />
                          {task.max_score} pts
                        </span>
                        {task.resource_url && (
                          <a href={task.resource_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                            <Paperclip className="w-3 h-3" />
                            {task.resource_label || 'Recurso adjunto'}
                          </a>
                        )}
                      </div>
                    </div>
                    {(isAdmin || task.created_by === profile?.id) && (
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                          onClick={() => openEdit(task)}
                          className="p-1.5 text-slate-300 hover:text-eos-600 hover:bg-eos-50 rounded-lg transition-colors"
                          title="Editar tarea"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar tarea"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Nueva Tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-900">{editingTask ? 'Editar Tarea' : 'Nueva Tarea'}</h3>
              <button onClick={() => { setShowModal(false); setEditingTask(null) }} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Aula */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Aula virtual *</label>
                <select
                  value={form.classroom_id}
                  onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                >
                  <option value="">Seleccionar aula...</option>
                  {classrooms.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
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
              {/* Publicada */}
              <div className="flex items-center gap-3">
                <input
                  id="modal_is_published"
                  type="checkbox"
                  checked={form.is_published}
                  onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="modal_is_published" className="text-sm text-slate-700 cursor-pointer">
                  Publicar inmediatamente
                </label>
              </div>

              {/* Recurso adjunto */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() => setResourceTab('url')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${resourceTab === 'url' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Link2 className="w-3.5 h-3.5" /> Pegar enlace
                  </button>
                  <button
                    type="button"
                    onClick={() => setResourceTab('file')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-l border-slate-200 ${resourceTab === 'file' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Upload className="w-3.5 h-3.5" /> Subir archivo
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {resourceTab === 'url' ? (
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        value={form.resource_url}
                        onChange={e => setForm(p => ({ ...p, resource_url: e.target.value }))}
                        placeholder="https://drive.google.com/… o cualquier URL"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                  ) : (
                    <label className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                      {uploading
                        ? <><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-indigo-600">Subiendo...</span></>
                        : <><FileText className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Clic para seleccionar archivo (máx. 20 MB)</span></>
                      }
                      <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading}
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.mp4,.zip" />
                    </label>
                  )}
                  {form.resource_url && (
                    <div className="flex items-center gap-2">
                      <input
                        value={form.resource_label}
                        onChange={e => setForm(p => ({ ...p, resource_label: e.target.value }))}
                        placeholder="Nombre del recurso (ej: Guía de lectura)"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <button type="button" onClick={() => setForm(p => ({ ...p, resource_url: '', resource_label: '' }))}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {!form.resource_url && <p className="text-xs text-slate-400">Opcional · Los alumnos podrán ver y descargar este recurso</p>}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => { setShowModal(false); setEditingTask(null) }} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.classroom_id}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                  : editingTask ? 'Guardar cambios' : 'Crear Tarea'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
