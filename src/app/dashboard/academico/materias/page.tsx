'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  BookOpen, ChevronLeft, ChevronDown, ChevronUp,
  Plus, Pencil, Trash2, X, Check, Clock, Calendar,
  FileText, Target, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface MyMateria {
  id: string          // teacher_assignment id
  subjectName: string
  gradeName: string
  sectionName: string
  gradeSubjectId: string
}

interface Guion {
  id: string
  teacher_assignment_id: string
  title: string
  date: string | null
  duration_minutes: number
  objective: string | null
  intro: string | null
  development: string | null
  closure: string | null
  resources: string | null
  evaluation: string | null
  status: 'borrador' | 'listo'
  created_at: string
}

// ─── Colors ────────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-400', header: 'from-violet-500 to-violet-600' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-400', header: 'from-blue-500 to-blue-600' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400', header: 'from-emerald-500 to-emerald-600' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400', header: 'from-amber-400 to-amber-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-400', header: 'from-rose-500 to-rose-600' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-400', header: 'from-cyan-500 to-cyan-600' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400', header: 'from-orange-400 to-orange-500' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', dot: 'bg-pink-400', header: 'from-pink-500 to-pink-600' },
]

function subjectColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % SUBJECT_COLORS.length
  return SUBJECT_COLORS[hash]
}

// ─── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('es-SV', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Default form ──────────────────────────────────────────────────────────────

const defaultForm = () => ({
  title: '',
  date: '',
  duration_minutes: '45',
  objective: '',
  intro: '',
  development: '',
  closure: '',
  resources: '',
  evaluation: '',
  status: 'borrador' as 'borrador' | 'listo',
})

// ──────────────────────────────────────────────────────────────────────────────
// Alumno / Padre — read-only subject view
// ──────────────────────────────────────────────────────────────────────────────

interface AlumnoMateria {
  subjectName: string
  teacherName: string
  latestScore: number | null
  month: number | null
  color: ReturnType<typeof subjectColor>
}

function AlumnoMateriasView({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const db = supabase as any
  const [materias, setMaterias] = useState<AlumnoMateria[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    const load = async () => {
      const { data: student } = await db.from('students').select('id').eq('user_id', profile.id).maybeSingle()
      if (!student) { setLoading(false); clearTimeout(t); return }

      const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      if (!sy) { setLoading(false); clearTimeout(t); return }

      const { data: enroll } = await db.from('enrollments').select('section_id').eq('student_id', student.id).eq('school_year_id', sy.id).maybeSingle()
      if (!enroll) { setLoading(false); clearTimeout(t); return }

      // teacher_assignments for this section
      const { data: tas } = await db.from('teacher_assignments').select('id, grade_subject_id, teacher_id').eq('section_id', enroll.section_id).eq('school_year_id', sy.id)
      const tasArr: any[] = tas ?? []
      if (tasArr.length === 0) { setLoading(false); clearTimeout(t); return }

      const gsIds     = [...new Set(tasArr.map((a: any) => a.grade_subject_id))] as string[]
      const tIds      = [...new Set(tasArr.map((a: any) => a.teacher_id))] as string[]
      const taIds     = tasArr.map((a: any) => a.id) as string[]

      const [{ data: gsubjects }, { data: teacherRecs }, { data: mgs }] = await Promise.all([
        db.from('grade_subjects').select('id, subject_catalog_id').in('id', gsIds),
        db.from('teachers').select('id, user_id').in('id', tIds),
        db.from('monthly_grades').select('teacher_assignment_id, month, final_score')
          .eq('student_id', student.id).eq('school_year_id', sy.id).in('teacher_assignment_id', taIds),
      ])

      const scIds    = [...new Set((gsubjects ?? []).map((g: any) => g.subject_catalog_id))] as string[]
      const userIds  = (teacherRecs ?? []).map((t: any) => t.user_id).filter(Boolean) as string[]

      const [{ data: catalog }, { data: profiles }] = await Promise.all([
        db.from('subject_catalog').select('id, name').in('id', scIds),
        db.from('profiles').select('id, full_name').in('id', userIds),
      ])

      const catMap     = new Map((catalog ?? []).map((c: any) => [c.id, c.name]))
      const gsMap      = new Map((gsubjects ?? []).map((g: any) => [g.id, catMap.get(g.subject_catalog_id) ?? '—']))
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))
      const tMap       = new Map((teacherRecs ?? []).map((t: any) => [t.id, profileMap.get(t.user_id) ?? '—']))

      // Latest grade per teacher_assignment
      const gradeMap = new Map<string, { score: number; month: number }>()
      for (const mg of (mgs ?? [])) {
        const prev = gradeMap.get(mg.teacher_assignment_id)
        if (!prev || mg.month > prev.month) gradeMap.set(mg.teacher_assignment_id, { score: Number(mg.final_score), month: mg.month })
      }

      const list: AlumnoMateria[] = tasArr.map((a: any) => ({
        subjectName: gsMap.get(a.grade_subject_id) ?? '—',
        teacherName: tMap.get(a.teacher_id) ?? '—',
        latestScore: gradeMap.get(a.id)?.score ?? null,
        month:       gradeMap.get(a.id)?.month ?? null,
        color:       subjectColor(gsMap.get(a.grade_subject_id) ?? ''),
      })).sort((a: AlumnoMateria, b: AlumnoMateria) => a.subjectName.localeCompare(b.subjectName))

      setMaterias(list)
      setLoading(false)
      clearTimeout(t)
    }
    load().catch(() => { setLoading(false); clearTimeout(t) })
    return () => clearTimeout(t)
  }, [profile]) // eslint-disable-line

  const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="page-title">Mis Materias</h1>
          <p className="page-subtitle">{materias.length} materia{materias.length !== 1 ? 's' : ''} inscrita{materias.length !== 1 ? 's' : ''} este año</p>
        </div>
      </div>

      {materias.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3">
          <BookOpen className="w-10 h-10 text-slate-200" />
          <p className="text-slate-400 text-sm">No hay materias asignadas a tu sección aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {materias.map(m => {
            const score = m.latestScore
            const scoreStr = score != null ? score.toFixed(1) : '—'
            const scoreClr = score == null ? 'text-slate-400' : score >= 9 ? 'text-emerald-600' : score >= 7 ? 'text-blue-600' : score >= 6 ? 'text-amber-500' : 'text-red-500'
            return (
              <div key={`${m.subjectName}-${m.teacherName}`}
                className={`rounded-2xl border ${m.color.border} ${m.color.bg} overflow-hidden`}>
                <div className={`bg-gradient-to-r ${m.color.header} px-4 py-3`}>
                  <h3 className="font-semibold text-white text-sm truncate">{m.subjectName}</h3>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${m.color.dot}`} />
                    <span className="text-xs text-slate-600 truncate">{m.teacherName}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      Última nota {m.month ? `· ${MONTH_NAMES[m.month - 1]}` : ''}
                    </span>
                    <span className={`text-xl font-bold tabular-nums ${scoreClr}`}>{scoreStr}</span>
                  </div>
                  {score != null && (
                    <div className="bg-white/60 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${score >= 9 ? 'bg-emerald-500' : score >= 7 ? 'bg-blue-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${Math.min((score / 10) * 100, 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────────────────────────────────────

export default function MateriasPage() {
  const { profile } = useAuth()
  const isDocente = profile?.role === 'docente'

  // Alumno/padre see their own subjects — completely different view
  if (profile?.role === 'alumno' || profile?.role === 'padre') {
    return profile ? <AlumnoMateriasView profile={profile} /> : null
  }

  // ── materias
  const [materias, setMaterias] = useState<MyMateria[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // ── navigation
  const [selected, setSelected] = useState<MyMateria | null>(null)

  // ── guiones
  const [guiones, setGuiones] = useState<Guion[]>([])
  const [loadingGuiones, setLoadingGuiones] = useState(false)
  const [guionCounts, setGuionCounts] = useState<Record<string, number>>({})

  // ── modal
  const [showForm, setShowForm] = useState(false)
  const [editGuion, setEditGuion] = useState<Guion | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(defaultForm())

  // ── expand
  const [expandedGuion, setExpandedGuion] = useState<string | null>(null)

  // ─── Load materias ──────────────────────────────────────────────────────────

  const loadMaterias = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setLoadError(false)
    try {
      const { data: teacher } = await supabase
        .from('teachers').select('id').eq('user_id', profile.id).single()
      if (!teacher) { setLoading(false); return }

      const { data: sy } = await supabase
        .from('school_years').select('id').eq('is_active', true).single()
      if (!sy) { setLoading(false); return }

      const { data: ta } = await supabase
        .from('teacher_assignments')
        .select('id, section_id, grade_subject_id')
        .eq('teacher_id', teacher.id)
        .eq('school_year_id', sy.id)
        .eq('is_active', true)

      const taList = ta ?? []
      if (taList.length === 0) { setMaterias([]); setLoading(false); return }

      const sIds  = taList.map((t: any) => t.section_id).filter(Boolean) as string[]
      const gsIds = taList.map((t: any) => t.grade_subject_id).filter(Boolean) as string[]

      const [{ data: secData }, { data: gsData }] = await Promise.all([
        supabase.from('sections').select('id, name, grade_id').in('id', sIds),
        supabase.from('grade_subjects').select('id, grade_id, subject_catalog_id').in('id', gsIds),
      ])

      const gradeIds = [...new Set((secData ?? []).map((s: any) => s.grade_id).filter(Boolean))] as string[]
      const catIds   = [...new Set((gsData ?? []).map((g: any) => g.subject_catalog_id).filter(Boolean))] as string[]

      const [{ data: gradeData }, { data: catData }] = await Promise.all([
        gradeIds.length > 0
          ? supabase.from('grades').select('id, name').in('id', gradeIds)
          : Promise.resolve({ data: [] as any[] }),
        catIds.length > 0
          ? supabase.from('subject_catalog').select('id, name').in('id', catIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const secMap   = new Map((secData ?? []).map((s: any) => [s.id, s]))
      const gsMap    = new Map((gsData ?? []).map((g: any) => [g.id, g]))
      const gradeMap = new Map((gradeData ?? []).map((g: any) => [g.id, g]))
      const catMap   = new Map((catData ?? []).map((c: any) => [c.id, c]))

      const built: MyMateria[] = taList.map((taItem: any) => {
        const sec   = secMap.get(taItem.section_id) as any
        const gs    = gsMap.get(taItem.grade_subject_id) as any
        const grade = gradeMap.get(sec?.grade_id) as any
        const cat   = catMap.get(gs?.subject_catalog_id) as any
        return {
          id: taItem.id,
          subjectName: cat?.name ?? '—',
          gradeName: grade?.name ?? '—',
          sectionName: sec?.name ?? '—',
          gradeSubjectId: taItem.grade_subject_id ?? '',
        }
      }).sort((a: MyMateria, b: MyMateria) =>
        a.subjectName.localeCompare(b.subjectName) || a.gradeName.localeCompare(b.gradeName)
      )

      setMaterias(built)

      // Load guion counts for all assignments
      if (built.length > 0) {
        const ids = built.map((m) => m.id)
        const { data: counts } = await db
          .from('guiones_clase')
          .select('teacher_assignment_id')
          .in('teacher_assignment_id', ids)
        const countMap: Record<string, number> = {}
        for (const row of counts ?? []) {
          countMap[row.teacher_assignment_id] = (countMap[row.teacher_assignment_id] ?? 0) + 1
        }
        setGuionCounts(countMap)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    const t = setTimeout(() => setLoading(false), 15000)
    loadMaterias().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadMaterias])

  // ─── Load guiones ───────────────────────────────────────────────────────────

  const loadGuiones = useCallback(async (materiaId: string) => {
    setLoadingGuiones(true)
    const { data } = await db
      .from('guiones_clase')
      .select('*')
      .eq('teacher_assignment_id', materiaId)
      .order('date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    setGuiones(data ?? [])
    setLoadingGuiones(false)

    // Update count in map
    setGuionCounts((prev) => ({ ...prev, [materiaId]: (data ?? []).length }))
  }, [])

  // ─── Select materia ─────────────────────────────────────────────────────────

  const selectMateria = (m: MyMateria) => {
    setSelected(m)
    setGuiones([])
    setExpandedGuion(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    loadGuiones(m.id)
  }

  const goBack = () => {
    setSelected(null)
    setGuiones([])
    setExpandedGuion(null)
  }

  // ─── Open modal ─────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditGuion(null)
    setForm(defaultForm())
    setShowForm(true)
  }

  const openEdit = (g: Guion) => {
    setEditGuion(g)
    setForm({
      title: g.title,
      date: g.date ?? '',
      duration_minutes: String(g.duration_minutes),
      objective: g.objective ?? '',
      intro: g.intro ?? '',
      development: g.development ?? '',
      closure: g.closure ?? '',
      resources: g.resources ?? '',
      evaluation: g.evaluation ?? '',
      status: g.status,
    })
    setShowForm(true)
  }

  const closeModal = () => {
    setShowForm(false)
    setEditGuion(null)
  }

  // ─── Save guion ─────────────────────────────────────────────────────────────

  const saveGuion = async () => {
    if (!form.title.trim()) { toast.error('El título es requerido'); return }
    if (!selected || !profile) return
    setSaving(true)
    try {
      const payload = {
        teacher_assignment_id: selected.id,
        created_by: profile.id,
        title: form.title.trim(),
        date: form.date || null,
        duration_minutes: parseInt(form.duration_minutes) || 45,
        objective: form.objective.trim() || null,
        intro: form.intro.trim() || null,
        development: form.development.trim() || null,
        closure: form.closure.trim() || null,
        resources: form.resources.trim() || null,
        evaluation: form.evaluation.trim() || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      }

      if (editGuion) {
        await db.from('guiones_clase').update(payload).eq('id', editGuion.id)
      } else {
        await db.from('guiones_clase').insert(payload)
      }

      toast.success('Guión guardado')
      closeModal()
      await loadGuiones(selected.id)
    } catch {
      toast.error('Error al guardar el guión')
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete guion ───────────────────────────────────────────────────────────

  const deleteGuion = async (g: Guion) => {
    if (!confirm('¿Eliminar este guión?')) return
    await db.from('guiones_clase').delete().eq('id', g.id)
    toast.success('Guión eliminado')
    if (selected) await loadGuiones(selected.id)
  }

  // ─── Access guard ───────────────────────────────────────────────────────────

  if (!isDocente) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400 text-sm">Esta vista es solo para docentes.</p>
      </div>
    )
  }

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <p className="text-slate-500 text-sm">No se pudieron cargar las materias.</p>
          <button className="btn-secondary text-xs" onClick={loadMaterias}>Reintentar</button>
        </div>
      </div>
    )
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const totalGuiones   = Object.values(guionCounts).reduce((a, b) => a + b, 0)
  const uniqueGrades   = new Set(materias.map((m) => m.gradeName)).size

  // ──────────────────────────────────────────────────────────────────────────────
  // VISTA 2: Detalle de una materia
  // ──────────────────────────────────────────────────────────────────────────────

  if (selected !== null) {
    const color = subjectColor(selected.subjectName)
    const listos    = guiones.filter((g) => g.status === 'listo').length
    const borradores = guiones.filter((g) => g.status === 'borrador').length

    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a mis materias
        </button>

        {/* Header card */}
        <div className="card overflow-hidden p-0">
          <div className={cn('bg-gradient-to-br p-6 text-white relative', color.header)}>
            <BookOpen className="w-16 h-16 opacity-10 absolute top-4 right-4" />
            <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1">Materia</p>
            <h1 className="text-2xl font-bold mb-1">{selected.subjectName}</h1>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <span>{selected.gradeName}</span>
              <span>·</span>
              <span>Sección {selected.sectionName}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <div className="px-5 py-3 text-center">
              <p className="text-2xl font-bold text-slate-800">{guiones.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">Guiones</p>
            </div>
            <div className="px-5 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{listos}</p>
              <p className="text-xs text-slate-400 mt-0.5">Listos</p>
            </div>
            <div className="px-5 py-3 text-center">
              <p className="text-2xl font-bold text-amber-500">{borradores}</p>
              <p className="text-xs text-slate-400 mt-0.5">Borradores</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-700">Guiones de clase</h2>
          <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Nuevo Guión
          </button>
        </div>

        {/* Guiones list */}
        {loadingGuiones ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guiones.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center', color.bg)}>
              <FileText className={cn('w-8 h-8', color.text)} />
            </div>
            <div>
              <p className="text-slate-600 font-medium">No hay guiones aún</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Creá tu primer guión de clase para esta materia.
              </p>
            </div>
            <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm mt-2">
              <Plus className="w-4 h-4" />
              Crear primer guión
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {guiones.map((g) => {
              const isExpanded = expandedGuion === g.id
              return (
                <div key={g.id} className="card p-0 overflow-hidden">
                  {/* Guion header row */}
                  <div className="flex items-start gap-3 p-4">
                    <div className={cn('mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color.bg)}>
                      <FileText className={cn('w-4 h-4', color.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-800 leading-tight">{g.title}</p>
                        <span className={cn(
                          'flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium border',
                          g.status === 'listo'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}>
                          {g.status === 'listo' ? 'Listo' : 'Borrador'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(g.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {g.duration_minutes} min
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-50 pt-3">
                      {g.objective && (
                        <GuionSection icon={<Target className="w-3.5 h-3.5" />} label="Objetivo" text={g.objective} />
                      )}
                      {g.intro && (
                        <GuionSection icon={<Layers className="w-3.5 h-3.5" />} label="Introducción" text={g.intro} />
                      )}
                      {g.development && (
                        <GuionSection icon={<BookOpen className="w-3.5 h-3.5" />} label="Desarrollo" text={g.development} />
                      )}
                      {g.closure && (
                        <GuionSection icon={<Check className="w-3.5 h-3.5" />} label="Cierre" text={g.closure} />
                      )}
                      {g.resources && (
                        <GuionSection icon={<FileText className="w-3.5 h-3.5" />} label="Recursos" text={g.resources} />
                      )}
                      {g.evaluation && (
                        <GuionSection icon={<Target className="w-3.5 h-3.5" />} label="Evaluación" text={g.evaluation} />
                      )}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-slate-50 bg-slate-50/50">
                    <button
                      onClick={() => setExpandedGuion(isExpanded ? null : g.id)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Ocultar' : 'Ver contenido'}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(g)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteGuion(g)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Modal */}
        <GuionModal
          open={showForm}
          onClose={closeModal}
          form={form}
          setForm={setForm}
          onSave={saveGuion}
          saving={saving}
          isEdit={!!editGuion}
          color={color}
        />
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // VISTA 1: Lista de materias
  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="page-title">Mis Materias</h1>
          <p className="page-subtitle">Tus asignaciones del año escolar activo</p>
        </div>
      </div>

      {/* Quick stats */}
      {materias.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={materias.length} label="Materias" color="blue" />
          <StatCard value={uniqueGrades} label="Grados" color="violet" />
          <StatCard value={totalGuiones} label="Guiones totales" color="emerald" />
        </div>
      )}

      {/* Empty state */}
      {materias.length === 0 && (
        <div className="card flex items-center justify-center h-48">
          <div className="text-center">
            <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No tenés materias asignadas para este año escolar.</p>
            <p className="text-slate-300 text-xs mt-1">Contactá al director para que te asigne clases.</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {materias.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materias.map((m) => {
            const color = subjectColor(m.subjectName)
            const count = guionCounts[m.id] ?? 0
            return (
              <MateriaCard
                key={m.id}
                materia={m}
                color={color}
                guionCount={count}
                onSelect={() => selectMateria(m)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number; label: string; color: 'blue' | 'violet' | 'emerald' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <div className={cn('rounded-2xl p-4 border border-slate-100', colors[color])}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-70 mt-0.5">{label}</p>
    </div>
  )
}

function MateriaCard({
  materia, color, guionCount, onSelect,
}: {
  materia: MyMateria
  color: typeof SUBJECT_COLORS[0]
  guionCount: number
  onSelect: () => void
}) {
  return (
    <div
      className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden cursor-pointer group hover:shadow-md transition-all duration-200"
      onClick={onSelect}
    >
      {/* Color header */}
      <div className={cn('h-24 bg-gradient-to-br relative p-4 flex items-end', color.header)}>
        <BookOpen className="w-8 h-8 text-white opacity-20 absolute top-3 right-3 group-hover:opacity-30 transition-opacity" />
        <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
          {materia.subjectName}
        </h3>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{materia.gradeName}</p>
          <span className={cn(
            'inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full font-medium border',
            color.bg, color.text, color.border
          )}>
            Sección {materia.sectionName}
          </span>
        </div>

        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {guionCount === 0
              ? 'Sin guiones aún'
              : `${guionCount} guión${guionCount !== 1 ? 'es' : ''}`}
          </p>
          <span className={cn(
            'text-xs font-medium px-3 py-1.5 rounded-xl transition-opacity group-hover:opacity-70',
            color.bg, color.text
          )}>
            Ver guiones →
          </span>
        </div>
      </div>
    </div>
  )
}

function GuionSection({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Modal
// ──────────────────────────────────────────────────────────────────────────────

type FormState = ReturnType<typeof defaultForm>

function GuionModal({
  open, onClose, form, setForm, onSave, saving, isEdit, color,
}: {
  open: boolean
  onClose: () => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => void
  saving: boolean
  isEdit: boolean
  color: typeof SUBJECT_COLORS[0]
}) {
  if (!open) return null

  const field = (key: keyof FormState) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className={cn('bg-gradient-to-r p-5 rounded-t-2xl flex items-center justify-between text-white', color.header)}>
          <div>
            <h2 className="font-bold text-lg">{isEdit ? 'Editar guión' : 'Nuevo guión de clase'}</h2>
            <p className="text-white/70 text-sm">Completá los campos del plan de clase</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="label">Título <span className="text-rose-500">*</span></label>
            <input
              className="input"
              placeholder="Ej: Introducción a las fracciones"
              value={form.title}
              onChange={field('title')}
            />
          </div>

          {/* Date + Duration + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={field('date')}
              />
            </div>
            <div>
              <label className="label">Duración</label>
              <div className="relative">
                <input
                  className="input pr-16"
                  type="number"
                  min={15}
                  max={240}
                  value={form.duration_minutes}
                  onChange={field('duration_minutes')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                  minutos
                </span>
              </div>
            </div>
            <div>
              <label className="label">Estado</label>
              <select
                className="input"
                value={form.status}
                onChange={field('status')}
              >
                <option value="borrador">Borrador</option>
                <option value="listo">Listo</option>
              </select>
            </div>
          </div>

          {/* Objective */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-slate-400" />
              Objetivo
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="¿Qué aprenderán los estudiantes al finalizar esta clase?"
              value={form.objective}
              onChange={field('objective')}
            />
          </div>

          {/* Intro */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Introducción
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Motivación inicial, conexión con conocimientos previos..."
              value={form.intro}
              onChange={field('intro')}
            />
          </div>

          {/* Development */}
          <div>
            <label className="label flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              Desarrollo
            </label>
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Actividades principales, explicaciones, ejercicios..."
              value={form.development}
              onChange={field('development')}
            />
          </div>

          {/* Closure */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-slate-400" />
              Cierre
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Conclusiones, reflexión, tarea..."
              value={form.closure}
              onChange={field('closure')}
            />
          </div>

          {/* Resources */}
          <div>
            <label className="label flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Recursos
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Materiales, libros, tecnología necesaria..."
              value={form.resources}
              onChange={field('resources')}
            />
          </div>

          {/* Evaluation */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-slate-400" />
              Evaluación
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="¿Cómo verificarás el aprendizaje?"
              value={form.evaluation}
              onChange={field('evaluation')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.title.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {saving ? 'Guardando...' : 'Guardar Guión'}
          </button>
        </div>
      </div>
    </div>
  )
}
