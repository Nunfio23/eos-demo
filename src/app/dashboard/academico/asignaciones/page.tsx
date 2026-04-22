'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { UserCheck, Plus, X, Check, BookOpen, ChevronRight, Star, StarOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface Teacher {
  id: string
  user_id: string
  employee_number: string
  full_name: string
}

interface Assignment {
  id: string
  grade_subject_id: string
  section_id: string
  subjectName: string
  gradeName: string
  gradeCode: string
  sectionName: string
}

interface Grade     { id: string; name: string; code: string; sort_order: number }
interface Section   { id: string; name: string; grade_id: string; homeroom_teacher_id: string | null }
interface GSubject  { id: string; grade_id: string; subject_catalog_id: string; subjectName: string }

export default function AsignacionesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role && ['master', 'direccion', 'administracion'].includes(profile.role)

  const [teachers,      setTeachers]      = useState<Teacher[]>([])
  const [selTeacher,    setSelTeacher]    = useState<Teacher | null>(null)
  const [assignments,   setAssignments]   = useState<Assignment[]>([])
  const [grades,        setGrades]        = useState<Grade[]>([])
  const [sections,      setSections]      = useState<Section[]>([])
  const [gSubjects,     setGSubjects]     = useState<GSubject[]>([])
  const [schoolYearId,  setSchoolYearId]  = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [loadingAssign, setLoadingAssign] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [savingHomeroom, setSavingHomeroom] = useState(false)

  // Sección que este docente es orientador (si hay)
  const [homeroomSection, setHomeroomSection] = useState<Section | null>(null)
  // Modal homeroom
  const [showHomeroomModal, setShowHomeroomModal] = useState(false)
  const [homeroomGrade,   setHomeroomGrade]   = useState('')
  const [homeroomSectionId, setHomeroomSectionId] = useState('')

  // Modal nuevo
  const [showModal,   setShowModal]   = useState(false)
  const [modalGrade,  setModalGrade]  = useState('')
  const [modalSection,setModalSection]= useState('')
  const [modalGSub,   setModalGSub]  = useState('')   // grade_subject.id

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    const init = async () => {
      const [{ data: syData }, { data: taData }, { data: grData }, { data: secData }, { data: gsData }] = await Promise.all([
        supabase.from('school_years').select('id').eq('is_active', true).limit(1),
        db.from('teachers').select('id, user_id, employee_number').neq('is_active', false),
        supabase.from('grades').select('id, name, code, sort_order').order('sort_order'),
        supabase.from('sections').select('id, name, grade_id, homeroom_teacher_id').order('name'),
        supabase.from('grade_subjects')
          .select('id, grade_id, subject_catalog_id, subject_catalog:subject_catalog(name)')
          .order('sort_order'),
      ])

      const syId = (syData as { id: string }[] | null)?.[0]?.id ?? null
      setSchoolYearId(syId)
      setGrades(grData ?? [])
      setSections(secData ?? [])
      setGSubjects((gsData ?? []).map((g: any) => ({
        id: g.id, grade_id: g.grade_id, subject_catalog_id: g.subject_catalog_id,
        subjectName: (g.subject_catalog as any)?.name ?? '—',
      })))

      // Fetch profiles for teachers
      const userIds = (taData ?? []).map((t: any) => t.user_id).filter(Boolean)
      const pMap = new Map<string, string>()
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
        for (const p of (profs ?? []) as { id: string; full_name: string }[]) pMap.set(p.id, p.full_name)
      }
      const list: Teacher[] = (taData ?? []).map((t: any) => ({
        id: t.id, user_id: t.user_id, employee_number: t.employee_number,
        full_name: pMap.get(t.user_id) ?? t.employee_number,
      })).sort((a: Teacher, b: Teacher) => a.full_name.localeCompare(b.full_name))
      setTeachers(list)
      setLoading(false)
      clearTimeout(t)
    }
    init()
    return () => clearTimeout(t)
  }, [])

  // ── Cargar asignaciones del docente seleccionado ──────────
  const loadAssignments = useCallback(async (teacher: Teacher) => {
    if (!schoolYearId) return
    setLoadingAssign(true)
    const { data } = await db.from('teacher_assignments')
      .select('id, grade_subject_id, section_id')
      .eq('teacher_id', teacher.id)
      .eq('school_year_id', schoolYearId)
      .neq('is_active', false)

    const gradeMap   = new Map(grades.map(g => [g.id, g]))
    const sectionMap = new Map(sections.map(s => [s.id, s]))
    const gsMap      = new Map(gSubjects.map(gs => [gs.id, gs]))

    const list: Assignment[] = (data ?? []).map((ta: any) => {
      const gs  = gsMap.get(ta.grade_subject_id)
      const sec = sectionMap.get(ta.section_id)
      const gr  = gradeMap.get(gs?.grade_id ?? '')
      return {
        id:             ta.id,
        grade_subject_id: ta.grade_subject_id,
        section_id:     ta.section_id,
        subjectName:    gs?.subjectName ?? '—',
        gradeName:      gr?.name ?? '—',
        gradeCode:      gr?.code ?? '—',
        sectionName:    sec?.name ?? '—',
      }
    }).sort((a: Assignment, b: Assignment) =>
      (a.gradeName + a.sectionName + a.subjectName).localeCompare(b.gradeName + b.sectionName + b.subjectName)
    )
    setAssignments(list)

    // Cargar sección donde este docente es orientador
    const homeroom = sections.find(s => s.homeroom_teacher_id === teacher.id) ?? null
    setHomeroomSection(homeroom)

    setLoadingAssign(false)
  }, [schoolYearId, grades, sections, gSubjects])

  const selectTeacher = (t: Teacher) => {
    setSelTeacher(t)
    loadAssignments(t)
    setShowModal(false)
  }

  // ── Eliminar asignación ────────────────────────────────────
  const handleRemove = async (id: string) => {
    if (!confirm('¿Quitar esta asignación?')) return
    const { error } = await db.from('teacher_assignments').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Asignación eliminada')
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  // ── Agregar asignación ─────────────────────────────────────
  const handleAdd = async () => {
    if (!selTeacher || !modalGSub || !modalSection || !schoolYearId) return
    setSaving(true)
    // Check duplicate for this teacher (in memory)
    const existsLocal = assignments.find(a => a.grade_subject_id === modalGSub && a.section_id === modalSection)
    if (existsLocal) { toast.error('Ya asignaste esta materia a este docente'); setSaving(false); return }

    // Check if already assigned to any other teacher this school year
    const { data: existing } = await db.from('teacher_assignments')
      .select('id, teacher_id')
      .eq('grade_subject_id', modalGSub)
      .eq('section_id', modalSection)
      .eq('school_year_id', schoolYearId)
      .neq('is_active', false)
      .limit(1)
    if (existing && existing.length > 0) {
      const isOtherTeacher = existing[0].teacher_id !== selTeacher.id
      toast.error(isOtherTeacher
        ? 'Esta materia ya está asignada a otro docente en esta sección'
        : 'Ya existe esta asignación')
      setSaving(false)
      return
    }

    const { error } = await db.from('teacher_assignments').insert({
      teacher_id:       selTeacher.id,
      grade_subject_id: modalGSub,
      section_id:       modalSection,
      school_year_id:   schoolYearId,
      is_active:        true,
    })
    setSaving(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Clase asignada')
    setShowModal(false)
    setModalGrade(''); setModalSection(''); setModalGSub('')
    loadAssignments(selTeacher)
  }

  // ── Asignar orientador ─────────────────────────────────────
  const handleAssignHomeroom = async () => {
    if (!selTeacher || !homeroomSectionId) return
    setSavingHomeroom(true)

    // Verificar que la sección no tenga ya otro orientador
    const targetSection = sections.find(s => s.id === homeroomSectionId)
    if (targetSection?.homeroom_teacher_id && targetSection.homeroom_teacher_id !== selTeacher.id) {
      const otherTeacher = teachers.find(t => t.id === targetSection.homeroom_teacher_id)
      toast.error(`Esta sección ya tiene orientador: ${otherTeacher?.full_name ?? 'otro docente'}`)
      setSavingHomeroom(false)
      return
    }

    const { error } = await db.from('sections')
      .update({ homeroom_teacher_id: selTeacher.id })
      .eq('id', homeroomSectionId)

    setSavingHomeroom(false)
    if (error) { toast.error('Error: ' + error.message); return }

    toast.success('Orientador asignado')
    const updated = sections.map(s =>
      s.id === homeroomSectionId ? { ...s, homeroom_teacher_id: selTeacher.id } : s
    )
    setSections(updated)
    setHomeroomSection(updated.find(s => s.id === homeroomSectionId) ?? null)
    setShowHomeroomModal(false)
    setHomeroomGrade(''); setHomeroomSectionId('')
  }

  // ── Quitar orientador ──────────────────────────────────────
  const handleRemoveHomeroom = async () => {
    if (!selTeacher || !homeroomSection) return
    if (!confirm('¿Quitar a este docente como orientador de grado?')) return
    setSavingHomeroom(true)

    const { error } = await db.from('sections')
      .update({ homeroom_teacher_id: null })
      .eq('id', homeroomSection.id)

    setSavingHomeroom(false)
    if (error) { toast.error('Error: ' + error.message); return }

    toast.success('Orientador removido')
    const updated = sections.map(s =>
      s.id === homeroomSection.id ? { ...s, homeroom_teacher_id: null } : s
    )
    setSections(updated)
    setHomeroomSection(null)
  }

  const modalSections = sections.filter(s => s.grade_id === modalGrade)
  const modalSubjects = gSubjects.filter(gs => gs.grade_id === modalGrade)
  const homeroomModalSections = sections.filter(s => s.grade_id === homeroomGrade)

  // Sección info para display
  const getHomeroomDisplay = () => {
    if (!homeroomSection) return null
    const grade = grades.find(g => g.id === homeroomSection.grade_id)
    return { gradeName: grade?.name ?? '—', gradeCode: grade?.code ?? '—', sectionName: homeroomSection.name }
  }
  const homeroomDisplay = getHomeroomDisplay()

  // Rango de grados que enseña (para docentes sin orientación)
  const teachingRange = useMemo(() => {
    if (!selTeacher || homeroomSection || assignments.length === 0) return null
    const sortedGrades = Array.from(new Set(assignments.map(a => a.gradeName)))
      .map(name => grades.find(g => g.name === name))
      .filter((g): g is Grade => !!g)
      .sort((a, b) => a.sort_order - b.sort_order)
    if (sortedGrades.length === 0) return null
    const from = sortedGrades[0].name
    const to   = sortedGrades[sortedGrades.length - 1].name
    return from === to ? from : `${from} – ${to}`
  }, [selTeacher, homeroomSection, assignments, grades])

  // Group assignments by grade+section for display
  const grouped = assignments.reduce<Record<string, Assignment[]>>((acc, a) => {
    const key = `${a.gradeName}||${a.sectionName}`
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Asignación de Clases</h1>
          <p className="page-subtitle">Asigna materias, grados y orientadores</p>
        </div>
        {!schoolYearId && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
            No hay año escolar activo
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Panel izquierdo: lista de docentes */}
        <div className="card p-4 space-y-2 lg:col-span-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-3">
            Docentes ({teachers.length})
          </p>
          {teachers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No hay docentes registrados</p>
          )}
          {teachers.map(t => {
            const isHomeroom = sections.some(s => s.homeroom_teacher_id === t.id)
            return (
              <button
                key={t.id}
                onClick={() => selectTeacher(t)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                  selTeacher?.id === t.id
                    ? 'bg-eos-600 text-white shadow-sm'
                    : 'hover:bg-slate-50 text-slate-700'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  selTeacher?.id === t.id ? 'bg-white/20 text-white' : 'bg-eos-100 text-eos-700'
                )}>
                  {t.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.full_name}</p>
                  <p className={cn('text-xs', selTeacher?.id === t.id ? 'text-white/70' : 'text-slate-400')}>
                    {t.employee_number}
                  </p>
                </div>
                {isHomeroom && (
                  <Star className={cn('w-3.5 h-3.5 shrink-0', selTeacher?.id === t.id ? 'text-yellow-300' : 'text-amber-400')} />
                )}
                <ChevronRight className={cn('w-4 h-4 shrink-0', selTeacher?.id === t.id ? 'text-white/70' : 'text-slate-300')} />
              </button>
            )
          })}
        </div>

        {/* Panel derecho: asignaciones del docente */}
        <div className="lg:col-span-2 space-y-4">
          {!selTeacher ? (
            <div className="card p-16 text-center text-slate-400">
              <UserCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm">Seleccioná un docente para ver y editar sus clases</p>
            </div>
          ) : (
            <>
              {/* Header del docente */}
              <div className="card p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-eos-100 text-eos-700 flex items-center justify-center font-bold text-sm">
                    {selTeacher.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{selTeacher.full_name}</p>
                    <p className="text-xs text-slate-400">{assignments.length} clase{assignments.length !== 1 ? 's' : ''} asignada{assignments.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {isAdmin && schoolYearId && (
                  <button
                    onClick={() => { setShowModal(true); setModalGrade(''); setModalSection(''); setModalGSub('') }}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" /> Agregar clase
                  </button>
                )}
              </div>

              {/* ── Orientador de Grado ── */}
              {isAdmin && (
                <div className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-semibold text-slate-800">Orientador de Grado</p>
                    </div>
                    {loadingAssign ? null : homeroomSection ? (
                      <button
                        onClick={handleRemoveHomeroom}
                        disabled={savingHomeroom}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
                      >
                        <StarOff className="w-3.5 h-3.5" /> Quitar
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowHomeroomModal(true); setHomeroomGrade(''); setHomeroomSectionId('') }}
                        className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Asignar
                      </button>
                    )}
                  </div>

                  {!loadingAssign && (
                    <div className="mt-3">
                      {homeroomDisplay ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
                          <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-lg">
                            {homeroomDisplay.gradeCode}
                          </span>
                          <span className="text-sm font-medium text-amber-800">
                            {homeroomDisplay.gradeName} · Sección {homeroomDisplay.sectionName}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No es orientador de ningún grado este año.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Rango de enseñanza (docentes sin orientación) */}
              {!loadingAssign && !homeroomSection && teachingRange && (
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-eos-500" />
                    <p className="text-sm font-semibold text-slate-800">Docente sin Orientación</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-eos-50 border border-eos-100">
                    <span className="text-xs text-slate-500">Imparte clases de</span>
                    <span className="text-sm font-medium text-eos-700">{teachingRange}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Este docente no orienta ningún grado. El rango se calcula automáticamente de sus clases asignadas.
                  </p>
                </div>
              )}

              {/* Lista de asignaciones */}
              {loadingAssign ? (
                <div className="card p-8 text-center text-slate-400 text-sm">Cargando...</div>
              ) : assignments.length === 0 ? (
                <div className="card p-10 text-center">
                  <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No tiene clases asignadas este año escolar.</p>
                  {isAdmin && schoolYearId && (
                    <button
                      onClick={() => { setShowModal(true); setModalGrade(''); setModalSection(''); setModalGSub('') }}
                      className="mt-3 btn-primary text-sm inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Agregar primera clase
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(grouped).map(([key, items]) => {
                    const [gradeName, sectionName] = key.split('||')
                    return (
                      <div key={key} className="card p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold bg-eos-100 text-eos-700 px-2 py-1 rounded-lg">
                            {items[0].gradeCode}
                          </span>
                          <p className="font-semibold text-slate-800 text-sm">
                            {gradeName} <span className="text-slate-400 font-normal">· Sección {sectionName}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {items.map(a => (
                            <div key={a.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 group">
                              <BookOpen className="w-3.5 h-3.5 text-eos-500 shrink-0" />
                              <span className="text-sm text-slate-700">{a.subjectName}</span>
                              {isAdmin && (
                                <button
                                  onClick={() => handleRemove(a.id)}
                                  className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 text-slate-300 hover:text-red-500 transition-all"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal agregar asignación de clase */}
      {showModal && selTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Agregar Clase</h3>
                <p className="text-xs text-slate-500">{selTeacher.full_name}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="label">Grado</label>
                <select
                  className="input"
                  value={modalGrade}
                  onChange={e => { setModalGrade(e.target.value); setModalSection(''); setModalGSub('') }}
                >
                  <option value="">— Seleccionar —</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Sección</label>
                <select
                  className="input"
                  value={modalSection}
                  disabled={!modalGrade}
                  onChange={e => setModalSection(e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {modalSections.map(s => <option key={s.id} value={s.id}>Sección {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Materia</label>
                <select
                  className="input"
                  value={modalGSub}
                  disabled={!modalGrade}
                  onChange={e => setModalGSub(e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {modalSubjects.map(gs => (
                    <option key={gs.id} value={gs.id}>{gs.subjectName}</option>
                  ))}
                </select>
                {modalGrade && modalSubjects.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Este grado no tiene materias asignadas aún.</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleAdd}
                disabled={saving || !modalGSub || !modalSection}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check className="w-4 h-4" />
                }
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar orientador */}
      {showHomeroomModal && selTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Asignar como Orientador</h3>
                <p className="text-xs text-slate-500">{selTeacher.full_name}</p>
              </div>
              <button onClick={() => setShowHomeroomModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="label">Grado</label>
                <select
                  className="input"
                  value={homeroomGrade}
                  onChange={e => { setHomeroomGrade(e.target.value); setHomeroomSectionId('') }}
                >
                  <option value="">— Seleccionar —</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Sección</label>
                <select
                  className="input"
                  value={homeroomSectionId}
                  disabled={!homeroomGrade}
                  onChange={e => setHomeroomSectionId(e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {homeroomModalSections.map(s => {
                    const currentHomeroom = teachers.find(t => t.id === s.homeroom_teacher_id)
                    return (
                      <option key={s.id} value={s.id}>
                        Sección {s.name}{currentHomeroom ? ` (orientador: ${currentHomeroom.full_name.split(' ')[0]})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <p className="text-xs text-slate-400">
                El orientador es el docente representante del grado ante los padres de familia y la dirección.
              </p>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowHomeroomModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleAssignHomeroom}
                disabled={savingHomeroom || !homeroomSectionId}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingHomeroom
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Star className="w-4 h-4" />
                }
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
