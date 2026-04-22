'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { Monitor, Plus, X, ArrowLeft, Send, Trash2, BookOpen, Link as LinkIcon, Zap, Users, ClipboardList } from 'lucide-react'
import ExamenesTab from './ExamenesTab'
import TareasTab from './TareasTab'

interface SchoolYear { id: string; name: string; is_active: boolean }
interface Level      { id: string; name: string; sort_order: number }
interface Grade      { id: string; name: string; level_id: string }
interface Section    { id: string; name: string; grade_id: string; capacity: number }
interface Classroom  {
  id: string; name: string; description: string | null
  color: string; section_id: string; school_year_id: string; is_active: boolean
}
interface SubjectSlot {
  ta_id: string
  subject_name: string
  teacher_name: string
  color: string
}
interface Post {
  id: string; classroom_id: string; author_id: string
  content: string; attachment_url: string | null
  created_at: string; teacher_assignment_id: string | null
  author?: { full_name: string; role: string }
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316']

export default function AulasPage() {
  const { profile } = useAuth()
  const isAdmin   = !!(profile?.role && ['master','direccion','administracion'].includes(profile.role))
  const isTeacher = profile?.role === 'docente'
  const isStudent = profile?.role === 'alumno'
  const isPadre   = profile?.role === 'padre'

  // Role-based section visibility
  const [teacherSectionIds, setTeacherSectionIds] = useState<string[]>([])
  const [myTASlots, setMyTASlots] = useState<(SubjectSlot & { section_id: string })[]>([])
  const [studentSectionIds, setStudentSectionIds] = useState<string[]>([])

  // Data
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [levels,    setLevels]    = useState<Level[]>([])
  const [grades,    setGrades]    = useState<Grade[]>([])
  const [sections,  setSections]  = useState<Section[]>([])
  const [classrooms,setClassrooms]= useState<Classroom[]>([])
  const [posts,     setPosts]     = useState<Post[]>([])

  // Navigation state
  const [selected,        setSelected]        = useState<Classroom | null>(null)
  const [selectedTA,      setSelectedTA]      = useState<SubjectSlot | null>(null)
  const [sectionSubjects, setSectionSubjects] = useState<SubjectSlot[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [activeTab,       setActiveTab]       = useState<'posts'|'exams'|'tareas'>('posts')

  // UI state
  const [loading,      setLoading]      = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [selectedYear, setSelectedYear] = useState('')
  const [postContent,  setPostContent]  = useState('')
  const [postUrl,      setPostUrl]      = useState('')
  const [showNewClass, setShowNewClass] = useState(false)
  const [classForm,    setClassForm]    = useState({
    name: '', description: '', color: '#6366f1', section_id: '',
  })

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadBase().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [])

  // Load student/padre sections
  useEffect(() => {
    if (!profile || (profile.role !== 'alumno' && profile.role !== 'padre')) return
    const db = supabase as any
    const load = async () => {
      const { data: sy } = await db.from('school_years').select('id').eq('is_active', true).maybeSingle()
      if (!sy) return
      if (profile.role === 'alumno') {
        const { data: student } = await db.from('students').select('id').eq('user_id', profile.id).maybeSingle()
        if (!student) return
        const { data: enroll } = await db.from('enrollments').select('section_id').eq('student_id', student.id).eq('school_year_id', sy.id).maybeSingle()
        if (enroll?.section_id) setStudentSectionIds([enroll.section_id])
      } else {
        // Buscar hijos: student_parents (nueva) + fallback a students.parent_id (legacy)
        const { data: spRows } = await db.from('student_parents').select('student_id').eq('parent_id', profile.id)
        const spIds = (spRows ?? []).map((r: any) => r.student_id)
        const { data: legacyStudents } = await db.from('students').select('id').eq('parent_id', profile.id)
        const legacyIds = (legacyStudents ?? []).map((r: any) => r.id).filter((id: string) => !spIds.includes(id))
        const sids = [...new Set([...spIds, ...legacyIds])]
        if (!sids.length) return
        const { data: enrolls } = await db.from('enrollments').select('section_id').in('student_id', sids).eq('school_year_id', sy.id)
        setStudentSectionIds((enrolls ?? []).map((e: any) => e.section_id).filter(Boolean))
      }
    }
    load()
  }, [profile])

  // Load teacher sections + TA slots
  useEffect(() => {
    if (!profile || profile.role !== 'docente') return
    const db = supabase as any
    const load = async () => {
      const { data: teacher } = await db.from('teachers').select('id').eq('user_id', profile.id).single()
      if (!teacher) return
      const { data: years } = await db.from('school_years').select('id, is_active')
      const activeYear = (years ?? []).find((y: any) => y.is_active)
      if (!activeYear) return

      const { data: ta } = await db
        .from('teacher_assignments')
        .select('id, section_id, grade_subject:grade_subjects(subject_catalog:subject_catalog(name))')
        .eq('teacher_id', teacher.id)
        .eq('school_year_id', activeYear.id)
        .neq('is_active', false)

      const slots = (ta ?? []).map((t: any, i: number) => ({
        ta_id: t.id,
        subject_name: t.grade_subject?.subject_catalog?.name ?? '—',
        section_id: t.section_id,
        teacher_name: profile.full_name ?? 'Yo',
        color: COLORS[i % COLORS.length],
      }))
      setTeacherSectionIds([...new Set((ta ?? []).map((t: any) => t.section_id).filter(Boolean))])
      setMyTASlots(slots)
    }
    load()
  }, [profile])

  const loadBase = async () => {
    setLoading(true)
    const db = supabase as any
    const [syRes, lvlRes, gradeRes, secRes] = await Promise.all([
      db.from('school_years').select('id, name, is_active').order('start_date', { ascending: false }),
      supabase.from('levels').select('id, name, sort_order').order('sort_order'),
      supabase.from('grades').select('id, name, level_id').order('sort_order'),
      supabase.from('sections').select('id, name, grade_id, capacity').order('name'),
    ])
    const years: SchoolYear[] = syRes.data ?? []
    setSchoolYears(years)
    setLevels(lvlRes.data ?? [])
    setGrades(gradeRes.data ?? [])
    setSections(secRes.data ?? [])
    const active = years.find(y => y.is_active)
    if (active) setSelectedYear(active.id)
    setLoading(false)
  }

  const loadClassrooms = useCallback(async () => {
    if (!selectedYear) return
    const { data } = await supabase.from('classrooms').select('*')
      .eq('school_year_id', selectedYear).eq('is_active', true).order('name')
    setClassrooms((data ?? []) as Classroom[])
  }, [selectedYear])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadClassrooms().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadClassrooms])

  // Load all subjects in a section (for admins, students, parents)
  const loadSectionSubjects = useCallback(async (sectionId: string, schoolYearId: string) => {
    setLoadingSubjects(true)
    const { data } = await (supabase as any)
      .from('teacher_assignments')
      .select('id, grade_subject:grade_subjects(subject_catalog:subject_catalog(name)), teacher:teachers(profile:profiles(full_name))')
      .eq('section_id', sectionId)
      .eq('school_year_id', schoolYearId)
      .neq('is_active', false)

    setSectionSubjects((data ?? []).map((ta: any, i: number) => ({
      ta_id: ta.id,
      subject_name: ta.grade_subject?.subject_catalog?.name ?? '—',
      teacher_name: ta.teacher?.profile?.full_name ?? 'Docente',
      color: COLORS[i % COLORS.length],
    })))
    setLoadingSubjects(false)
  }, [])

  // Handle clicking a classroom card → go to subject selection
  const handleSelectClassroom = (c: Classroom) => {
    setSelected(c)
    setSelectedTA(null)
    setPosts([])
    setActiveTab('posts')
    if (isTeacher) {
      // Show only this teacher's subjects in this section
      const mySubjects = myTASlots
        .filter(s => s.section_id === c.section_id)
        .map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }))
      setSectionSubjects(mySubjects)
    } else {
      loadSectionSubjects(c.section_id, c.school_year_id)
    }
  }

  // Handle clicking a subject card → go to classroom content
  const handleSelectTA = (ta: SubjectSlot) => {
    setSelectedTA(ta)
    setActiveTab('posts')
    if (selected) loadPosts(selected.id, ta.ta_id)
  }

  const loadPosts = useCallback(async (classroomId: string, taId?: string) => {
    setLoadingPosts(true)
    let q = (supabase as any)
      .from('classroom_posts')
      .select('id, classroom_id, author_id, content, attachment_url, created_at, teacher_assignment_id, author:profiles(full_name, role)')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (taId) q = q.eq('teacher_assignment_id', taId)
    const { data } = await q
    setPosts((data ?? []) as Post[])
    setLoadingPosts(false)
  }, [])

  const handlePost = async () => {
    if (!postContent.trim() || !selected || !selectedTA) return
    setSaving(true)
    const { error } = await (supabase as any).from('classroom_posts').insert({
      classroom_id:          selected.id,
      author_id:             profile!.id,
      content:               postContent.trim(),
      attachment_url:        postUrl.trim() || null,
      teacher_assignment_id: selectedTA.ta_id,
    })
    setSaving(false)
    if (error) { toast.error('Error al publicar'); return }
    toast.success('Publicado')
    setPostContent('')
    setPostUrl('')
    loadPosts(selected.id, selectedTA.ta_id)
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm('¿Eliminar esta publicación?')) return
    await supabase.from('classroom_posts').delete().eq('id', postId)
    toast.success('Eliminado')
    if (selected && selectedTA) loadPosts(selected.id, selectedTA.ta_id)
  }

  const handleCreateClassroom = async () => {
    if (!classForm.name.trim() || !classForm.section_id || !selectedYear) {
      toast.error('Nombre y sección son requeridos'); return
    }
    setSaving(true)
    const { error } = await (supabase as any).from('classrooms').insert({
      name: classForm.name.trim(), description: classForm.description || null,
      color: classForm.color, section_id: classForm.section_id, school_year_id: selectedYear,
    })
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? 'Ya existe un aula para esa sección este año' : 'Error al crear')
      return
    }
    toast.success('Aula creada')
    setShowNewClass(false)
    setClassForm({ name: '', description: '', color: '#6366f1', section_id: '' })
    loadClassrooms()
  }

  const handleGenerateClassrooms = async () => {
    if (!selectedYear) return
    if (!confirm('¿Generar una aula virtual para cada sección activa? Se omitirán las que ya existan.')) return
    setSaving(true)
    const { data: existing } = await supabase.from('classrooms').select('section_id').eq('school_year_id', selectedYear)
    const existingSectionIds = new Set((existing ?? []).map((c: any) => c.section_id))
    const toCreate = sections.filter(s => !existingSectionIds.has(s.id))
    let created = 0
    for (let i = 0; i < toCreate.length; i++) {
      const sec = toCreate[i]
      const grade = grades.find(g => g.id === sec.grade_id)
      const name = `${grade?.name ?? 'Grado'} · Sección ${sec.name}`
      const { error } = await (supabase as any).from('classrooms').insert({
        name, description: null, color: COLORS[i % COLORS.length],
        section_id: sec.id, school_year_id: selectedYear,
      })
      if (!error) created++
    }
    setSaving(false)
    toast.success(`${created} aulas creadas`)
    loadClassrooms()
  }

  const getSectionLabel = (sectionId: string) => {
    const sec = sections.find(s => s.id === sectionId)
    if (!sec) return '—'
    const grade = grades.find(g => g.id === sec.grade_id)
    return `${grade?.name ?? ''} · Sección ${sec.name}`
  }

  const gradesForLevel   = (levelId: string) => grades.filter(g => g.level_id === levelId)
  const sectionsForGrade = (gradeId: string) => sections.filter(s => s.grade_id === gradeId)

  const visibleClassrooms = isTeacher
    ? classrooms.filter(c => teacherSectionIds.includes(c.section_id))
    : (isStudent || isPadre)
    ? classrooms.filter(c => studentSectionIds.includes(c.section_id))
    : classrooms

  // canManage in a subject: admin always yes; teacher only for their own TA
  const canManageTA = (ta: SubjectSlot) =>
    !!(isAdmin || (isTeacher && myTASlots.some(s => s.ta_id === ta.ta_id)))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── VISTA DETALLE: publicaciones/tareas/exámenes por materia ──────────────
  if (selected && selectedTA) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => { setSelectedTA(null); setPosts([]) }}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: selectedTA.color }}>
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="page-title">{selectedTA.subject_name}</h1>
          <p className="page-subtitle">{selected.name} · {selectedTA.teacher_name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['posts','tareas','exams'] as const).map(tab => {
          const labels = { posts: 'Publicaciones', tareas: 'Tareas', exams: 'Exámenes' }
          const icons  = { posts: BookOpen, tareas: ClipboardList, exams: ClipboardList }
          const Icon = icons[tab]
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" /> {labels[tab]}
            </button>
          )
        })}
      </div>

      {/* Tab: Publicaciones */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          {canManageTA(selectedTA) && (
            <div className="card p-4 space-y-3">
              <textarea value={postContent} onChange={e => setPostContent(e.target.value)}
                placeholder="Escribe un anuncio, material o instrucción para el aula..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 resize-none" />
              <div className="flex items-center gap-3">
                <input value={postUrl} onChange={e => setPostUrl(e.target.value)}
                  placeholder="Enlace adjunto (opcional)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
                <button onClick={handlePost} disabled={saving || !postContent.trim()}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send className="w-4 h-4" />}
                  Publicar
                </button>
              </div>
            </div>
          )}
          {loadingPosts ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="card flex items-center justify-center h-40">
              <div className="text-center">
                <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Sin publicaciones aún</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{post.content}</p>
                      {post.attachment_url && (
                        <a href={post.attachment_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 text-xs text-eos-600 hover:underline font-medium">
                          <LinkIcon className="w-3 h-3" /> Ver enlace adjunto
                        </a>
                      )}
                      <p className="text-xs text-slate-400 mt-2">
                        {(post.author as any)?.full_name ?? 'Usuario'} · {new Date(post.created_at).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {(isAdmin || post.author_id === profile?.id) && (
                      <button onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Tareas */}
      {activeTab === 'tareas' && (
        <TareasTab
          classroom={selected}
          teacherAssignmentId={selectedTA.ta_id}
          canManage={canManageTA(selectedTA)}
        />
      )}

      {/* Tab: Exámenes */}
      {activeTab === 'exams' && (
        <ExamenesTab
          classroom={selected}
          teacherAssignmentId={selectedTA.ta_id}
          canManage={canManageTA(selectedTA)}
          isStudent={isStudent}
        />
      )}
    </div>
  )

  // ── VISTA INTERMEDIA: selección de materia ────────────────────────────────
  if (selected && !selectedTA) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => { setSelected(null); setSectionSubjects([]) }}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: selected.color }}>
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="page-title">{selected.name}</h1>
          <p className="page-subtitle">Selecciona una materia</p>
        </div>
      </div>

      {loadingSubjects ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sectionSubjects.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 gap-2">
          <Users className="w-8 h-8 text-slate-200" />
          <p className="text-slate-400 text-sm">No hay materias asignadas en esta sección</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionSubjects.map(slot => (
            <div key={slot.ta_id} onClick={() => handleSelectTA(slot)}
              className="card overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
              <div className="h-16 flex items-center px-4 relative" style={{ backgroundColor: slot.color }}>
                <div className="absolute inset-0 bg-black/20" />
                <p className="relative text-white font-bold text-base">{slot.subject_name}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-slate-500">{slot.teacher_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── LISTA DE AULAS ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Aulas Virtuales</h1>
          <p className="page-subtitle">Espacios de comunicación por sección</p>
        </div>
        <div className="flex items-center gap-3">
          {!isStudent && !isPadre && (
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
              {schoolYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' ✓' : ''}</option>)}
            </select>
          )}
          {isAdmin && (
            <>
              <button onClick={handleGenerateClassrooms} disabled={saving}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
                <Zap className="w-4 h-4" /> Generar Aulas
              </button>
              <button onClick={() => setShowNewClass(true)} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Nueva Aula
              </button>
            </>
          )}
        </div>
      </div>

      {visibleClassrooms.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3">
          <Monitor className="w-10 h-10 text-slate-200" />
          {isTeacher
            ? <p className="text-slate-400 text-sm">No tienes aulas asignadas para {schoolYears.find(y => y.id === selectedYear)?.name ?? 'este año'}</p>
            : (isStudent || isPadre)
            ? <p className="text-slate-400 text-sm">Tu aula virtual aún no ha sido creada. Consulta a tu docente.</p>
            : <p className="text-slate-400 text-sm">No hay aulas para {schoolYears.find(y => y.id === selectedYear)?.name ?? 'este año'}</p>}
          {isAdmin && (
            <button onClick={() => setShowNewClass(true)} className="btn-secondary text-sm flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Crear aula
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleClassrooms.map(c => (
            <div key={c.id} onClick={() => handleSelectClassroom(c)}
              className="card overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
              <div className="h-20 flex items-end p-4 relative" style={{ backgroundColor: c.color }}>
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative">
                  <p className="text-white font-bold text-base leading-tight">{c.name}</p>
                  <p className="text-white/75 text-xs mt-0.5">{getSectionLabel(c.section_id)}</p>
                </div>
              </div>
              {c.description && (
                <div className="px-4 py-3">
                  <p className="text-sm text-slate-500 line-clamp-2">{c.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva aula */}
      {showNewClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Nueva Aula Virtual</h3>
              <button onClick={() => setShowNewClass(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre del aula *</label>
                <input value={classForm.name} onChange={e => setClassForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Cuarto Grado · Sección A"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Sección *</label>
                <select value={classForm.section_id} onChange={e => setClassForm(p => ({ ...p, section_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
                  <option value="">Seleccionar...</option>
                  {levels.map(lvl => (
                    <optgroup key={lvl.id} label={lvl.name}>
                      {gradesForLevel(lvl.id).map(g =>
                        sectionsForGrade(g.id).map(sec => (
                          <option key={sec.id} value={sec.id}>{g.name} · Sección {sec.name}</option>
                        ))
                      )}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Descripción (opcional)</label>
                <input value={classForm.description} onChange={e => setClassForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setClassForm(p => ({ ...p, color: c }))}
                      style={{ backgroundColor: c }}
                      className={`w-8 h-8 rounded-full transition-transform ${classForm.color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewClass(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateClassroom} disabled={saving || !classForm.name.trim() || !classForm.section_id}
                className="btn-primary flex-1 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Crear Aula'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
