'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { ClipboardCheck, Save, ChevronRight, Check, X, Clock, AlertCircle } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { apiUrl } from '@/lib/api-url'

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string; activeColor: string }[] = [
  { value: 'present', label: 'Presente', color: 'bg-white text-slate-300 border-slate-200 hover:border-slate-300', activeColor: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { value: 'absent',  label: 'Ausente',  color: 'bg-white text-slate-300 border-slate-200 hover:border-slate-300', activeColor: 'bg-red-50 text-red-600 border-red-200' },
  { value: 'late',    label: 'Tardanza', color: 'bg-white text-slate-300 border-slate-200 hover:border-slate-300', activeColor: 'bg-amber-50 text-amber-600 border-amber-200' },
  { value: 'excused', label: 'Justificación', color: 'bg-white text-slate-300 border-slate-200 hover:border-slate-300', activeColor: 'bg-blue-50 text-blue-600 border-blue-200' },
]

interface Level { id: string; name: string; sort_order: number }
interface Grade { id: string; name: string; code: string; level_id: string }
interface Section { id: string; name: string; grade_id: string; homeroom_teacher_id?: string | null }
interface SchoolYear { id: string; name: string; is_active: boolean }
interface SubjectCatalog { id: string; name: string }
interface Student { id: string; enrollment_number: string; avatar_url?: string | null; profile: { full_name: string } | null }

export default function AsistenciaPage() {
  const { profile } = useAuth()
  const isDocente = profile?.role === 'docente'
  const canEdit = profile?.role && ['master', 'direccion', 'administracion', 'docente'].includes(profile.role)

  const [levels, setLevels]       = useState<Level[]>([])
  const [grades, setGrades]       = useState<Grade[]>([])
  const [sections, setSections]   = useState<Section[]>([])
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [subjects, setSubjects]   = useState<SubjectCatalog[]>([])
  const [students, setStudents]   = useState<Student[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [justifications, setJustifications] = useState<Record<string, string>>({})
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null)
  const [sessionLocked, setSessionLocked] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving]       = useState(false)
  // Para docentes: set de section_ids a los que está asignado
  const [mySecIds, setMySecIds]   = useState<Set<string> | null>(null)
  // Sección homeroom del docente (orientador de grado)
  const [homeroomSectionId, setHomeroomSectionId] = useState<string | null>(null)
  const [homeroomLabel, setHomeroomLabel]         = useState<string>('')

  useEffect(() => {
    if (!profile?.id) return
    const t = setTimeout(() => setLoading(false), 15000)
    loadBase().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [profile?.id])

  const loadBase = async () => {
    setLoading(true)
    const [lvlRes, gradeRes, secRes, syRes, subRes] = await Promise.all([
      supabase.from('levels').select('id, name, sort_order').order('sort_order'),
      supabase.from('grades').select('id, name, level_id, code').order('sort_order'),
      supabase.from('sections').select('id, name, grade_id, homeroom_teacher_id').order('name'),
      supabase.from('school_years').select('id, name, is_active').order('start_date', { ascending: false }),
      supabase.from('subject_catalog').select('id, name').order('name'),
    ])
    setLevels(lvlRes.data ?? [])
    setGrades(gradeRes.data ?? [])
    setSections(secRes.data ?? [])
    setSchoolYears(syRes.data ?? [])
    setSubjects(subRes.data ?? [])
    const syAll = syRes.data ?? []
    const active = syAll.find(y => y.is_active)
    if (active) setSelectedYear(active.id)

    // Para docentes: cargar su sección homeroom y secciones asignadas
    if (profile?.role === 'docente' && active) {
      const { data: me } = await supabase.from('teachers').select('id').eq('user_id', profile.id).single()
      if (me) {
        // Detectar si es orientador de alguna sección
        const allSections = secRes.data ?? []
        const allGrades   = gradeRes.data ?? []
        const homeroom = allSections.find((s: any) => s.homeroom_teacher_id === me.id) ?? null
        if (homeroom) {
          const grade = allGrades.find((g: any) => g.id === homeroom.grade_id)
          setHomeroomSectionId(homeroom.id)
          setHomeroomLabel(`${grade?.name ?? ''} · Sección ${homeroom.name}`)
          setSelectedSection(homeroom.id)
        }

        const { data: ta } = await supabase.from('teacher_assignments')
          .select('section_id').eq('teacher_id', me.id)
          .eq('school_year_id', active.id).neq('is_active', false)
        setMySecIds(new Set((ta ?? []).map((t: any) => t.section_id).filter(Boolean)))
      }
    }
    setLoading(false)
  }

  const loadStudentsAndSession = useCallback(async () => {
    if (!selectedSection || !selectedYear || !selectedDate) return
    setLoadingStudents(true)

    // Traer estudiantes via API route (service-role key bypassa RLS)
    const { data: { session } } = await supabase.auth.getSession()
    let studs: Student[] = []
    if (session?.access_token) {
      const res = await fetch(
        apiUrl(`/api/students-by-section?sectionId=${selectedSection}&schoolYearId=${selectedYear}`),
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (res.ok) {
        const arr = await res.json()
        studs = arr.map((s: any) => ({
          id: s.id, enrollment_number: s.enrollment_number,
          avatar_url: s.avatar_url ?? null,
          profile: { full_name: s.full_name },
        }))
      }
    }
    setStudents(studs)

    // Inicializar todos como presente
    const init: Record<string, AttendanceStatus> = {}
    studs.forEach(s => { init[s.id] = 'present' })

    // Buscar sesión existente
    let q = supabase.from('attendance_sessions')
      .select('id, is_closed')
      .eq('section_id', selectedSection)
      .eq('session_date', selectedDate)
    if (selectedSubject) q = q.eq('subject_catalog_id', selectedSubject)
    else q = q.is('subject_catalog_id', null)

    const { data: attSession } = await q.maybeSingle()

    if (attSession) {
      setExistingSessionId(attSession.id)
      setSessionLocked(attSession.is_closed)
      const { data: records } = await supabase
        .from('attendance_records')
        .select('student_id, status, note')
        .eq('attendance_session_id', attSession.id)
      const initNotes: Record<string, string> = {}
      ;(records ?? []).forEach((r: any) => {
        init[r.student_id] = r.status
        if (r.note) initNotes[r.student_id] = r.note
      })
      setJustifications(initNotes)
    } else {
      setExistingSessionId(null)
      setSessionLocked(false)
      setJustifications({})
    }

    setAttendance(init)
    setLoadingStudents(false)
  }, [selectedSection, selectedYear, selectedDate, selectedSubject])

  useEffect(() => { loadStudentsAndSession() }, [loadStudentsAndSession])

  const handleSave = async () => {
    if (!selectedSection || !selectedYear || students.length === 0) return
    setSaving(true)

    let sessionId = existingSessionId
    if (!sessionId) {
      let teacherId: string | null = null
      if (profile?.role === 'docente') {
        const { data: t } = await supabase.from('teachers').select('id').eq('user_id', profile.id).single()
        teacherId = t?.id ?? null
      }
      const { data: newSess, error } = await supabase.from('attendance_sessions').insert({
        section_id: selectedSection,
        school_year_id: selectedYear,
        session_date: selectedDate,
        subject_catalog_id: selectedSubject || null,
        teacher_id: teacherId,
      }).select('id').single()
      if (error || !newSess) { toast.error('Error al crear sesión'); setSaving(false); return }
      sessionId = newSess.id
      setExistingSessionId(sessionId)
    }

    const upsertData = students.map(s => ({
      attendance_session_id: sessionId!,
      student_id: s.id,
      status: attendance[s.id] ?? 'present',
      note: (attendance[s.id] === 'excused' && justifications[s.id]?.trim())
        ? justifications[s.id].trim()
        : null,
    }))

    const { error } = await supabase.from('attendance_records')
      .upsert(upsertData, { onConflict: 'attendance_session_id,student_id' })

    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Asistencia guardada')
  }

  const markAll = (status: AttendanceStatus) => {
    setAttendance(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => { next[id] = status })
      return next
    })
  }

  const presentCount = Object.values(attendance).filter(v => v === 'present').length
  const absentCount  = Object.values(attendance).filter(v => v === 'absent').length
  const lateCount    = Object.values(attendance).filter(v => v === 'late').length
  const excusedCount = Object.values(attendance).filter(v => v === 'excused').length

  const sectionsForGrade = (gradeId: string) => {
    const all = sections.filter(s => s.grade_id === gradeId)
    return isDocente && mySecIds ? all.filter(s => mySecIds.has(s.id)) : all
  }
  const gradesForLevel = (levelId: string) => {
    const all = grades.filter(g => g.level_id === levelId)
    return isDocente && mySecIds
      ? all.filter(g => sectionsForGrade(g.id).length > 0)
      : all
  }
  const visibleLevels = isDocente && mySecIds
    ? levels.filter(l => gradesForLevel(l.id).length > 0)
    : levels

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Vista simplificada para docente orientador
  if (isDocente && homeroomSectionId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">Asistencia</h1>
            <p className="page-subtitle">{homeroomLabel}</p>
          </div>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Presentes', value: presentCount, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Ausentes',  value: absentCount,  color: 'bg-red-50 text-red-600' },
            { label: 'Tardanzas', value: lateCount,     color: 'bg-amber-50 text-amber-600' },
            { label: 'Justificaciones', value: excusedCount,  color: 'bg-blue-50 text-blue-600' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs opacity-70">{s.label}</p>
            </div>
          ))}
        </div>

        {canEdit && !sessionLocked && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">Todos:</span>
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => markAll(opt.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${opt.activeColor}`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {sessionLocked && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5" /> Esta sesión está cerrada.
          </div>
        )}

        {loadingStudents ? (
          <div className="card flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="card flex items-center justify-center h-40">
            <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta sección</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-50">
              {students.map((student, i) => {
                const status = attendance[student.id] ?? 'present'
                return (
                  <div key={student.id} className="px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                      <StudentAvatar url={student.avatar_url} name={student.profile?.full_name ?? 'E'} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{student.profile?.full_name ?? 'Sin nombre'}</p>
                        <p className="text-xs text-slate-400">{student.enrollment_number}</p>
                      </div>
                      {canEdit && !sessionLocked ? (
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {STATUS_OPTIONS.map(opt => (
                            <button key={opt.value}
                              onClick={() => setAttendance(prev => ({ ...prev, [student.id]: opt.value }))}
                              title={opt.label}
                              className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                status === opt.value ? opt.activeColor : opt.color
                              }`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            STATUS_OPTIONS.find(o => o.value === status)?.activeColor ?? 'bg-slate-100 text-slate-500'
                          }`}>
                            {STATUS_OPTIONS.find(o => o.value === status)?.label}
                          </span>
                          {status === 'excused' && justifications[student.id] && (
                            <p className="text-xs text-blue-500 mt-1 italic">{justifications[student.id]}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {canEdit && !sessionLocked && status === 'excused' && (
                      <div className="mt-2 ml-8">
                        <input
                          type="text"
                          value={justifications[student.id] ?? ''}
                          onChange={e => setJustifications(prev => ({ ...prev, [student.id]: e.target.value }))}
                          placeholder="Motivo de la justificación (ej: enfermedad, cita médica...)"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-blue-200 bg-blue-50 text-blue-800 placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                    )}
                    {!canEdit && status === 'excused' && justifications[student.id] && (
                      <p className="text-xs text-blue-500 ml-8 mt-1 italic">{justifications[student.id]}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {canEdit && !sessionLocked && students.length > 0 && (
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm">
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save className="w-4 h-4" />}
              {existingSessionId ? 'Actualizar' : 'Guardar asistencia'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Asistencia</h1>
          <p className="page-subtitle">Control de asistencia por sección</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
            {schoolYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' ✓' : ''}</option>)}
          </select>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
            <option value="">Sin materia</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Árbol secciones */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Sección</p>
          </div>
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-50">
            {visibleLevels.map(level => (
              <div key={level.id}>
                <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/50">{level.name}</p>
                {gradesForLevel(level.id).map(grade => {
                  const isOpen = expandedGrade === grade.id
                  const gradeSections = sectionsForGrade(grade.id)
                  return (
                    <div key={grade.id}>
                      <button
                        onClick={() => setExpandedGrade(isOpen ? null : grade.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-slate-700">{grade.name}</span>
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                      {isOpen && gradeSections.map(sec => (
                        <button
                          key={sec.id}
                          onClick={() => setSelectedSection(sec.id)}
                          className={`w-full flex items-center gap-2 pl-8 pr-4 py-2 text-sm transition-colors ${
                            selectedSection === sec.id ? 'bg-eos-50 text-eos-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedSection === sec.id ? 'bg-eos-500' : 'bg-slate-300'}`} />
                          Sección {sec.name}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Lista de asistencia */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedSection ? (
            <div className="card flex items-center justify-center h-64">
              <div className="text-center">
                <ClipboardCheck className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Selecciona una sección para tomar asistencia</p>
              </div>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Presentes', value: presentCount, color: 'bg-emerald-50 text-emerald-700' },
                  { label: 'Ausentes', value: absentCount, color: 'bg-red-50 text-red-600' },
                  { label: 'Tardanzas', value: lateCount, color: 'bg-amber-50 text-amber-600' },
                  { label: 'Justificaciones', value: excusedCount, color: 'bg-blue-50 text-blue-600' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Marcar todos */}
              {canEdit && !sessionLocked && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">Todos:</span>
                  {STATUS_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => markAll(opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${opt.activeColor}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {sessionLocked && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5" /> Esta sesión está cerrada.
                </div>
              )}

              {loadingStudents ? (
                <div className="card flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : students.length === 0 ? (
                <div className="card flex items-center justify-center h-40">
                  <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta sección</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="divide-y divide-slate-50">
                    {students.map((student, i) => {
                      const status = attendance[student.id] ?? 'present'
                      return (
                        <div key={student.id} className="px-4 py-3 border-b border-slate-50 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                            <StudentAvatar url={student.avatar_url} name={student.profile?.full_name ?? 'E'} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{student.profile?.full_name ?? 'Sin nombre'}</p>
                              <p className="text-xs text-slate-400">{student.enrollment_number}</p>
                            </div>
                            {canEdit && !sessionLocked ? (
                              <div className="flex items-center gap-1">
                                {STATUS_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    onClick={() => setAttendance(prev => ({ ...prev, [student.id]: opt.value }))}
                                    title={opt.label}
                                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                      status === opt.value ? opt.activeColor : opt.color
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                STATUS_OPTIONS.find(o => o.value === status)?.activeColor ?? 'bg-slate-100 text-slate-500'
                              }`}>
                                {STATUS_OPTIONS.find(o => o.value === status)?.label}
                              </span>
                            )}
                          </div>
                          {canEdit && !sessionLocked && status === 'excused' && (
                            <div className="mt-2 ml-8">
                              <input
                                type="text"
                                value={justifications[student.id] ?? ''}
                                onChange={e => setJustifications(prev => ({ ...prev, [student.id]: e.target.value }))}
                                placeholder="Motivo de la justificación (ej: enfermedad, cita médica...)"
                                className="w-full px-3 py-1.5 text-xs rounded-lg border border-blue-200 bg-blue-50 text-blue-800 placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {canEdit && !sessionLocked && students.length > 0 && (
                <div className="flex justify-end">
                  <button onClick={handleSave} disabled={saving}
                    className="btn-primary flex items-center gap-2 text-sm">
                    {saving
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Save className="w-4 h-4" />}
                    {existingSessionId ? 'Actualizar' : 'Guardar asistencia'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
