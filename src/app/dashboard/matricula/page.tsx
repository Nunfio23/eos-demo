'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Search, UserPlus, Check, X, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'
import { apiUrl } from '@/lib/api-url'

interface SchoolYear { id: string; name: string; is_active: boolean }
interface Grade { id: string; name: string; code: string; level_id: string }
interface Section { id: string; name: string; grade_id: string; capacity: number }
interface Level { id: string; name: string; code: string }
interface Student {
  id: string
  enrollment_number: string
  profile: { full_name: string; email: string } | null
}
interface Enrollment {
  id: string
  student_id: string
  section_id: string
  school_year_id: string
  status: string
  student: { enrollment_number: string; profile: { full_name: string } | null }
}

// ─── Estado inicial del formulario de nuevo estudiante ───────────────────────
const INITIAL_FORM = {
  // I. Datos Personales
  name:        '',
  email:       '',
  nie:         '',
  birthDate:   '',
  gender:      '',
  nationality: '',
  idType:      '',
  address:     '',
  handedness:  '',
  shirtSize:   '',
  pantsSize:   '',
  skirtSize:   '',
  // II. Padres
  fatherName:    '',
  fatherPhone:   '',
  fatherEmail:   '',
  motherName:    '',
  motherPhone:   '',
  motherEmail:   '',
  parentAddress: '',
  // III. Académico + Médico
  previousSchool:    '',
  bloodType:         '',
  allergies:         '',
  medications:       '',
  medicalConditions: '',
  emergencyContact:  '',
  doctorName:        '',
  doctorPhone:       '',
  insuranceProvider: '',
  insuranceNumber:   '',
  healthNotes:       '',
  // IV. Desarrollo + Autorizaciones
  interests:               '',
  specialNeeds:            false,
  specialNeedsDesc:        '',
  professionalSupport:     false,
  extracurricular:         '',
  authExit:                false,
  authPhotos:              false,
  authInternet:            false,
  siblingsInSchool:        false,
  siblingsInfo:            '',
  additionalInfo:          '',
}

type FormState = typeof INITIAL_FORM

export default function MatriculaPage() {
  const { session, role } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (role && !['master', 'direccion'].includes(role)) {
      router.replace('/dashboard/administracion')
    }
  }, [role, router])

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [levels,      setLevels]      = useState<Level[]>([])
  const [grades,      setGrades]      = useState<Grade[]>([])
  const [sections,    setSections]    = useState<Section[]>([])
  const [students,    setStudents]    = useState<Student[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [autoEnrolling, setAutoEnrolling] = useState(false)

  const [selectedYear,    setSelectedYear]    = useState('')
  const [selectedGrade,   setSelectedGrade]   = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [search,          setSearch]          = useState('')

  const [showModal,    setShowModal]    = useState(false)
  const [modalStudent, setModalStudent] = useState('')
  const [modalSection, setModalSection] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [createMode,   setCreateMode]   = useState(false)
  const [step,         setStep]         = useState(1) // 1-4
  const [form,         setForm]         = useState<FormState>(INITIAL_FORM)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))
  const toggle = (field: keyof FormState) => () =>
    setForm(p => ({ ...p, [field]: !p[field] }))

  const loadBase = useCallback(async () => {
    setLoading(true)
    const [syRes, lvlRes, gradeRes, secRes, stuRes] = await Promise.all([
      db.from('school_years').select('*').order('start_date', { ascending: false }),
      db.from('levels').select('*').order('sort_order'),
      supabase.from('grades').select('*').order('sort_order'),
      supabase.from('sections').select('*').order('name'),
      supabase.from('students').select('id, enrollment_number, profile:profiles!students_user_id_fkey(full_name, email)').eq('is_active', true).order('created_at'),
    ])
    const years = (syRes.data ?? []) as SchoolYear[]
    setSchoolYears(years)
    setLevels(lvlRes.data ?? [])
    setGrades(gradeRes.data ?? [])
    setSections(secRes.data ?? [])
    setStudents(stuRes.data as Student[] ?? [])

    const active = years.find(y => y.is_active)
    if (active) setSelectedYear(active.id)
    setLoading(false)
  }, [])

  const loadEnrollments = useCallback(async () => {
    if (!selectedYear) return

    let query = db
      .from('enrollments')
      .select('id, student_id, section_id, school_year_id, status')
      .eq('school_year_id', selectedYear)

    if (selectedSection) query = query.eq('section_id', selectedSection)
    else if (selectedGrade) {
      const sectionIds = sections.filter(s => s.grade_id === selectedGrade).map(s => s.id)
      if (sectionIds.length > 0) query = query.in('section_id', sectionIds)
    }

    const { data: rawEnrollments, error } = await query.order('enrolled_at', { ascending: false })
    if (error || !rawEnrollments?.length) { setEnrollments([]); return }

    const studentIds = rawEnrollments.map((e: any) => e.student_id as string).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    const { data: studentsData } = await db.from('students').select('id, enrollment_number, user_id').in('id', studentIds)

    const userIds = (studentsData ?? []).map((s: any) => s.user_id as string).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    const { data: profilesData } = userIds.length
      ? await db.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] }

    const profileByUserId = new Map((profilesData ?? []).map((p: any) => [p.id, p]))
    const studentById = new Map((studentsData ?? []).map((s: any) => [s.id, {
      ...s,
      profile: profileByUserId.get(s.user_id) ?? null,
    }]))

    const combined = rawEnrollments.map((e: any) => ({ ...e, student: studentById.get(e.student_id) ?? null }))
    setEnrollments(combined as Enrollment[])
  }, [selectedYear, selectedSection, selectedGrade, sections])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadBase().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadBase])
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadEnrollments().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadEnrollments])

  const sectionsForGrade = (gradeId: string) => sections.filter(s => s.grade_id === gradeId)
  const gradesForLevel   = (levelId: string) => grades.filter(g => g.level_id === levelId)

  const enrolledStudentIds = new Set(enrollments.map(e => e.student_id))
  const availableStudents  = students.filter(s =>
    !search || s.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) || s.enrollment_number?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredEnrollments = enrollments.filter(e =>
    !search ||
    (e.student as any)?.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (e.student as any)?.enrollment_number?.toLowerCase().includes(search.toLowerCase())
  )

  const closeModal = () => {
    setShowModal(false)
    setModalStudent('')
    setModalSection('')
    setCreateMode(false)
    setStep(1)
    setForm(INITIAL_FORM)
  }

  const handleEnroll = async () => {
    if (!modalStudent || !modalSection || !selectedYear) return
    setSaving(true)
    const { error } = await db.from('enrollments').insert({
      student_id:     modalStudent,
      section_id:     modalSection,
      school_year_id: selectedYear,
      status:         'active',
    })
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? 'El estudiante ya está matriculado este año' : 'Error al matricular')
      return
    }
    toast.success('Estudiante matriculado')
    closeModal()
    loadEnrollments()
  }

  const handleCreateAndEnroll = async () => {
    if (!form.name.trim() || !form.email.trim() || !modalSection || !selectedYear) {
      toast.error('Nombre, correo, grado y sección son obligatorios')
      return
    }
    setSaving(true)
    if (!session?.access_token) { toast.error('Sesión expirada, recarga la página'); setSaving(false); return }

    const emailLocal  = form.email.trim().toLowerCase().split('@')[0]
    const usernameBase = emailLocal.replace(/[^a-z0-9._-]/g, '').slice(0, 28) || form.name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').slice(0, 28)
    const username    = usernameBase.length >= 3 ? usernameBase : `alumno${Date.now().toString().slice(-5)}`
    const tempPassword = Math.random().toString(36).slice(2, 10)

    // 1. Crear usuario estudiante
    const res = await fetch(apiUrl('/api/create-user'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        username,
        full_name: form.name.trim(),
        role:      'alumno',
        password:  tempPassword,
        nie:       form.nie.trim() || undefined,
        address:   form.address.trim() || undefined,
        date_of_birth:    form.birthDate  || undefined,
        gender:           form.gender     || undefined,
        nationality:      form.nationality.trim() || undefined,
        id_type:          form.idType.trim() || undefined,
        handedness:       form.handedness || undefined,
        shirt_size:       form.shirtSize.trim() || undefined,
        pants_size:       form.pantsSize.trim() || undefined,
        skirt_size:       form.skirtSize.trim() || undefined,
        previous_school:  form.previousSchool.trim() || undefined,
        emergency_contact: form.emergencyContact.trim() || undefined,
        interests:              form.interests.trim() || undefined,
        special_needs:          form.specialNeeds,
        special_needs_description: form.specialNeedsDesc.trim() || undefined,
        professional_support:   form.professionalSupport,
        extracurricular:        form.extracurricular.trim() || undefined,
        auth_exit:              form.authExit,
        auth_photos:            form.authPhotos,
        auth_internet:          form.authInternet,
        siblings_in_school:     form.siblingsInSchool,
        siblings_info:          form.siblingsInfo.trim() || undefined,
        additional_info:        form.additionalInfo.trim() || undefined,
        blood_type:         form.bloodType || undefined,
        // Salud
        health_allergies:          form.allergies.trim() || undefined,
        health_medications:        form.medications.trim() || undefined,
        health_conditions:         form.medicalConditions.trim() || undefined,
        health_doctor_name:        form.doctorName.trim() || undefined,
        health_doctor_phone:       form.doctorPhone.trim() || undefined,
        health_insurance_provider: form.insuranceProvider.trim() || undefined,
        health_insurance_number:   form.insuranceNumber.trim() || undefined,
        health_notes:              form.healthNotes.trim() || undefined,
      }),
    })
    const resData = await res.json()
    if (!res.ok || resData.error) {
      toast.error(resData.error || 'Error al crear estudiante')
      setSaving(false)
      return
    }

    const newUserId = resData.userId

    // 2. Obtener el ID del nuevo estudiante
    const { data: newStudent } = await db.from('students').select('id').eq('user_id', newUserId).single()
    const studentId = (newStudent as any)?.id

    if (!studentId) {
      toast.error('Estudiante creado pero no se pudo matricular automáticamente. Búscalo en la lista.')
      setSaving(false)
      await loadBase()
      closeModal()
      return
    }

    // 3. Crear cuenta del padre si se proporcionó
    const parentErrors: string[] = []
    for (const parent of [
      { name: form.fatherName, phone: form.fatherPhone, email: form.fatherEmail, rel: 'father' },
      { name: form.motherName, phone: form.motherPhone, email: form.motherEmail, rel: 'mother' },
    ]) {
      if (!parent.name.trim()) continue
      const pRes = await fetch(apiUrl('/api/create-parent'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          student_id:   studentId,
          full_name:    parent.name.trim(),
          phone:        parent.phone.trim() || undefined,
          email:        parent.email.trim() || undefined,
          address:      form.parentAddress.trim() || undefined,
          relationship: parent.rel,
        }),
      })
      const pData = await pRes.json()
      if (!pRes.ok || pData.error) {
        parentErrors.push(`${parent.name}: ${pData.error}`)
      }
    }

    // 4. Matricular
    const { error: enrollError } = await db.from('enrollments').insert({
      student_id:     studentId,
      section_id:     modalSection,
      school_year_id: selectedYear,
      status:         'active',
    })

    setSaving(false)
    if (enrollError) {
      toast.error('Estudiante creado, pero error al matricular: ' + enrollError.message)
    } else {
      const successMsg = parentErrors.length
        ? `Estudiante matriculado. Advertencias en padres: ${parentErrors.join('; ')}`
        : 'Estudiante creado y matriculado exitosamente'
      toast.success(successMsg)
    }

    await loadBase()
    closeModal()
    loadEnrollments()
  }

  const handleAutoEnrollar = async () => {
    if (!confirm('¿Matricular automáticamente todos los estudiantes sin matrícula activa según su grado y sección registrados?')) return
    setAutoEnrolling(true)
    try {
      await supabase.auth.refreshSession()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { toast.error('Sesión expirada'); setAutoEnrolling(false); return }
      const res = await fetch(apiUrl('/api/auto-enrollar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok || data.error) { toast.error(data.error ?? 'Error'); setAutoEnrolling(false); return }
      toast.success(`✓ ${data.enrolled} matriculados, ${data.skipped} omitidos`)
      if (data.errors?.length) toast.error(`Problemas: ${data.errors.slice(0, 3).join(', ')}`)
      loadEnrollments()
    } catch { toast.error('Error de conexión') }
    setAutoEnrolling(false)
  }

  const handleWithdraw = async (enrollmentId: string) => {
    if (!confirm('¿Retirar matrícula del estudiante?')) return
    const { error } = await db.from('enrollments').update({ status: 'withdrawn' }).eq('id', enrollmentId)
    if (error) { toast.error('Error'); return }
    toast.success('Matrícula retirada')
    loadEnrollments()
  }

  const statusLabel = (s: string) => ({
    active:    { text: 'Activo',    cls: 'bg-emerald-50 text-emerald-700' },
    withdrawn: { text: 'Retirado', cls: 'bg-red-50 text-red-600' },
    graduated: { text: 'Graduado', cls: 'bg-violet-50 text-violet-700' },
  }[s] ?? { text: s, cls: 'bg-slate-100 text-slate-500' })

  // ─── Validación por paso ──────────────────────────────────────────────────
  const stepValid = (s: number) => {
    if (s === 1) return form.name.trim() !== '' && form.email.trim() !== ''
    if (s === 3) return modalSection !== ''
    return true
  }

  const STEPS = ['Datos del Estudiante', 'Padres / Encargados', 'Académico y Médico', 'Desarrollo y Autorizaciones']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Matrícula</h1>
          <p className="page-subtitle">Gestión de inscripciones por año escolar</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleAutoEnrollar}
            disabled={autoEnrolling}
            className="btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
          >
            <Zap className="w-4 h-4" />
            {autoEnrolling ? 'Matriculando...' : 'Auto-matricular todos'}
          </button>

          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
            <option value="">Año escolar</option>
            {schoolYears.map(y => (
              <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (activo)' : ''}</option>
            ))}
          </select>

          <select value={selectedGrade} onChange={e => { setSelectedGrade(e.target.value); setSelectedSection('') }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
            <option value="">Todos los grados</option>
            {levels.map(lvl => (
              <optgroup key={lvl.id} label={lvl.name}>
                {gradesForLevel(lvl.id).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {selectedGrade && (
            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500">
              <option value="">Todas las secciones</option>
              {sectionsForGrade(selectedGrade).map(s => (
                <option key={s.id} value={s.id}>Sección {s.name}</option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estudiante..."
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 w-48" />
          </div>

          <button onClick={() => setShowModal(true)} disabled={!selectedYear}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            <UserPlus className="w-4 h-4" /> Matricular
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Matriculados', value: enrollments.filter(e => e.status === 'active').length,    color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Retirados',   value: enrollments.filter(e => e.status === 'withdrawn').length, color: 'bg-red-50 text-red-600' },
          { label: 'Total',       value: enrollments.length,                                        color: 'bg-eos-50 text-eos-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm opacity-70">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Estudiante</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Grado / Sección</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
              <th className="w-12 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredEnrollments.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400 text-sm">
                  {selectedYear ? 'No hay matrículas para los filtros seleccionados' : 'Selecciona un año escolar'}
                </td>
              </tr>
            ) : filteredEnrollments.map(e => {
              const st        = statusLabel(e.status)
              const sec       = sections.find(s => s.id === e.section_id)
              const gradeName = grades.find(g => g.id === sec?.grade_id)?.name ?? '—'
              const fullName  = (e.student as any)?.profile?.full_name ?? 'Sin nombre'
              const code      = (e.student as any)?.enrollment_number ?? '—'
              return (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{fullName}</p>
                    <p className="text-xs text-slate-400">{code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{gradeName} · Sección {sec?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>{st.text}</span>
                  </td>
                  <td className="px-4 py-3">
                    {e.status === 'active' && (
                      <button onClick={() => handleWithdraw(e.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Retirar matrícula">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ─── MODAL ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">Matricular Estudiante</h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>

            {/* Tabs modo */}
            <div className="flex border-b border-slate-100 shrink-0">
              <button onClick={() => setCreateMode(false)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!createMode ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                Estudiante existente
              </button>
              <button onClick={() => { setCreateMode(true); setStep(1) }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${createMode ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <UserPlus className="w-3.5 h-3.5" /> Nueva ficha de inscripción
              </button>
            </div>

            {/* ── MODO EXISTENTE ────────────────────────────────────────────── */}
            {!createMode && (
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Estudiante</label>
                  <select value={modalStudent} onChange={e => setModalStudent(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar estudiante...</option>
                    {availableStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.profile?.full_name ?? 'Sin nombre'}{s.enrollment_number ? ` — NIE: ${s.enrollment_number}` : ''}
                        {enrolledStudentIds.has(s.id) ? ' ✓ ya matriculado' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <GradeSection
                  levels={levels} grades={grades} sections={sections}
                  selectedGrade={selectedGrade} setSelectedGrade={g => { setSelectedGrade(g); setModalSection('') }}
                  modalSection={modalSection} setModalSection={setModalSection}
                  gradesForLevel={gradesForLevel} sectionsForGrade={sectionsForGrade}
                />
                <div className="flex gap-3 pt-2">
                  <button onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleEnroll} disabled={saving || !modalStudent || !modalSection}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                    Matricular
                  </button>
                </div>
              </div>
            )}

            {/* ── MODO NUEVA FICHA ──────────────────────────────────────────── */}
            {createMode && (
              <>
                {/* Progress steps */}
                <div className="px-6 pt-4 pb-2 shrink-0">
                  <div className="flex items-center gap-1">
                    {STEPS.map((label, i) => (
                      <div key={i} className="flex items-center flex-1">
                        <div className={`flex items-center gap-1.5 shrink-0`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                            ${i + 1 < step ? 'bg-emerald-500 text-white' : i + 1 === step ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {i + 1 < step ? <Check className="w-3 h-3" /> : i + 1}
                          </div>
                          <span className={`text-xs hidden sm:block ${i + 1 === step ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{label}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i + 1 < step ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step content */}
                <div className="flex-1 overflow-y-auto px-6 pb-2">

                  {/* ── PASO 1: Datos Personales ── */}
                  {step === 1 && (
                    <div className="space-y-4 py-4">
                      <SectionTitle>I. Datos Personales del Estudiante</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Nombre completo" required className="col-span-2">
                          <input className="input" value={form.name} onChange={set('name')} placeholder="Ej: Juan Carlos Pérez" />
                        </Field>
                        <Field label="Correo electrónico" required>
                          <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="alumno@colegio.edu.sv" />
                        </Field>
                        <Field label="NIE (Nº de Identificación)">
                          <input className="input" value={form.nie} onChange={set('nie')} placeholder="Ej: 12345678-1" />
                        </Field>
                        <Field label="Fecha de nacimiento">
                          <input type="date" className="input" value={form.birthDate} onChange={set('birthDate')} />
                        </Field>
                        <Field label="Sexo">
                          <select className="input" value={form.gender} onChange={set('gender')}>
                            <option value="">Seleccionar...</option>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                          </select>
                        </Field>
                        <Field label="Nacionalidad">
                          <input className="input" value={form.nationality} onChange={set('nationality')} placeholder="Ej: Salvadoreña" />
                        </Field>
                        <Field label="Tipo de documento">
                          <select className="input" value={form.idType} onChange={set('idType')}>
                            <option value="">Seleccionar...</option>
                            <option value="Partida de nacimiento">Partida de nacimiento</option>
                            <option value="DUI">DUI</option>
                            <option value="Pasaporte">Pasaporte</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </Field>
                        <Field label="Número de documento">
                          <input className="input" value={form.nie} onChange={set('nie')} placeholder="Nº del documento" />
                        </Field>
                        <Field label="Dirección" className="col-span-2">
                          <input className="input" value={form.address} onChange={set('address')} placeholder="Dirección de residencia" />
                        </Field>
                        <Field label="Lateralidad">
                          <select className="input" value={form.handedness} onChange={set('handedness')}>
                            <option value="">Seleccionar...</option>
                            <option value="diestro">Diestro</option>
                            <option value="zurdo">Zurdo</option>
                          </select>
                        </Field>
                      </div>

                      <SectionTitle className="mt-2">Tallas de uniforme</SectionTitle>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Talla de camisa">
                          <input className="input" value={form.shirtSize} onChange={set('shirtSize')} placeholder="Ej: M, L, 10" />
                        </Field>
                        <Field label="Talla de pantalón">
                          <input className="input" value={form.pantsSize} onChange={set('pantsSize')} placeholder="Ej: 28, S" />
                        </Field>
                        <Field label="Talla de falda">
                          <input className="input" value={form.skirtSize} onChange={set('skirtSize')} placeholder="Ej: 28, S" />
                        </Field>
                      </div>

                      <p className="text-xs text-slate-400">
                        Se creará la cuenta del estudiante con contraseña temporal aleatoria.
                      </p>
                    </div>
                  )}

                  {/* ── PASO 2: Padres ── */}
                  {step === 2 && (
                    <div className="space-y-4 py-4">
                      <SectionTitle>II. Datos de los Padres o Encargados</SectionTitle>
                      <p className="text-xs text-slate-400">Los padres recibirán acceso al sistema automáticamente. Deja vacíos los campos si no aplica.</p>

                      <div className="rounded-xl bg-blue-50 p-4 space-y-3">
                        <p className="text-sm font-semibold text-blue-800">Padre / Tutor</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Nombre completo" className="col-span-2">
                            <input className="input" value={form.fatherName} onChange={set('fatherName')} placeholder="Nombre del padre o tutor" />
                          </Field>
                          <Field label="Teléfono">
                            <input type="tel" className="input" value={form.fatherPhone} onChange={set('fatherPhone')} placeholder="Ej: 7000-0000" />
                          </Field>
                          <Field label="Correo electrónico">
                            <input type="email" className="input" value={form.fatherEmail} onChange={set('fatherEmail')} placeholder="correo@ejemplo.com" />
                          </Field>
                        </div>
                      </div>

                      <div className="rounded-xl bg-pink-50 p-4 space-y-3">
                        <p className="text-sm font-semibold text-pink-800">Madre / Tutora</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Nombre completo" className="col-span-2">
                            <input className="input" value={form.motherName} onChange={set('motherName')} placeholder="Nombre de la madre o tutora" />
                          </Field>
                          <Field label="Teléfono">
                            <input type="tel" className="input" value={form.motherPhone} onChange={set('motherPhone')} placeholder="Ej: 7000-0000" />
                          </Field>
                          <Field label="Correo electrónico">
                            <input type="email" className="input" value={form.motherEmail} onChange={set('motherEmail')} placeholder="correo@ejemplo.com" />
                          </Field>
                        </div>
                      </div>

                      <Field label="Dirección de contacto (si es diferente)">
                        <textarea className="input resize-none" rows={2} value={form.parentAddress} onChange={set('parentAddress')} placeholder="Dirección de los padres" />
                      </Field>
                    </div>
                  )}

                  {/* ── PASO 3: Académico + Médico ── */}
                  {step === 3 && (
                    <div className="space-y-4 py-4">
                      <SectionTitle>III. Información Académica</SectionTitle>
                      <GradeSection
                        levels={levels} grades={grades} sections={sections}
                        selectedGrade={selectedGrade} setSelectedGrade={g => { setSelectedGrade(g); setModalSection('') }}
                        modalSection={modalSection} setModalSection={setModalSection}
                        gradesForLevel={gradesForLevel} sectionsForGrade={sectionsForGrade}
                      />
                      <Field label="Escuela anterior">
                        <input className="input" value={form.previousSchool} onChange={set('previousSchool')} placeholder="Nombre de la escuela anterior" />
                      </Field>

                      <SectionTitle className="mt-2">IV. Información Médica</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tipo de sangre">
                          <select className="input" value={form.bloodType} onChange={set('bloodType')}>
                            <option value="">No especificado</option>
                            {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </Field>
                        <Field label="Contacto de emergencia">
                          <input className="input" value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Nombre y teléfono" />
                        </Field>
                      </div>
                      <Field label="Alergias o condiciones médicas importantes">
                        <textarea className="input resize-none" rows={2} value={form.allergies} onChange={set('allergies')} placeholder="Ej: alergia a la penicilina, asma..." />
                      </Field>
                      <Field label="Condiciones médicas adicionales">
                        <textarea className="input resize-none" rows={2} value={form.medicalConditions} onChange={set('medicalConditions')} placeholder="Ej: diabetes tipo 1..." />
                      </Field>
                      <Field label="Medicamentos actuales">
                        <textarea className="input resize-none" rows={2} value={form.medications} onChange={set('medications')} placeholder="Ej: Salbutamol inhalador..." />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Médico tratante">
                          <input className="input" value={form.doctorName} onChange={set('doctorName')} placeholder="Nombre del médico" />
                        </Field>
                        <Field label="Teléfono del médico">
                          <input type="tel" className="input" value={form.doctorPhone} onChange={set('doctorPhone')} placeholder="Ej: 2200-0000" />
                        </Field>
                        <Field label="Aseguradora">
                          <input className="input" value={form.insuranceProvider} onChange={set('insuranceProvider')} placeholder="Nombre de la aseguradora" />
                        </Field>
                        <Field label="N° de seguro">
                          <input className="input" value={form.insuranceNumber} onChange={set('insuranceNumber')} placeholder="Número de póliza" />
                        </Field>
                      </div>
                      <Field label="Notas adicionales de salud">
                        <textarea className="input resize-none" rows={2} value={form.healthNotes} onChange={set('healthNotes')} placeholder="Observaciones médicas adicionales..." />
                      </Field>
                    </div>
                  )}

                  {/* ── PASO 4: Desarrollo + Autorizaciones ── */}
                  {step === 4 && (
                    <div className="space-y-4 py-4">
                      <SectionTitle>V. Comportamiento y Desarrollo</SectionTitle>
                      <Field label="Intereses y habilidades (deportes, arte, etc.)">
                        <textarea className="input resize-none" rows={2} value={form.interests} onChange={set('interests')} placeholder="Ej: fútbol, dibujo, música..." />
                      </Field>

                      <CheckRow
                        checked={form.specialNeeds} onToggle={toggle('specialNeeds')}
                        label="El estudiante tiene necesidades especiales"
                      />
                      {form.specialNeeds && (
                        <Field label="Descripción de las necesidades especiales">
                          <textarea className="input resize-none" rows={2} value={form.specialNeedsDesc} onChange={set('specialNeedsDesc')} placeholder="Describa las necesidades..." />
                        </Field>
                      )}
                      {form.specialNeeds && (
                        <CheckRow
                          checked={form.professionalSupport} onToggle={toggle('professionalSupport')}
                          label="El estudiante está siendo acompañado por un profesional o institución"
                        />
                      )}
                      <Field label="Actividades extracurriculares que realiza">
                        <input className="input" value={form.extracurricular} onChange={set('extracurricular')} placeholder="Ej: clases de natación, academia de música..." />
                      </Field>

                      <SectionTitle className="mt-2">VI. Autorizaciones</SectionTitle>
                      <div className="space-y-2">
                        <CheckRow
                          checked={form.authExit} onToggle={toggle('authExit')}
                          label="Autorizo la salida de mi hijo(a) fuera del horario escolar con previa autorización"
                        />
                        <CheckRow
                          checked={form.authPhotos} onToggle={toggle('authPhotos')}
                          label="Autorizo la toma de fotografías o videos de mi hijo(a) para actividades escolares"
                        />
                        <CheckRow
                          checked={form.authInternet} onToggle={toggle('authInternet')}
                          label="Autorizo el uso de internet y equipos escolares para el aprendizaje de mi hijo(a)"
                        />
                      </div>

                      <SectionTitle className="mt-2">VII. Otros Datos de Interés</SectionTitle>
                      <CheckRow
                        checked={form.siblingsInSchool} onToggle={toggle('siblingsInSchool')}
                        label="¿Tiene hermanos en la institución?"
                      />
                      {form.siblingsInSchool && (
                        <Field label="Nombre(s) del hermano(s) y grado(s)">
                          <textarea className="input resize-none" rows={2} value={form.siblingsInfo} onChange={set('siblingsInfo')} placeholder="Ej: María Pérez — 5° grado..." />
                        </Field>
                      )}
                      <Field label="Información adicional sobre el estudiante">
                        <textarea className="input resize-none" rows={2} value={form.additionalInfo} onChange={set('additionalInfo')} placeholder="Cualquier información relevante..." />
                      </Field>
                    </div>
                  )}
                </div>

                {/* Footer navigation */}
                <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                  <button onClick={closeModal} className="btn-secondary text-sm">Cancelar</button>
                  <div className="flex-1" />
                  {step > 1 && (
                    <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-1 text-sm">
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>
                  )}
                  {step < 4 ? (
                    <button
                      onClick={() => setStep(s => s + 1)}
                      disabled={!stepValid(step)}
                      className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"
                    >
                      Siguiente <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleCreateAndEnroll}
                      disabled={saving || !form.name.trim() || !form.email.trim() || !modalSection}
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      {saving
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <UserPlus className="w-4 h-4" />}
                      Crear y matricular
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1 ${className}`}>
      {children}
    </p>
  )
}

function Field({ label, required, className = '', children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle}
      className="flex items-start gap-2.5 w-full text-left group py-1">
      <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors
        ${checked ? 'bg-blue-500 border-blue-500' : 'border-slate-300 group-hover:border-blue-400'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  )
}

function GradeSection({
  levels, grades, sections, selectedGrade, setSelectedGrade, modalSection, setModalSection, gradesForLevel, sectionsForGrade,
}: {
  levels: Level[]; grades: Grade[]; sections: Section[]
  selectedGrade: string; setSelectedGrade: (g: string) => void
  modalSection: string; setModalSection: (s: string) => void
  gradesForLevel: (id: string) => Grade[]; sectionsForGrade: (id: string) => Section[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Grado" required>
        <select value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar grado...</option>
          {levels.map(lvl => (
            <optgroup key={lvl.id} label={lvl.name}>
              {gradesForLevel(lvl.id).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {selectedGrade && (
        <Field label="Sección" required>
          <select value={modalSection} onChange={e => setModalSection(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleccionar sección...</option>
            {sectionsForGrade(selectedGrade).map(s => (
              <option key={s.id} value={s.id}>Sección {s.name} (cap. {s.capacity})</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )
}
