'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { usePermissions } from '@/lib/permissions'
import toast from 'react-hot-toast'
import {
  Folder, Search, User, Heart, FileText, AlertTriangle,
  Plus, X, CheckCircle, ChevronRight, Edit2, Shield,
  BookOpen, Award, AlertCircle, Users
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

interface StudentRow {
  id: string
  user_id: string
  enrollment_number: string
  grade_level: string
  section: string
  date_of_birth: string | null
  blood_type?: string
  emergency_contact?: string
  gender?: string
  nationality?: string
  id_type?: string
  handedness?: string
  shirt_size?: string
  pants_size?: string
  skirt_size?: string
  previous_school?: string
  interests?: string
  special_needs?: boolean
  special_needs_description?: string
  professional_support?: boolean
  extracurricular?: string
  auth_exit?: boolean
  auth_photos?: boolean
  auth_internet?: boolean
  siblings_in_school?: boolean
  siblings_info?: string
  additional_info?: string
  is_active: boolean
  profile?: { full_name: string; email: string; phone?: string; address?: string } | null
}

interface StudentHealth {
  id?: string
  student_id: string
  blood_type?: string
  allergies?: string
  medical_conditions?: string
  medications?: string
  doctor_name?: string
  doctor_phone?: string
  insurance_provider?: string
  insurance_number?: string
  notes?: string
}

interface Disciplinary {
  id: string
  date: string
  type: 'warning' | 'suspension' | 'commendation' | 'note'
  description: string
  resolved: boolean
  resolution?: string
  reporter?: { full_name: string }
}

interface ParentRow {
  id: string
  parent_id: string
  relationship: string
  profile?: { full_name: string; email: string; phone?: string; address?: string } | null
}

const DISC_CONFIG = {
  warning:      { label: 'Advertencia',    color: 'bg-amber-100 text-amber-700',    icon: AlertTriangle },
  suspension:   { label: 'Suspensión',     color: 'bg-red-100 text-red-700',        icon: AlertCircle },
  commendation: { label: 'Reconocimiento', color: 'bg-emerald-100 text-emerald-700', icon: Award },
  note:         { label: 'Nota',           color: 'bg-blue-100 text-blue-700',      icon: FileText },
}

const BLOOD_TYPES = ['A+','A-','B+','B-','O+','O-','AB+','AB-']

const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino', otro: 'Otro' }
const REL_LABEL: Record<string, string>    = { father: 'Padre', mother: 'Madre', parent: 'Padre/Madre', guardian: 'Tutor(a)' }

export default function ExpedientePage() {
  const { profile } = useAuth()
  const perms = usePermissions()

  const [students,    setStudents]    = useState<StudentRow[]>([])
  const [selected,    setSelected]    = useState<StudentRow | null>(null)
  const [search,      setSearch]      = useState('')
  const [tab,         setTab]         = useState<'general' | 'salud' | 'disciplinario'>('general')
  const [health,      setHealth]      = useState<StudentHealth | null>(null)
  const [parents,     setParents]     = useState<ParentRow[]>([])
  const [disciplinary, setDisciplinary] = useState<Disciplinary[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editingHealth, setEditingHealth] = useState(false)
  const [healthForm,  setHealthForm]  = useState<Partial<StudentHealth>>({})
  const [showDiscModal, setShowDiscModal] = useState(false)
  const [discForm,    setDiscForm]    = useState({
    type: 'warning' as Disciplinary['type'],
    description: '', date: new Date().toISOString().split('T')[0], resolution: '',
  })
  const [saving, setSaving] = useState(false)

  const canEdit  = perms.canEdit('expediente')
  const isAdmin  = perms.isAdmin
  const isAlumno = perms.isAlumno
  const isPadre  = perms.role === 'padre'

  const loadStudents = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const db = supabase as any

    let q = db
      .from('students')
      .select(`id, user_id, enrollment_number, grade_level, section, date_of_birth, is_active,
        blood_type, emergency_contact, gender, nationality, id_type, handedness,
        shirt_size, pants_size, skirt_size, previous_school, interests,
        special_needs, special_needs_description, professional_support, extracurricular,
        auth_exit, auth_photos, auth_internet, siblings_in_school, siblings_info, additional_info`)
      .eq('is_active', true)
      .order('grade_level')

    if (isAlumno) q = q.eq('user_id', profile.id)

    const { data: studentData } = await q
    const rows: any[] = studentData ?? []

    const userIds = rows.map((s: any) => s.user_id).filter(Boolean)
    const profileMap = new Map<string, any>()
    if (userIds.length > 0) {
      const { data: profileData } = await db
        .from('profiles').select('id, full_name, email, phone, address').in('id', userIds)
      for (const p of (profileData ?? [])) profileMap.set(p.id, p)
    }

    const enriched: StudentRow[] = rows.map((s: any) => ({ ...s, profile: profileMap.get(s.user_id) ?? null }))
    setStudents(enriched)

    if ((isAlumno || isPadre) && enriched.length > 0) setSelected(enriched[0])
    setLoading(false)
  }, [profile, isAlumno, isPadre])

  const loadStudentData = useCallback(async (studentId: string) => {
    const db = supabase as any
    const [{ data: healthData }, { data: discData }, { data: parentsData }] = await Promise.all([
      supabase.from('student_health').select('*').eq('student_id', studentId).maybeSingle(),
      supabase.from('student_disciplinary')
        .select('*, reporter:profiles!student_disciplinary_reported_by_fkey(full_name)')
        .eq('student_id', studentId).order('date', { ascending: false }),
      db.from('student_parents').select('id, parent_id, relationship').eq('student_id', studentId),
    ])
    setHealth(healthData as StudentHealth | null)
    setDisciplinary((discData ?? []) as Disciplinary[])

    // Load parent profiles
    const parentRows: any[] = parentsData ?? []
    const parentUserIds = parentRows.map((p: any) => p.parent_id).filter(Boolean)
    let parentProfiles: any[] = []
    if (parentUserIds.length > 0) {
      const { data: pp } = await db.from('profiles').select('id, full_name, email, phone, address').in('id', parentUserIds)
      parentProfiles = pp ?? []
    }
    const ppMap = new Map(parentProfiles.map((p: any) => [p.id, p]))
    setParents(parentRows.map((p: any) => ({ ...p, profile: ppMap.get(p.parent_id) ?? null })))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadStudents().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadStudents])
  useEffect(() => {
    if (selected) loadStudentData(selected.id)
  }, [selected, loadStudentData])

  const handleSaveHealth = async () => {
    if (!selected) return
    setSaving(true)
    const payload = { ...healthForm, student_id: selected.id }
    let error
    if (!health?.id) {
      ({ error } = await supabase.from('student_health').insert(payload))
    } else {
      ({ error } = await supabase.from('student_health').update(payload).eq('id', health.id))
    }
    setSaving(false)
    if (error) { toast.error('Error al guardar datos de salud'); return }
    toast.success('Datos de salud actualizados')
    setEditingHealth(false)
    loadStudentData(selected.id)
  }

  const handleSaveDisc = async () => {
    if (!selected || !discForm.description.trim()) { toast.error('La descripción es obligatoria'); return }
    setSaving(true)
    const { error } = await supabase.from('student_disciplinary').insert({
      student_id:  selected.id,
      type:        discForm.type,
      description: discForm.description.trim(),
      date:        discForm.date,
      reported_by: profile!.id,
    })
    setSaving(false)
    if (error) { toast.error('Error al guardar registro'); return }
    toast.success('Registro disciplinario agregado')
    setShowDiscModal(false)
    setDiscForm({ type: 'warning', description: '', date: new Date().toISOString().split('T')[0], resolution: '' })
    loadStudentData(selected.id)
  }

  const handleResolve = async (id: string) => {
    const { error } = await supabase.from('student_disciplinary').update({ resolved: true }).eq('id', id)
    if (error) { toast.error('Error'); return }
    toast.success('Marcado como resuelto')
    if (selected) loadStudentData(selected.id)
  }

  const startEditHealth = () => {
    setHealthForm({
      blood_type:         health?.blood_type ?? '',
      allergies:          health?.allergies ?? '',
      medical_conditions: health?.medical_conditions ?? '',
      medications:        health?.medications ?? '',
      doctor_name:        health?.doctor_name ?? '',
      doctor_phone:       health?.doctor_phone ?? '',
      insurance_provider: health?.insurance_provider ?? '',
      insurance_number:   health?.insurance_number ?? '',
      notes:              health?.notes ?? '',
    })
    setEditingHealth(true)
  }

  const filtered = students.filter(s =>
    (s.profile?.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.enrollment_number ?? '').includes(search) ||
    (s.grade_level ?? '').includes(search)
  )

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
          <Folder className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="page-title">Expediente Estudiantil</h1>
          <p className="page-subtitle">Historial completo del estudiante</p>
        </div>
      </div>

      <div className="flex gap-6 min-h-[600px]">
        {/* Lista de estudiantes */}
        {!isAlumno && (
          <div className="w-72 shrink-0 card flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input className="input pl-9 text-sm" placeholder="Buscar estudiante..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="py-8 text-center text-slate-400 text-sm">Cargando...</div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">Sin resultados</div>
              ) : filtered.map(s => (
                <button key={s.id}
                  onClick={() => { setSelected(s); setTab('general') }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors
                    ${selected?.id === s.id ? 'bg-teal-50 border-r-2 border-teal-500' : ''}`}>
                  <div>
                    <p className={`text-sm font-medium ${selected?.id === s.id ? 'text-teal-900' : 'text-slate-800'}`}>
                      {s.profile?.full_name ?? 'Sin nombre'}
                    </p>
                    <p className="text-xs text-slate-400">#{s.enrollment_number} · {s.grade_level}{s.section}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${selected?.id === s.id ? 'text-teal-500' : 'text-slate-300'}`} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Panel de detalle */}
        <div className="flex-1 card flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Selecciona un estudiante para ver su expediente</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header del estudiante */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg shrink-0">
                  {(selected.profile?.full_name ?? 'E')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 text-lg truncate">{selected.profile?.full_name}</h2>
                  <p className="text-sm text-slate-400 truncate">
                    #{selected.enrollment_number} · {selected.grade_level} "{selected.section}" · {selected.profile?.email}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6 gap-0">
                {([
                  { key: 'general',       label: 'Información General', icon: User },
                  { key: 'salud',         label: 'Salud',               icon: Heart },
                  { key: 'disciplinario', label: 'Disciplinario',        icon: Shield },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                      ${tab === key ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">

                {/* ── INFORMACIÓN GENERAL ── */}
                {tab === 'general' && (
                  <div className="space-y-6">

                    {/* Datos básicos */}
                    <Section title="Datos Personales">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoBlock label="Nombre completo"      value={selected.profile?.full_name} />
                        <InfoBlock label="Correo electrónico"   value={selected.profile?.email} />
                        <InfoBlock label="N° de matrícula"      value={selected.enrollment_number} />
                        <InfoBlock label="Grado / Sección"      value={`${selected.grade_level} "${selected.section}"`} />
                        <InfoBlock label="Fecha de nacimiento"
                          value={selected.date_of_birth
                            ? new Date(selected.date_of_birth + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
                            : undefined} />
                        <InfoBlock label="Sexo"       value={selected.gender ? GENDER_LABEL[selected.gender] ?? selected.gender : undefined} />
                        <InfoBlock label="Nacionalidad"  value={selected.nationality} />
                        <InfoBlock label="Tipo de documento" value={selected.id_type} />
                        <InfoBlock label="Número de matrícula / NIE" value={selected.enrollment_number} />
                        <InfoBlock label="Lateralidad"   value={selected.handedness ? (selected.handedness === 'diestro' ? 'Diestro' : 'Zurdo') : undefined} />
                        <InfoBlock label="Dirección"     value={selected.profile?.address} className="md:col-span-2" />
                      </div>
                    </Section>

                    {/* Tallas */}
                    {(selected.shirt_size || selected.pants_size || selected.skirt_size) && (
                      <Section title="Tallas de Uniforme">
                        <div className="grid grid-cols-3 gap-4">
                          <InfoBlock label="Talla de camisa"   value={selected.shirt_size} />
                          <InfoBlock label="Talla de pantalón" value={selected.pants_size} />
                          <InfoBlock label="Talla de falda"    value={selected.skirt_size} />
                        </div>
                      </Section>
                    )}

                    {/* Padres */}
                    <Section title="Padres / Encargados">
                      {parents.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No hay padres vinculados</p>
                      ) : (
                        <div className="space-y-3">
                          {parents.map(p => (
                            <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                                {(p.profile?.full_name ?? 'P')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800">{p.profile?.full_name ?? '—'}</p>
                                <p className="text-xs text-slate-400">{REL_LABEL[p.relationship] ?? p.relationship}</p>
                                {p.profile?.email   && <p className="text-xs text-slate-500">{p.profile.email}</p>}
                                {p.profile?.phone   && <p className="text-xs text-slate-500">{p.profile.phone}</p>}
                                {p.profile?.address && <p className="text-xs text-slate-400">{p.profile.address}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    {/* Académico */}
                    <Section title="Información Académica">
                      <div className="grid grid-cols-2 gap-4">
                        <InfoBlock label="Escuela anterior" value={selected.previous_school} />
                      </div>
                    </Section>

                    {/* Contacto de emergencia */}
                    {selected.emergency_contact && (
                      <Section title="Contacto de Emergencia">
                        <InfoBlock label="Contacto de emergencia" value={selected.emergency_contact} />
                      </Section>
                    )}

                    {/* Desarrollo */}
                    {(selected.interests || selected.special_needs || selected.extracurricular) && (
                      <Section title="Comportamiento y Desarrollo">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoBlock label="Intereses y habilidades"      value={selected.interests} />
                          <InfoBlock label="Actividades extracurriculares" value={selected.extracurricular} />
                          <InfoBlock label="Necesidades especiales"
                            value={selected.special_needs === true ? 'Sí' : selected.special_needs === false ? 'No' : undefined} />
                          {selected.special_needs && (
                            <InfoBlock label="Descripción de necesidades" value={selected.special_needs_description} />
                          )}
                          {selected.special_needs && (
                            <InfoBlock label="Acompañamiento profesional"
                              value={selected.professional_support === true ? 'Sí' : 'No'} />
                          )}
                        </div>
                      </Section>
                    )}

                    {/* Autorizaciones */}
                    <Section title="Autorizaciones">
                      <div className="space-y-1.5">
                        <AuthRow label="Salida fuera del horario escolar" value={selected.auth_exit} />
                        <AuthRow label="Fotografías o videos para actividades escolares" value={selected.auth_photos} />
                        <AuthRow label="Uso de internet y equipos escolares" value={selected.auth_internet} />
                      </div>
                    </Section>

                    {/* Otros */}
                    {(selected.siblings_in_school || selected.additional_info) && (
                      <Section title="Otros Datos">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selected.siblings_in_school !== undefined && (
                            <InfoBlock label="Hermanos en la institución"
                              value={selected.siblings_in_school ? 'Sí' : 'No'} />
                          )}
                          {selected.siblings_in_school && (
                            <InfoBlock label="Nombre y grado de hermanos" value={selected.siblings_info} className="md:col-span-2" />
                          )}
                          <InfoBlock label="Información adicional" value={selected.additional_info} className="md:col-span-2" />
                        </div>
                      </Section>
                    )}
                  </div>
                )}

                {/* ── SALUD ── */}
                {tab === 'salud' && (
                  <div className="space-y-5">
                    {!editingHealth ? (
                      <>
                        {canEdit && (
                          <div className="flex justify-end">
                            <button onClick={startEditHealth} className="btn-secondary text-sm flex items-center gap-1.5">
                              <Edit2 className="w-4 h-4" /> Editar datos de salud
                            </button>
                          </div>
                        )}
                        {!health ? (
                          <div className="text-center py-10 text-slate-400 text-sm">
                            No hay datos de salud registrados
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InfoBlock label="Tipo de sangre"     value={health.blood_type} />
                            <InfoBlock label="Médico tratante"    value={health.doctor_name} />
                            <InfoBlock label="Teléfono médico"    value={health.doctor_phone} />
                            <InfoBlock label="Aseguradora"        value={health.insurance_provider} />
                            <InfoBlock label="N° de seguro"       value={health.insurance_number} />
                            <InfoBlock label="Alergias"           value={health.allergies} className="md:col-span-2" />
                            <InfoBlock label="Condiciones médicas" value={health.medical_conditions} className="md:col-span-2" />
                            <InfoBlock label="Medicamentos"       value={health.medications} className="md:col-span-2" />
                            <InfoBlock label="Notas adicionales"  value={health.notes} className="md:col-span-2" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="label">Tipo de sangre</label>
                            <select className="input" value={healthForm.blood_type ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, blood_type: e.target.value }))}>
                              <option value="">No especificado</option>
                              {BLOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label">Médico tratante</label>
                            <input className="input" value={healthForm.doctor_name ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, doctor_name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label">Teléfono médico</label>
                            <input className="input" value={healthForm.doctor_phone ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, doctor_phone: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label">Aseguradora</label>
                            <input className="input" value={healthForm.insurance_provider ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, insurance_provider: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label">N° de seguro</label>
                            <input className="input" value={healthForm.insurance_number ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, insurance_number: e.target.value }))} />
                          </div>
                        </div>
                        {(['allergies', 'medical_conditions', 'medications', 'notes'] as const).map(field => (
                          <div key={field}>
                            <label className="label">
                              {field === 'allergies' ? 'Alergias'
                                : field === 'medical_conditions' ? 'Condiciones médicas'
                                : field === 'medications' ? 'Medicamentos'
                                : 'Notas adicionales'}
                            </label>
                            <textarea className="input resize-none" rows={2}
                              value={healthForm[field] ?? ''}
                              onChange={e => setHealthForm(p => ({ ...p, [field]: e.target.value }))} />
                          </div>
                        ))}
                        <div className="flex justify-end gap-3">
                          <button onClick={() => setEditingHealth(false)} className="btn-secondary">Cancelar</button>
                          <button onClick={handleSaveHealth} disabled={saving} className="btn-primary">
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── DISCIPLINARIO ── */}
                {tab === 'disciplinario' && (
                  <div className="space-y-4">
                    {canEdit && (
                      <div className="flex justify-end">
                        <button onClick={() => setShowDiscModal(true)} className="btn-primary text-sm flex items-center gap-1.5">
                          <Plus className="w-4 h-4" /> Nuevo Registro
                        </button>
                      </div>
                    )}
                    {disciplinary.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-sm">Sin registros disciplinarios</div>
                    ) : (
                      <div className="space-y-3">
                        {disciplinary.map(d => {
                          const cfg  = DISC_CONFIG[d.type]
                          const Icon = cfg.icon
                          return (
                            <div key={d.id} className={`rounded-xl border p-4 ${cfg.color} border-current/10`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="font-semibold text-sm">{cfg.label}</span>
                                      <span className="text-xs opacity-60">
                                        {new Date(d.date + 'T12:00:00').toLocaleDateString('es-CR')}
                                      </span>
                                      {d.resolved && (
                                        <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                                          <CheckCircle className="w-3 h-3" /> Resuelto
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm opacity-90">{d.description}</p>
                                    {d.reporter?.full_name && <p className="text-xs opacity-60 mt-1">Por: {d.reporter.full_name}</p>}
                                    {d.resolution && <p className="text-xs mt-1 italic opacity-70">Resolución: {d.resolution}</p>}
                                  </div>
                                </div>
                                {canEdit && !d.resolved && (
                                  <button onClick={() => handleResolve(d.id)}
                                    className="shrink-0 text-xs px-2.5 py-1 bg-white/60 hover:bg-white rounded-lg font-medium transition-colors">
                                    Resolver
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal disciplinario */}
      {showDiscModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Nuevo Registro Disciplinario</h2>
              <button onClick={() => setShowDiscModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(DISC_CONFIG) as [Disciplinary['type'], typeof DISC_CONFIG[keyof typeof DISC_CONFIG]][]).map(([type, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <button key={type} onClick={() => setDiscForm(p => ({ ...p, type }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-colors
                        ${discForm.type === type ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
              <div>
                <label className="label">Fecha</label>
                <input type="date" className="input" value={discForm.date}
                  onChange={e => setDiscForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción *</label>
                <textarea className="input resize-none min-h-[90px]" value={discForm.description}
                  onChange={e => setDiscForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Describe el incidente o logro..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowDiscModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveDisc} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">{title}</p>
      {children}
    </div>
  )
}

function InfoBlock({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-sm ${value ? 'text-slate-800' : 'text-slate-300 italic'}`}>
        {value ?? 'No registrado'}
      </p>
    </div>
  )
}

function AuthRow({ label, value }: { label: string; value?: boolean | null }) {
  const isGranted = value === true
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isGranted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 bg-white'}`}>
        {isGranted && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={`text-sm ${isGranted ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
      {value === null || value === undefined
        ? <span className="text-xs text-slate-300 italic ml-auto">No especificado</span>
        : null}
    </div>
  )
}
