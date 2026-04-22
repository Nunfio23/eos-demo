'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/db'
import { BookOpen, ChevronRight, ChevronDown, Plus, Search, Clock, Trash2, X, Check, UserCheck, CalendarDays, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

interface SchoolYear { id: string; name: string; is_active: boolean; start_date: string; end_date: string }
interface Level { id: string; name: string; code: string; sort_order: number }
interface Grade { id: string; level_id: string; name: string; code: string; sort_order: number }
interface SubjectCatalog { id: string; name: string; code: string }
interface GradeSubject {
  id: string; grade_id: string; subject_catalog_id: string
  weekly_hours: number; sort_order: number
  subject_catalog: SubjectCatalog
}
interface Teacher { id: string; employee_number: string; user_id?: string; profile: { full_name: string } }
interface SectionRow { id: string; name: string; grade_id: string }
interface TeacherAssignment { id: string; teacher_id: string; grade_subject_id: string; section_id: string }

const LEVEL_COLORS: Record<string, string> = {
  PARV: 'bg-pink-50 border-pink-200 text-pink-700',
  ELEM: 'bg-blue-50 border-blue-200 text-blue-700',
  MID:  'bg-violet-50 border-violet-200 text-violet-700',
  HIGH: 'bg-amber-50 border-amber-200 text-amber-700',
}
const LEVEL_DOT: Record<string, string> = {
  PARV: 'bg-pink-400', ELEM: 'bg-blue-400', MID: 'bg-violet-400', HIGH: 'bg-amber-400',
}

export default function AcademicoPage() {
  const { profile } = useAuth()
  const isAdmin   = profile?.role && ['master', 'direccion', 'administracion'].includes(profile.role)
  const isDocente = profile?.role === 'docente'

  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [gradeSubjects, setGradeSubjects] = useState<GradeSubject[]>([])
  const [catalog, setCatalog] = useState<SubjectCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [showAddSubject, setShowAddSubject] = useState(false)
  const [addSubjectGrade, setAddSubjectGrade] = useState<Grade | null>(null)
  const [addSubjectId, setAddSubjectId] = useState('')
  const [addHours, setAddHours] = useState(5)
  const [saving, setSaving] = useState(false)

  const [showCatalog, setShowCatalog] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectCode, setNewSubjectCode] = useState('')
  const [savingCatalog, setSavingCatalog] = useState(false)

  // Teacher assignments
  const [teachers,          setTeachers]          = useState<Teacher[]>([])
  const [sections,          setSections]          = useState<SectionRow[]>([])
  const [schoolYearId,      setSchoolYearId]      = useState<string | null>(null)
  const [teacherAssignments,setTeacherAssignments]= useState<TeacherAssignment[]>([])
  const [savingAssignment,  setSavingAssignment]  = useState(false)
  // Docente: grados a los que está asignado
  const [teacherGradeIds,   setTeacherGradeIds]   = useState<Set<string>>(new Set())
  // School year management
  const [schoolYears,       setSchoolYears]       = useState<SchoolYear[]>([])
  const [showYearPanel,     setShowYearPanel]     = useState(false)
  const [newYearName,       setNewYearName]       = useState('')
  const [newYearStart,      setNewYearStart]      = useState('')
  const [newYearEnd,        setNewYearEnd]        = useState('')
  const [savingYear,        setSavingYear]        = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const handleAddToCatalog = async () => {
    if (!newSubjectName.trim()) return
    setSavingCatalog(true)
    const code = newSubjectCode.trim() || newSubjectName.trim().slice(0, 4).toUpperCase()
    const { error } = await supabase.from('subject_catalog').insert({ name: newSubjectName.trim(), code })
    setSavingCatalog(false)
    if (error) { toast.error('Error al crear materia'); return }
    toast.success('Materia creada en el catálogo')
    setNewSubjectName(''); setNewSubjectCode('')
    loadData()
  }

  const handleDeleteFromCatalog = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}" del catálogo? Se quitará de todos los grados.`)) return
    const { error } = await supabase.from('subject_catalog').delete().eq('id', id)
    if (error) { toast.error('No se pudo eliminar (puede estar en uso)'); return }
    toast.success('Materia eliminada del catálogo')
    loadData()
  }

  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)
    loadData().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [profile?.id])

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    const [lvlRes, gradeRes, gsRes, catRes] = await Promise.all([
      withTimeout(supabase.from('levels').select('*').order('sort_order')),
      withTimeout(supabase.from('grades').select('*').order('sort_order')),
      withTimeout(supabase.from('grade_subjects').select('*, subject_catalog(id,name,code)').order('sort_order')),
      withTimeout(supabase.from('subject_catalog').select('*').order('name')),
    ])
    if ([lvlRes, gradeRes, gsRes, catRes].some(r => (r as { timedOut?: boolean }).timedOut)) {
      setLoadError(true)
      setLoading(false)
      return
    }
    const lvls = lvlRes.data ?? []
    setLevels(lvls)
    setGrades(gradeRes.data ?? [])
    setGradeSubjects((gsRes.data ?? []) as GradeSubject[])
    setCatalog(catRes.data ?? [])
    setExpandedLevels(new Set(lvls.map(l => l.id)))

    // Load teachers, sections, school year, and assignments
    const { data: syAll } = await db.from('school_years').select('*').order('start_date', { ascending: false })
    const years = (syAll ?? []) as SchoolYear[]
    setSchoolYears(years)
    const sy = years.find(y => y.is_active)
    const syId = sy?.id ?? null
    setSchoolYearId(syId)

    const [{ data: teacherData }, { data: sectionData }, { data: taData }] = await Promise.all([
      db.from('teachers').select('id, employee_number, user_id, profile:profiles!teachers_user_id_fkey(full_name)').eq('is_active', true),
      supabase.from('sections').select('id, name, grade_id').order('name'),
      syId
        ? db.from('teacher_assignments').select('id, teacher_id, grade_subject_id, section_id').eq('school_year_id', syId).eq('is_active', true)
        : Promise.resolve({ data: [] }),
    ])

    // Incluir usuarios con rol 'direccion' en la lista de docentes asignables
    // Si aún no tienen registro en teachers, se crea automáticamente
    const { data: dirProfiles } = await supabase
      .from('profiles').select('id, full_name').eq('role', 'direccion').eq('is_active', true)
    const teacherUserIds = new Set((teacherData ?? []).map((t: any) => t.user_id))
    const extraTeachers: Teacher[] = []
    for (const dp of (dirProfiles ?? [])) {
      if (teacherUserIds.has(dp.id)) continue
      // Crear registro teachers para este director si no existe
      const { data: newT } = await db.from('teachers').insert({
        user_id: dp.id, employee_number: `DIR-${dp.id.slice(0, 6).toUpperCase()}`, is_active: true,
      }).select('id, employee_number, user_id').single()
      if (newT) extraTeachers.push({ id: newT.id, employee_number: newT.employee_number, user_id: dp.id, profile: { full_name: dp.full_name } })
    }
    // También incluir directores que ya tenían registro en teachers
    const dirWithRecord = (teacherData ?? []).filter((t: any) => {
      const dp = (dirProfiles ?? []).find((d: any) => d.id === t.user_id)
      return !!dp
    }).map((t: any) => ({ ...t, profile: { full_name: (dirProfiles ?? []).find((d: any) => d.id === t.user_id)?.full_name ?? t.profile?.full_name } }))

    const allTeachers = [
      ...(teacherData ?? []).filter((t: any) => !dirWithRecord.some((d: any) => d.id === t.id)) as Teacher[],
      ...dirWithRecord as Teacher[],
      ...extraTeachers,
    ]
    setTeachers(allTeachers)
    setSections((sectionData ?? []) as SectionRow[])
    setTeacherAssignments((taData ?? []) as TeacherAssignment[])

    // Si es docente o director asignado a grado, cargar sus grados asignados para filtrar la vista
    if (profile?.role === 'docente' || profile?.role === 'direccion') {
      const { data: myTeacher } = await db.from('teachers').select('id').eq('user_id', profile.id).single()
      if (myTeacher && syId) {
        // Dos queries separadas para mayor confiabilidad
        const { data: myTa } = await db.from('teacher_assignments')
          .select('grade_subject_id')
          .eq('teacher_id', myTeacher.id)
          .eq('school_year_id', syId)
          .eq('is_active', true)
        const gsIds = (myTa ?? []).map((ta: any) => ta.grade_subject_id).filter(Boolean)
        if (gsIds.length > 0) {
          const { data: gsList } = await db.from('grade_subjects').select('grade_id').in('id', gsIds)
          const gradeIds = new Set<string>((gsList ?? []).map((gs: any) => gs.grade_id).filter(Boolean))
          setTeacherGradeIds(gradeIds)
        }
      }
    }

    setLoading(false)
  }

  const handleCreateYear = async () => {
    if (!newYearName.trim()) { toast.error('El nombre es requerido'); return }
    setSavingYear(true)
    const { data, error } = await db.from('school_years').insert({
      name: newYearName.trim(),
      start_date: newYearStart || null,
      end_date: newYearEnd || null,
      is_active: false,
    }).select().single()
    setSavingYear(false)
    if (error) { toast.error('Error al crear: ' + error.message); return }
    toast.success('Año escolar creado')
    setNewYearName(''); setNewYearStart(''); setNewYearEnd('')
    await loadData()
    // Auto-activate if it's the first one
    if (schoolYears.length === 0 && data) handleActivateYear(data.id)
  }

  const handleActivateYear = async (id: string) => {
    setSavingYear(true)
    // Deactivate all, then activate selected
    await db.from('school_years').update({ is_active: false }).neq('id', id)
    const { error } = await db.from('school_years').update({ is_active: true }).eq('id', id)
    setSavingYear(false)
    if (error) { toast.error('Error al activar: ' + error.message); return }
    toast.success('Año escolar activado')
    loadData()
  }

  const toggleLevel = (id: string) =>
    setExpandedLevels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const gradesForLevel = (levelId: string) => {
    const all = grades.filter(g => g.level_id === levelId)
    // Si es docente: mostrar solo sus grados asignados (nunca todos)
    if (isDocente) return teacherGradeIds.size > 0 ? all.filter(g => teacherGradeIds.has(g.id)) : []
    return all
  }
  const subjectsForGrade = (gradeId: string) => gradeSubjects.filter(gs => gs.grade_id === gradeId)

  const filteredLevels = (() => {
    // Para docentes: solo niveles que tengan sus grados asignados
    const base = isDocente
      ? levels.filter(l => gradesForLevel(l.id).length > 0)
      : levels
    return search
      ? base.filter(l => gradesForLevel(l.id).some(g =>
          g.name.toLowerCase().includes(search.toLowerCase()) ||
          subjectsForGrade(g.id).some(gs => gs.subject_catalog.name.toLowerCase().includes(search.toLowerCase()))
        ))
      : base
  })()

  const openAddSubject = (grade: Grade) => {
    setAddSubjectGrade(grade); setAddSubjectId(''); setAddHours(5); setShowAddSubject(true)
  }

  const handleAddSubject = async () => {
    if (!addSubjectGrade || !addSubjectId) return
    setSaving(true)
    const { error } = await supabase.from('grade_subjects').insert({
      grade_id: addSubjectGrade.id, subject_catalog_id: addSubjectId, weekly_hours: addHours,
    })
    setSaving(false)
    if (error) { toast.error('Ya existe esa materia en este grado'); return }
    toast.success('Materia agregada'); setShowAddSubject(false); loadData()
  }

  const handleRemoveSubject = async (gsId: string) => {
    if (!confirm('¿Quitar esta materia del grado?')) return
    const { error } = await supabase.from('grade_subjects').delete().eq('id', gsId)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Materia eliminada'); loadData()
  }

  // Returns the teacher_id assigned to majority of subjects for a grade/section
  const getTeacherForSection = (gradeId: string, sectionId: string): string => {
    const subjects = subjectsForGrade(gradeId)
    if (!subjects.length) return ''
    const counts: Record<string, number> = {}
    for (const gs of subjects) {
      const ta = teacherAssignments.find(t => t.grade_subject_id === gs.id && t.section_id === sectionId)
      if (ta?.teacher_id) counts[ta.teacher_id] = (counts[ta.teacher_id] ?? 0) + 1
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] ?? ''
  }

  // Assign a teacher to ALL subjects of a grade/section (or remove if teacherId is '')
  const handleAssignTeacher = async (gradeId: string, sectionId: string, teacherId: string) => {
    if (!schoolYearId) { toast.error('No hay año escolar activo'); return }
    setSavingAssignment(true)
    const subjects = subjectsForGrade(gradeId)
    if (!subjects.length) { toast('Este grado no tiene materias aún'); setSavingAssignment(false); return }

    if (teacherId === '') {
      // Remove all assignments for this grade/section/year
      const ids = teacherAssignments
        .filter(ta => subjects.some(gs => gs.id === ta.grade_subject_id) && ta.section_id === sectionId)
        .map(ta => ta.id)
      if (ids.length > 0) await db.from('teacher_assignments').delete().in('id', ids)
      toast.success('Asignación eliminada')
    } else {
      // Upsert one assignment per subject
      const upserts = subjects.map(gs => ({
        teacher_id:       teacherId,
        grade_subject_id: gs.id,
        section_id:       sectionId,
        school_year_id:   schoolYearId,
        is_active:        true,
      }))
      const { error } = await db.from('teacher_assignments')
        .upsert(upserts, { onConflict: 'grade_subject_id,section_id,school_year_id' })
      if (error) { toast.error('Error al guardar: ' + error.message); setSavingAssignment(false); return }
      toast.success('Docente asignado al grado')
    }
    setSavingAssignment(false)
    loadData()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-slate-500 text-sm">No se pudo conectar con la base de datos.</p>
      <button onClick={loadData} className="btn-primary text-sm">Reintentar</button>
    </div>
  )

  const totalGrades = grades.length
  const totalSubjectAssignments = gradeSubjects.length

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Académico</h1>
          <p className="page-subtitle">Estructura curricular: niveles → grados → materias</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowYearPanel(v => !v)}
              className={cn(
                'flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition-colors',
                showYearPanel
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : schoolYearId
                    ? 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400'
                    : 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-400'
              )}
            >
              {schoolYearId ? <CalendarDays className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {schoolYearId
                ? (schoolYears.find(y => y.id === schoolYearId)?.name ?? 'Año Escolar')
                : 'Sin año activo'
              }
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowCatalog(v => !v)} className={cn('flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition-colors', showCatalog ? 'bg-eos-600 text-white border-eos-600' : 'bg-white text-slate-600 border-slate-200 hover:border-eos-300')}>
              <BookOpen className="w-4 h-4" /> Catálogo
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 w-48"
            />
          </div>
        </div>
      </div>

      {/* Panel catálogo */}
      {showCatalog && isAdmin && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 text-sm">Catálogo de Materias</h3>
          <div className="flex gap-2">
            <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)}
              placeholder="Nombre de la materia" onKeyDown={e => e.key === 'Enter' && handleAddToCatalog()}
              className="input flex-1 text-sm" />
            <input value={newSubjectCode} onChange={e => setNewSubjectCode(e.target.value)}
              placeholder="Código (ej: MAT)" maxLength={6}
              className="input w-28 text-sm font-mono" />
            <button onClick={handleAddToCatalog} disabled={savingCatalog || !newSubjectName.trim()} className="btn-primary px-4 flex items-center gap-1.5 disabled:opacity-50">
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {catalog.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 group">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{c.code}</p>
                </div>
                <button onClick={() => handleDeleteFromCatalog(c.id, c.name)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel años escolares */}
      {showYearPanel && isAdmin && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-600" /> Años Escolares
          </h3>

          {/* Años existentes */}
          {schoolYears.length > 0 && (
            <div className="space-y-2">
              {schoolYears.map(y => (
                <div key={y.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{y.name}</p>
                    {(y.start_date || y.end_date) && (
                      <p className="text-xs text-slate-400">
                        {y.start_date ? new Date(y.start_date).toLocaleDateString('es-CR') : '?'} →{' '}
                        {y.end_date ? new Date(y.end_date).toLocaleDateString('es-CR') : '?'}
                      </p>
                    )}
                  </div>
                  {y.is_active ? (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">Activo</span>
                  ) : (
                    <button
                      onClick={() => handleActivateYear(y.id)}
                      disabled={savingYear}
                      className="text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Activar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Crear nuevo */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Crear nuevo año escolar</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={newYearName}
                onChange={e => setNewYearName(e.target.value)}
                placeholder="Nombre (ej: 2025-2026)"
                className="input flex-1 min-w-[140px] text-sm"
              />
              <input
                type="date"
                value={newYearStart}
                onChange={e => setNewYearStart(e.target.value)}
                className="input w-40 text-sm"
                title="Fecha de inicio"
              />
              <input
                type="date"
                value={newYearEnd}
                onChange={e => setNewYearEnd(e.target.value)}
                className="input w-40 text-sm"
                title="Fecha de fin"
              />
              <button
                onClick={handleCreateYear}
                disabled={savingYear || !newYearName.trim()}
                className="btn-primary px-4 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta si no hay año activo */}
      {isAdmin && !schoolYearId && !showYearPanel && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>No hay año escolar activo. Haz clic en <strong>Sin año activo</strong> para crear y activar uno.</span>
        </div>
      )}

      {/* Stats de niveles — solo para admin o docentes con grados asignados */}
      {(!isDocente || teacherGradeIds.size > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {levels.filter(l => gradesForLevel(l.id).length > 0).map(level => {
            const lg = gradesForLevel(level.id)
            const totalSubs = lg.reduce((a, g) => a + subjectsForGrade(g.id).length, 0)
            return (
              <div key={level.id} className={cn('rounded-2xl border p-4', LEVEL_COLORS[level.code] ?? 'bg-slate-50 border-slate-200 text-slate-700')}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('w-2 h-2 rounded-full', LEVEL_DOT[level.code] ?? 'bg-slate-400')} />
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{level.code}</span>
                </div>
                <p className="font-bold">{level.name}</p>
                <p className="text-xs mt-1 opacity-60">{lg.length} grado{lg.length !== 1 ? 's' : ''} · {totalSubs} materias</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Total resumen — solo admins */}
      {isAdmin && (
        <p className="text-xs text-slate-400">
          {totalGrades} grados · {totalSubjectAssignments} asignaciones de materias en total
        </p>
      )}

      {/* Mensaje si docente sin grado asignado */}
      {isDocente && !isAdmin && teacherGradeIds.size === 0 && (
        <div className="card p-10 text-center text-slate-400 text-sm">
          <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p>Aún no tienes un grado asignado en el año escolar activo.</p>
          <p className="text-xs mt-1">Solicita a la administración que te asigne un grado en el módulo Académico.</p>
        </div>
      )}

      {/* Árbol */}
      <div className="space-y-3">
        {filteredLevels.map(level => {
          const isExpanded = expandedLevels.has(level.id)
          const levelGrades = gradesForLevel(level.id)
          return (
            <div key={level.id} className="card overflow-hidden">
              <button
                onClick={() => toggleLevel(level.id)}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0', LEVEL_COLORS[level.code] ?? 'bg-slate-50 border-slate-200 text-slate-700')}>
                  {level.code}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-slate-900">{level.name}</p>
                  <p className="text-xs text-slate-400">{levelGrades.length} grados</p>
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {levelGrades.map(grade => {
                    const subjects = subjectsForGrade(grade.id)
                    const isOpen = selectedGrade === grade.id
                    return (
                      <div key={grade.id}>
                        <div
                          className="flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setSelectedGrade(isOpen ? null : grade.id)}
                        >
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-600">{grade.code}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800">{grade.name}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />{subjects.length}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={e => { e.stopPropagation(); openAddSubject(grade) }}
                                className="flex items-center gap-1 text-xs text-eos-600 hover:bg-eos-50 px-2 py-1 rounded-lg transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Agregar
                              </button>
                            )}
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </div>

                        {isOpen && (
                          <div className="bg-slate-50/50 px-6 py-4 space-y-5">
                            {/* Materias */}
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Materias</p>
                              {subjects.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Sin materias asignadas.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                  {subjects.map(gs => (
                                    <div key={gs.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-all group">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-md bg-eos-50 flex items-center justify-center shrink-0">
                                          <BookOpen className="w-3 h-3 text-eos-600" />
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-slate-800 truncate">{gs.subject_catalog.name}</p>
                                          <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <Clock className="w-2.5 h-2.5" />{gs.weekly_hours}h/sem
                                          </p>
                                        </div>
                                      </div>
                                      {isAdmin && (
                                        <button onClick={() => handleRemoveSubject(gs.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Asignación de docentes por sección */}
                            {isAdmin && subjects.length > 0 && (() => {
                              const gradeSections = sections.filter(s => s.grade_id === grade.id)
                              if (!gradeSections.length) return (
                                <p className="text-xs text-slate-400 italic">No hay secciones creadas para este grado.</p>
                              )
                              return (
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <UserCheck className="w-3.5 h-3.5" /> Docente por Sección
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {gradeSections.map(sec => {
                                      const currentTeacherId = getTeacherForSection(grade.id, sec.id)
                                      return (
                                        <div key={sec.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2">
                                          <span className="text-xs font-semibold text-slate-500 w-16 shrink-0">Sección {sec.name}</span>
                                          <select
                                            value={currentTeacherId}
                                            disabled={savingAssignment || !schoolYearId}
                                            onChange={e => handleAssignTeacher(grade.id, sec.id, e.target.value)}
                                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-eos-500 bg-white min-w-[160px]"
                                          >
                                            <option value="">— Sin docente —</option>
                                            {teachers.map(t => (
                                              <option key={t.id} value={t.id}>
                                                {(t.profile as any)?.full_name ?? t.employee_number}
                                              </option>
                                            ))}
                                          </select>
                                          {currentTeacherId && (
                                            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                              {subjects.length} materias
                                            </span>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                  {!schoolYearId && (
                                    <p className="text-xs text-amber-600 mt-2">No hay año escolar activo. Activa uno para poder asignar docentes.</p>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal agregar materia */}
      {showAddSubject && addSubjectGrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Agregar Materia</h3>
                <p className="text-xs text-slate-500">{addSubjectGrade.name}</p>
              </div>
              <button onClick={() => setShowAddSubject(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Materia del catálogo</label>
                <select
                  value={addSubjectId} onChange={e => setAddSubjectId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                >
                  <option value="">Seleccionar...</option>
                  {catalog
                    .filter(c => !subjectsForGrade(addSubjectGrade.id).some(gs => gs.subject_catalog_id === c.id))
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  }
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Horas por semana</label>
                <input
                  type="number" min={1} max={40} value={addHours}
                  onChange={e => setAddHours(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowAddSubject(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleAddSubject} disabled={saving || !addSubjectId} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
