'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import PhotoUpload from '@/components/ui/PhotoUpload'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  Users, Plus, Search, Pencil, X, Check, Shield,
  Phone, Mail, Calendar, Hash, Banknote, FileText,
  UserX, UserCheck, ChevronDown, Building2, AlertTriangle, Link2, Unlink,
  ClipboardList, Save, Download, CheckSquare, Square, Printer, FileDown, Sheet,
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

// ─── Constantes ──────────────────────────────────────────────────────────────

const STAFF_TYPES = [
  { value: 'docente',        label: 'Docente',         color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'director',       label: 'Director/a',      color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'sub_director',   label: 'Sub-Director/a',  color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'administracion', label: 'Administración',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'recepcionista',  label: 'Recepcionista',   color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'asistente',      label: 'Asistente',       color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'mantenimiento',  label: 'Mantenimiento',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'limpieza',       label: 'Limpieza',        color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'tienda',         label: 'Tienda Chalet',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'vigilancia',     label: 'Vigilancia',      color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'otro',           label: 'Otro',            color: 'bg-slate-100 text-slate-600 border-slate-200' },
]

const CONTRACT_LABELS: Record<string, string> = {
  tiempo_completo: 'Tiempo completo',
  medio_tiempo:    'Medio tiempo',
  eventual:        'Eventual',
  contrato:        'Por contrato',
}

const TABS = [
  { key: 'todos',           label: 'Todos',          types: null },
  { key: 'docentes',        label: 'Docentes',        types: ['docente'] },
  { key: 'directivos',      label: 'Directivos',      types: ['director', 'sub_director'] },
  { key: 'administrativos', label: 'Administrativos', types: ['administracion', 'recepcionista', 'asistente'] },
  { key: 'soporte',         label: 'Soporte',         types: ['mantenimiento', 'limpieza', 'vigilancia'] },
  { key: 'tienda',          label: 'Tienda',          types: ['tienda'] },
]

const EXPORT_FIELDS = [
  { key: 'full_name',               label: 'Nombre Completo',        default: true  },
  { key: 'staff_type',              label: 'Tipo de Personal',        default: true  },
  { key: 'employee_number',         label: 'N° Empleado',             default: true  },
  { key: 'position',                label: 'Cargo',                   default: true  },
  { key: 'department',              label: 'Departamento',            default: false },
  { key: 'contract_type',           label: 'Tipo de Contrato',        default: false },
  { key: 'national_id',             label: 'DUI',                     default: true  },
  { key: 'birth_date',              label: 'Fecha de Nacimiento',     default: false },
  { key: 'gender',                  label: 'Género',                  default: false },
  { key: 'nationality',             label: 'Nacionalidad',            default: false },
  { key: 'email',                   label: 'Email',                   default: true  },
  { key: 'phone',                   label: 'Teléfono',                default: true  },
  { key: 'address',                 label: 'Dirección',               default: false },
  { key: 'emergency_contact_name',  label: 'Contacto de Emergencia',  default: false },
  { key: 'emergency_contact_phone', label: 'Tel. Emergencia',         default: false },
  { key: 'isss_number',             label: 'N° ISSS',                 default: false },
  { key: 'afp_number',              label: 'N° AFP',                  default: false },
  { key: 'afp_provider',            label: 'Proveedor AFP',           default: false },
  { key: 'nip',                     label: 'NIP',                     default: false },
  { key: 'hire_date',               label: 'Fecha de Contratación',   default: true  },
  { key: 'end_date',                label: 'Fecha de Baja',           default: false },
  { key: 'salary',                  label: 'Salario',                 default: false },
  { key: 'is_active',               label: 'Estado',                  default: true  },
  { key: 'photo_url',               label: 'URL Foto',                default: true  },
  { key: 'notes',                   label: 'Notas',                   default: false },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string
  full_name: string
  national_id: string | null
  birth_date: string | null
  gender: string | null
  nationality: string | null
  photo_url: string | null
  email: string | null
  phone: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  staff_type: string
  employee_number: string | null
  position: string | null
  department: string | null
  hire_date: string | null
  end_date: string | null
  contract_type: string | null
  salary: number | null
  isss_number: string | null
  afp_number: string | null
  afp_provider: string | null
  nip: string | null
  is_active: boolean
  notes: string | null
  user_id: string | null
  created_at: string
}

type FormData = {
  full_name: string
  national_id: string
  birth_date: string
  gender: string
  nationality: string
  photo_url: string
  email: string
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  staff_type: string
  employee_number: string
  // Cuenta de acceso (solo al crear)
  create_user: boolean
  username: string
  password: string
  position: string
  department: string
  hire_date: string
  end_date: string
  contract_type: string
  salary: string
  isss_number: string
  afp_number: string
  afp_provider: string
  nip: string
  is_active: boolean
  notes: string
}

const emptyForm: FormData = {
  full_name: '', national_id: '', birth_date: '', gender: '',
  nationality: 'Salvadoreña', photo_url: '', email: '', phone: '',
  address: '', emergency_contact_name: '', emergency_contact_phone: '',
  staff_type: 'docente', employee_number: '', position: '', department: '',
  hire_date: '', end_date: '', contract_type: 'tiempo_completo', salary: '',
  isss_number: '', afp_number: '', afp_provider: '', nip: '', is_active: true, notes: '',
  create_user: false, username: '', password: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTypeInfo = (value: string) =>
  STAFF_TYPES.find(t => t.value === value) ?? STAFF_TYPES[STAFF_TYPES.length - 1]

const getInitials = (name: string) =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-SV') : '—'

const fmtSalary = (s: number | null) =>
  s ? `$${s.toLocaleString('es-SV', { minimumFractionDigits: 2 })}` : '—'

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function EquipoPage() {
  const { profile } = useAuth()

  // Guard: master, direccion, administracion, contabilidad
  const ALLOWED_ROLES = ['master', 'direccion', 'administracion', 'contabilidad']
  if (profile && !ALLOWED_ROLES.includes(profile.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Shield className="w-10 h-10" />
        <p className="text-sm">Acceso restringido</p>
      </div>
    )
  }
  const canManageStaff = ['master', 'direccion', 'administracion'].includes(profile?.role ?? '')
  const canDelete       = profile?.role === 'master'
  const canSeeSalary    = ['master', 'contabilidad'].includes(profile?.role ?? '')

  const [staff, setStaff]           = useState<StaffMember[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [activeTab, setActiveTab]   = useState('todos')
  const [showModal, setShowModal]   = useState(false)
  const [selected, setSelected]     = useState<StaffMember | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState<FormData>(emptyForm)
  const [viewDetail, setViewDetail] = useState<StaffMember | null>(null)
  const [showLinkModal, setShowLinkModal]     = useState(false)
  const [linkTarget, setLinkTarget]           = useState<StaffMember | null>(null)
  const [linkProfiles, setLinkProfiles]       = useState<{id:string,email:string,full_name:string,role:string}[]>([])
  const [linkSearch, setLinkSearch]           = useState('')
  const [linking, setLinking]                 = useState(false)

  // ── Export modal ──────────────────────────────────────────────
  const [showExportModal, setShowExportModal]           = useState(false)
  const [exportMode, setExportMode]                     = useState<'all' | 'select'>('all')
  const [exportIncludeInactive, setExportIncludeInactive] = useState(false)
  const [exportSelectedIds, setExportSelectedIds]       = useState<Set<string>>(new Set())
  const [exportSearchQ, setExportSearchQ]               = useState('')
  const [exportFields, setExportFields]                 = useState<Set<string>>(
    () => new Set(EXPORT_FIELDS.filter(f => f.default).map(f => f.key))
  )

  // ── Asistencia en drawer ───────────────────────────────────────
  const [attMonth,    setAttMonth]    = useState<string>(new Date().toISOString().slice(0, 7))
  const [staffAtt,    setStaffAtt]    = useState<any[]>([])
  const [loadingAtt,  setLoadingAtt]  = useState(false)
  const [attEdits,    setAttEdits]    = useState<Record<string, string>>({})
  const [savingAtt,   setSavingAtt]   = useState<string | null>(null)
  const [newAttDate,  setNewAttDate]  = useState('')
  const [newAttNote,  setNewAttNote]  = useState('')
  const [newAttStatus,setNewAttStatus]= useState('presente')
  const [addingAtt,   setAddingAtt]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('staff_type')
      .order('full_name')
    if (error) toast.error('Error al cargar personal')
    setStaff((data ?? []) as StaffMember[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  // Cargar asistencia del empleado seleccionado
  const loadStaffAttendance = useCallback(async () => {
    if (!viewDetail) return
    setLoadingAtt(true)
    setAttEdits({})
    const from = `${attMonth}-01`
    const to   = `${attMonth}-31`
    const { data } = await (supabase as any)
      .from('staff_attendance')
      .select('id, date, status, notes, check_in, check_out')
      .eq('staff_id', viewDetail.id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    setStaffAtt(data ?? [])
    setLoadingAtt(false)
  }, [viewDetail, attMonth])

  useEffect(() => {
    if (viewDetail) loadStaffAttendance()
    else { setStaffAtt([]); setAttEdits({}) }
  }, [viewDetail, attMonth])

  const saveAttNote = async (date: string) => {
    if (!viewDetail) return
    const notes = date in attEdits ? attEdits[date] : (staffAtt.find((r: any) => r.date === date)?.notes ?? '')
    setSavingAtt(date)
    const { error } = await (supabase as any).from('staff_attendance')
      .update({ notes: notes || null })
      .eq('staff_id', viewDetail.id).eq('date', date)
    setSavingAtt(null)
    if (error) { toast.error('Error: ' + error.message); return }
    setStaffAtt(prev => prev.map((r: any) => r.date === date ? { ...r, notes: notes || null } : r))
    const next = { ...attEdits }; delete next[date]; setAttEdits(next)
    toast.success('Observación guardada')
  }

  const saveNewAttRecord = async () => {
    if (!viewDetail || !newAttDate) return
    setAddingAtt(true)
    const { error } = await (supabase as any).from('staff_attendance').upsert({
      staff_id: viewDetail.id, date: newAttDate, status: newAttStatus,
      notes: newAttNote || null, recorded_by: profile?.id,
    }, { onConflict: 'staff_id,date' })
    setAddingAtt(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Registro guardado')
    setNewAttDate(''); setNewAttNote(''); setNewAttStatus('presente')
    loadStaffAttendance()
  }

  const currentTab = TABS.find(t => t.key === activeTab)!
  const filtered = staff.filter(s => {
    const matchTab = !currentTab.types || currentTab.types.includes(s.staff_type)
    const q = search.toLowerCase()
    const matchSearch = !search ||
      s.full_name.toLowerCase().includes(q) ||
      s.employee_number?.toLowerCase().includes(q) ||
      s.national_id?.toLowerCase().includes(q) ||
      s.position?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    return matchTab && matchSearch
  })

  const openNew = () => {
    setSelected(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (s: StaffMember) => {
    setSelected(s)
    setForm({
      full_name:               s.full_name,
      national_id:             s.national_id ?? '',
      birth_date:              s.birth_date ?? '',
      gender:                  s.gender ?? '',
      nationality:             s.nationality ?? 'Salvadoreña',
      photo_url:               s.photo_url ?? '',
      email:                   s.email ?? '',
      phone:                   s.phone ?? '',
      address:                 s.address ?? '',
      emergency_contact_name:  s.emergency_contact_name ?? '',
      emergency_contact_phone: s.emergency_contact_phone ?? '',
      staff_type:              s.staff_type,
      employee_number:         s.employee_number ?? '',
      position:                s.position ?? '',
      department:              s.department ?? '',
      hire_date:               s.hire_date ?? '',
      end_date:                s.end_date ?? '',
      contract_type:           s.contract_type ?? 'tiempo_completo',
      salary:                  s.salary != null ? String(s.salary) : '',
      isss_number:             s.isss_number ?? '',
      afp_number:              s.afp_number ?? '',
      afp_provider:            s.afp_provider ?? '',
      nip:                     s.nip ?? '',
      is_active:               s.is_active,
      notes:                   s.notes ?? '',
      create_user: false, username: '', password: '',
    })
    setShowModal(true)
    setViewDetail(null)
  }

  const openLinkModal = async (s: StaffMember) => {
    setLinkTarget(s)
    setLinkSearch('')
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .order('full_name')
    setLinkProfiles(data ?? [])
    setShowLinkModal(true)
  }

  const handleLinkUser = async (profileId: string) => {
    if (!linkTarget) return
    setLinking(true)
    const [staffRes, profileRes] = await Promise.all([
      supabase.from('staff').update({ user_id: profileId }).eq('id', linkTarget.id),
      supabase.from('profiles').update({
        full_name:  linkTarget.full_name,
        avatar_url: linkTarget.photo_url ?? null,
        phone:      linkTarget.phone     ?? null,
      }).eq('id', profileId),
    ])
    if (staffRes.error || profileRes.error) {
      toast.error('Error al vincular: ' + (staffRes.error?.message ?? profileRes.error?.message))
    } else {
      toast.success('Usuario vinculado — nombre y foto sincronizados')
      setShowLinkModal(false)
      load()
      if (viewDetail?.id === linkTarget.id) setViewDetail({ ...viewDetail, user_id: profileId })
    }
    setLinking(false)
  }

  const handleUnlinkUser = async (s: StaffMember) => {
    if (!confirm(`¿Desvincular usuario de ${s.full_name}?`)) return
    await supabase.from('staff').update({ user_id: null }).eq('id', s.id)
    toast.success('Usuario desvinculado')
    load()
    if (viewDetail?.id === s.id) setViewDetail({ ...viewDetail, user_id: null })
  }

  // Mapa staff_type → rol de usuario del sistema
  const ROLE_MAP: Record<string, string> = {
    docente:       'docente',
    director:      'direccion',
    sub_director:  'direccion',
    administracion:'administracion',
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.staff_type)       { toast.error('Selecciona el tipo de personal'); return }

    // Validar campos de cuenta si se pidió crear usuario
    if (!selected && form.create_user) {
      if (!form.username.trim()) { toast.error('Escribe un nombre de usuario'); return }
      if (!/^[a-z0-9._-]{3,30}$/.test(form.username)) {
        toast.error('Usuario: solo letras minúsculas, números, puntos y guiones (3–30 caracteres)')
        return
      }
      if (form.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return }
    }

    setSaving(true)

    // 1. Si se pidió crear cuenta, llamar al API primero
    let linkedUserId: string | null = null
    if (!selected && form.create_user && form.username && form.password) {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          username:  form.username.trim(),
          full_name: form.full_name.trim(),
          role:      ROLE_MAP[form.staff_type] ?? 'docente',
          password:  form.password,
          phone:     form.phone || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaving(false); toast.error(data.error || 'Error al crear cuenta'); return }
      linkedUserId = data.userId
      toast.success(`Cuenta creada: ${data.username}@eos-school.app`)
    }

    // 2. Guardar expediente staff
    const payload = {
      full_name:               form.full_name.trim(),
      national_id:             form.national_id  || null,
      birth_date:              form.birth_date   || null,
      gender:                  form.gender       || null,
      nationality:             form.nationality  || null,
      photo_url:               form.photo_url    || null,
      email:                   form.email        || null,
      phone:                   form.phone        || null,
      address:                 form.address      || null,
      emergency_contact_name:  form.emergency_contact_name  || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      staff_type:              form.staff_type,
      employee_number:         form.employee_number || null,
      position:                form.position     || null,
      department:              form.department   || null,
      hire_date:               form.hire_date    || null,
      end_date:                form.end_date     || null,
      contract_type:           form.contract_type || null,
      salary:                  form.salary ? parseFloat(form.salary) : null,
      isss_number:             form.isss_number  || null,
      afp_number:              form.afp_number   || null,
      afp_provider:            form.afp_provider || null,
      nip:                     form.nip          || null,
      is_active:               form.is_active,
      notes:                   form.notes        || null,
      ...(linkedUserId ? { user_id: linkedUserId } : {}),
    }

    const { error } = selected
      ? await (supabase as any).from('staff').update(payload).eq('id', selected.id)
      : await (supabase as any).from('staff').insert(payload)

    if (error) { setSaving(false); toast.error('Error al guardar: ' + error.message); return }

    toast.success(selected ? 'Expediente actualizado' : 'Personal registrado')
    setSaving(false)
    setShowModal(false)
    load()
  }

  const toggleExportField = (key: string) => {
    setExportFields(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleExportSelect = (id: string) => {
    setExportSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleExport = async (mode: 'print' | 'pdf') => {
    let toExport = [...staff]

    if (!exportIncludeInactive) {
      toExport = toExport.filter(s => s.is_active)
    }

    if (exportMode === 'select') {
      toExport = toExport.filter(s => exportSelectedIds.has(s.id))
    }

    if (toExport.length === 0) {
      toast.error('No hay personas para exportar con los filtros seleccionados')
      return
    }

    const fields = EXPORT_FIELDS.filter(f => exportFields.has(f.key) && f.key !== 'photo_url')
    const includePhoto = exportFields.has('photo_url')

    const getFieldValue = (s: StaffMember, key: string): string => {
      const raw = s[key as keyof StaffMember]
      let value = String(raw ?? '')
      if (key === 'staff_type')    value = getTypeInfo(String(raw ?? '')).label
      if (key === 'contract_type') value = CONTRACT_LABELS[String(raw ?? '')] ?? value
      if (key === 'is_active')     value = raw ? 'Activo' : 'Inactivo'
      if (key === 'gender')        value = raw === 'M' ? 'Masculino' : raw === 'F' ? 'Femenino' : value
      return value || '—'
    }

    // ── IMPRIMIR ──────────────────────────────────────────────────────────────
    if (mode === 'print') {
      const pages = toExport.map(s => {
        const initials = getInitials(s.full_name)
        const typeLabel = getTypeInfo(s.staff_type).label
        const statusBg  = s.is_active ? '#dcfce7' : '#f1f5f9'
        const statusClr = s.is_active ? '#16a34a' : '#64748b'
        const statusTxt = s.is_active ? 'Activo' : 'Inactivo'

        const photoHtml = includePhoto && s.photo_url
          ? `<img src="${s.photo_url}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #e2e8f0;flex-shrink:0;" />`
          : `<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;font-size:26px;font-weight:700;flex-shrink:0;">${initials}</div>`

        const rowsHtml = fields.map((field, idx) => {
          const value = getFieldValue(s, field.key)
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc'
          return `
            <tr style="background:${bg};">
              <td style="padding:9px 14px;color:#64748b;font-size:12px;font-weight:500;border:1px solid #e2e8f0;width:38%;vertical-align:top;">${field.label}</td>
              <td style="padding:9px 14px;color:#0f172a;font-size:12px;font-weight:600;border:1px solid #e2e8f0;">${value}</td>
            </tr>`
        }).join('')

        return `
          <div class="page">
            <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
              ${photoHtml}
              <div>
                <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;font-weight:700;">${s.full_name}</h2>
                <p style="margin:0 0 8px;color:#475569;font-size:13px;">${s.position || typeLabel}</p>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <span style="background:#ede9fe;color:#6d28d9;font-size:11px;padding:3px 10px;border-radius:99px;font-weight:600;">${typeLabel}</span>
                  ${s.employee_number ? `<span style="background:#f1f5f9;color:#475569;font-size:11px;padding:3px 10px;border-radius:99px;">Emp. #${s.employee_number}</span>` : ''}
                  <span style="background:${statusBg};color:${statusClr};font-size:11px;padding:3px 10px;border-radius:99px;font-weight:600;">${statusTxt}</span>
                </div>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th style="padding:9px 14px;text-align:left;font-size:11px;color:#475569;font-weight:700;border:1px solid #e2e8f0;letter-spacing:0.05em;text-transform:uppercase;">Campo</th>
                  <th style="padding:9px 14px;text-align:left;font-size:11px;color:#475569;font-weight:700;border:1px solid #e2e8f0;letter-spacing:0.05em;text-transform:uppercase;">Valor</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div style="margin-top:auto;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px;display:flex;justify-content:space-between;">
              <span>E-OS School · Expediente Personal</span>
              <span>${new Date().toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })}</span>
            </div>
          </div>`
      }).join('')

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Personal E-OS School</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: white; color: #1e293b; }
    .page { width: 100%; min-height: 100vh; padding: 48px 52px; display: flex; flex-direction: column; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    @media print { .page { page-break-after: always; } .page:last-child { page-break-after: auto; } }
  </style>
</head>
<body>
  ${pages}
  <script>window.onload = () => { window.focus(); window.print(); }<\/script>
</body>
</html>`

      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
      setShowExportModal(false)
      toast.success(`Enviando ${toExport.length} página${toExport.length !== 1 ? 's' : ''} a imprimir…`)
      return
    }

    // ── DESCARGAR PDF DIRECTO ─────────────────────────────────────────────────
    setShowExportModal(false)
    const loadingToast = toast.loading(`Generando PDF de ${toExport.length} persona${toExport.length !== 1 ? 's' : ''}…`)

    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const PAGE_W  = 210
      const PAGE_H  = 297
      const MARGIN  = 15
      const CON_W   = PAGE_W - MARGIN * 2

      const toBase64 = async (url: string): Promise<string | null> => {
        try {
          const res = await fetch(url)
          const blob = await res.blob()
          return new Promise(resolve => {
            const reader = new FileReader()
            reader.onload  = () => resolve(reader.result as string)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch { return null }
      }

      const createCircularImage = async (imageSrc: string, size: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            // Aumentar resolución 10x para mejor claridad
            const resolution = 10
            const canvasSize = size * resolution
            
            const canvas = document.createElement('canvas')
            canvas.width = canvasSize
            canvas.height = canvasSize
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) { reject(new Error('Canvas context failed')); return }
            
            // Habilitar anti-aliasing
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            
            // Dibujar círculo de recorte
            ctx.beginPath()
            ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2)
            ctx.clip()
            
            // Dibujar imagen centrada y escalada
            const min = Math.min(img.width, img.height)
            const sx = (img.width - min) / 2
            const sy = (img.height - min) / 2
            ctx.drawImage(img, sx, sy, min, min, 0, 0, canvasSize, canvasSize)
            
            resolve(canvas.toDataURL('image/png', 0.95))
          }
          img.onerror = () => reject(new Error('Image load failed'))
          img.src = imageSrc
        })
      }

      for (let i = 0; i < toExport.length; i++) {
        const s = toExport[i]
        if (i > 0) doc.addPage()

        // ── Header band ──────────────────────────────────────────────────────
        doc.setFillColor(79, 70, 229)
        doc.rect(0, 0, PAGE_W, 50, 'F')

        // Photo
        const PHOTO = 30
        const PX = MARGIN
        const PY = 10

        if (includePhoto && s.photo_url) {
          const imgData = await toBase64(s.photo_url)
          if (imgData) {
            // Fondo blanco para el círculo
            doc.setFillColor(255, 255, 255)
            doc.circle(PX + PHOTO / 2, PY + PHOTO / 2, PHOTO / 2 + 1.5, 'F')
            
            try {
              // Crear imagen circular usando Canvas
              const circularImg = await createCircularImage(imgData, PHOTO)
              doc.addImage(circularImg, 'PNG', PX, PY, PHOTO, PHOTO)
            } catch { 
              // Si falla, mostrar círculo con iniciales
              doc.setFillColor(139, 92, 246)
              doc.circle(PX + PHOTO / 2, PY + PHOTO / 2, PHOTO / 2, 'F')
              doc.setFontSize(12); doc.setTextColor(255, 255, 255)
              doc.text(getInitials(s.full_name), PX + PHOTO / 2, PY + PHOTO / 2 + 4, { align: 'center' })
            }
          } else {
            doc.setFillColor(139, 92, 246)
            doc.circle(PX + PHOTO / 2, PY + PHOTO / 2, PHOTO / 2, 'F')
            doc.setFontSize(12); doc.setTextColor(255, 255, 255)
            doc.text(getInitials(s.full_name), PX + PHOTO / 2, PY + PHOTO / 2 + 4, { align: 'center' })
          }
        } else {
          doc.setFillColor(139, 92, 246)
          doc.circle(PX + PHOTO / 2, PY + PHOTO / 2, PHOTO / 2, 'F')
          doc.setFontSize(12); doc.setTextColor(255, 255, 255)
          doc.text(getInitials(s.full_name), PX + PHOTO / 2, PY + PHOTO / 2 + 4, { align: 'center' })
        }

        // Name & position
        const TX = PX + PHOTO + 8
        doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold')
        doc.text(s.full_name || '', TX, 21)
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(196, 181, 253)
        doc.text(s.position || getTypeInfo(s.staff_type).label, TX, 29)

        // Status badge
        const isActive = s.is_active
        doc.setFillColor(isActive ? 220 : 226, isActive ? 252 : 232, isActive ? 231 : 240)
        doc.roundedRect(TX, 32, 22, 7, 2, 2, 'F')
        doc.setFontSize(7.5); doc.setTextColor(isActive ? 22 : 71, isActive ? 163 : 85, isActive ? 74 : 105)
        doc.text(isActive ? 'Activo' : 'Inactivo', TX + 11, 37, { align: 'center' })

        // Type badge
        const typeLabel = getTypeInfo(s.staff_type).label
        doc.setFillColor(237, 233, 254)
        doc.roundedRect(TX + 25, 32, typeLabel.length * 1.8 + 4, 7, 2, 2, 'F')
        doc.setFontSize(7.5); doc.setTextColor(109, 40, 217)
        doc.text(typeLabel, TX + 27 + typeLabel.length * 0.9, 37, { align: 'center' })

        // ── Data table ───────────────────────────────────────────────────────
        let y = 60
        const ROW_H  = 9
        const COL_LB = 68
        const COL_VL = CON_W - COL_LB

        // Table header row
        doc.setFillColor(241, 245, 249)
        doc.rect(MARGIN, y, CON_W, ROW_H, 'F')
        doc.setDrawColor(203, 213, 225)
        doc.rect(MARGIN, y, CON_W, ROW_H)
        doc.line(MARGIN + COL_LB, y, MARGIN + COL_LB, y + ROW_H)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139)
        doc.text('CAMPO', MARGIN + 4, y + 6)
        doc.text('VALOR', MARGIN + COL_LB + 4, y + 6)
        y += ROW_H

        // Data rows
        fields.forEach((field, idx) => {
          const value = getFieldValue(s, field.key)

          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252)
          } else {
            doc.setFillColor(255, 255, 255)
          }
          doc.rect(MARGIN, y, CON_W, ROW_H, 'F')

          doc.setDrawColor(226, 232, 240)
          doc.rect(MARGIN, y, CON_W, ROW_H)
          doc.line(MARGIN + COL_LB, y, MARGIN + COL_LB, y + ROW_H)

          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
          doc.setTextColor(100, 116, 139)
          doc.text(field.label, MARGIN + 4, y + 6)

          doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
          const truncated = doc.splitTextToSize(value, COL_VL - 8)[0]
          doc.text(truncated, MARGIN + COL_LB + 4, y + 6)

          y += ROW_H
        })

        // ── Footer ───────────────────────────────────────────────────────────
        const FY = PAGE_H - 12
        doc.setDrawColor(226, 232, 240)
        doc.line(MARGIN, FY - 4, PAGE_W - MARGIN, FY - 4)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184)
        doc.text('E-OS School \u00B7 Expediente Personal', MARGIN, FY)
        doc.text(new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' }), PAGE_W - MARGIN, FY, { align: 'right' })
        doc.text(`${i + 1} / ${toExport.length}`, PAGE_W / 2, FY, { align: 'center' })
      }

      const filename = `personal_eos_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)
      toast.dismiss(loadingToast)
      toast.success(`PDF descargado: ${toExport.length} persona${toExport.length !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error(err)
      toast.dismiss(loadingToast)
      toast.error('Error al generar el PDF')
    }
  }

  const handleExportExcel = async () => {
    let toExport = [...staff]

    if (!exportIncludeInactive) {
      toExport = toExport.filter(s => s.is_active)
    }

    if (exportMode === 'select') {
      toExport = toExport.filter(s => exportSelectedIds.has(s.id))
    }

    if (toExport.length === 0) {
      toast.error('No hay personas para exportar con los filtros seleccionados')
      return
    }

    setShowExportModal(false)
    
    try {
      // Obtener SOLO los campos seleccionados
      const selectedFields = EXPORT_FIELDS.filter(f => exportFields.has(f.key) && f.key !== 'photo_url')
      
      if (selectedFields.length === 0) {
        toast.error('Debes seleccionar al menos un campo para exportar')
        return
      }

      // Mapeo de claves a etiquetas legibles
      const fieldLabels: Record<string, string> = {
        'full_name': 'Nombre Completo',
        'staff_type': 'Tipo de Personal',
        'position': 'Puesto',
        'department': 'Departamento',
        'employee_number': 'N° Empleado',
        'national_id': 'Cédula/DUI',
        'nip': 'NIP',
        'birth_date': 'Fecha de Nacimiento',
        'gender': 'Género',
        'nationality': 'Nacionalidad',
        'address': 'Dirección',
        'email': 'Email',
        'phone': 'Teléfono',
        'emergency_contact_name': 'Contacto Emergencia',
        'emergency_contact_phone': 'Teléfono Emergencia',
        'contract_type': 'Tipo de Contrato',
        'hire_date': 'Fecha de Ingreso',
        'end_date': 'Fecha de Baja',
        'salary': 'Salario',
        'isss_number': 'N° ISSS',
        'afp_number': 'N° AFP',
        'afp_provider': 'Proveedor AFP',
        'is_active': 'Estado',
        'notes': 'Notas',
      }

      // Función para obtener valor formateado
      const getFieldValue = (s: StaffMember, key: string): string => {
        const raw = s[key as keyof StaffMember]
        let value = String(raw ?? '')
        if (key === 'staff_type')    value = getTypeInfo(String(raw ?? '')).label
        if (key === 'contract_type') value = CONTRACT_LABELS[String(raw ?? '')] ?? value
        if (key === 'is_active')     value = raw ? 'Activo' : 'Inactivo'
        if (key === 'gender')        value = raw === 'M' ? 'Masculino' : raw === 'F' ? 'Femenino' : value
        if (key === 'salary' && raw) value = `$${raw}`
        return value || '—'
      }

      // Preparar datos con SOLO campos seleccionados
      const data = toExport.map(s => {
        const row: Record<string, string> = {}
        selectedFields.forEach(field => {
          const label = fieldLabels[field.key] || field.label
          row[label] = getFieldValue(s, field.key)
        })
        return row
      })

      // Crear libro de Excel
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(data)
      
      // Estilo de encabezado
      const headerStyle = {
        fill: { fgColor: { rgb: '4F46E5' } }, // Indigo
        font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      }

      // Estilo de celdas de datos
      const cellStyle = {
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'CCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
          left: { style: 'thin', color: { rgb: 'CCCCCC' } },
          right: { style: 'thin', color: { rgb: 'CCCCCC' } },
        },
      }

      // Estilo alterno para filas (gris claro)
      const cellStyleAlt = {
        fill: { fgColor: { rgb: 'F8F9FA' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'CCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
          left: { style: 'thin', color: { rgb: 'CCCCCC' } },
          right: { style: 'thin', color: { rgb: 'CCCCCC' } },
        },
      }

      // Aplicar estilos
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      
      // Estilo para encabezados (primera fila)
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + '1'
        if (!ws[address]) continue
        ws[address].s = headerStyle
      }

      // Estilo para datos
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C })
          if (!ws[address]) continue
          ws[address].s = R % 2 === 0 ? cellStyle : cellStyleAlt
        }
      }

      // Ancho de columnas automático basado en campos seleccionados
      const defaultWidth = 18
      ws['!cols'] = selectedFields.map(() => ({ wch: defaultWidth }))

      // Altura de encabezado
      ws['!rows'] = [{ hpx: 30 }]

      XLSX.utils.book_append_sheet(wb, ws, 'Personal')
      const filename = `equipo_trabajo_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
      
      toast.success(`Excel descargado: ${toExport.length} persona${toExport.length !== 1 ? 's' : ''} con ${selectedFields.length} campo${selectedFields.length !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error(err)
      toast.error('Error al generar el Excel')
    }
  }

  const toggleActive = async (s: StaffMember) => {
    await supabase.from('staff').update({ is_active: !s.is_active }).eq('id', s.id)
    toast.success(s.is_active ? 'Marcado como inactivo' : 'Marcado como activo')
    if (viewDetail?.id === s.id) setViewDetail({ ...viewDetail, is_active: !s.is_active })
    load()
  }

  const handleDelete = async (s: StaffMember) => {
    if (!confirm(`¿Eliminar el expediente de ${s.full_name}? Esta acción no se puede deshacer.`)) return
    await supabase.from('staff').delete().eq('id', s.id)
    toast.success('Expediente eliminado')
    setViewDetail(null)
    load()
  }

  const f = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  // Stats
  const total   = staff.length
  const activos = staff.filter(s => s.is_active).length
  const statsByType = STAFF_TYPES.slice(0, 6).map(t => ({
    ...t, count: staff.filter(s => s.staff_type === t.value).length,
  }))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Equipo de Trabajo</h1>
          <p className="page-subtitle">{total} personas registradas · {activos} activas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setExportMode('all')
              setExportIncludeInactive(false)
              setExportSelectedIds(new Set())
              setExportSearchQ('')
              setExportFields(new Set(EXPORT_FIELDS.filter(f => f.default).map(f => f.key)))
              setShowExportModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Exportar
          </button>
          {canManageStaff && (
            <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Agregar Personal
            </button>
          )}
        </div>
      </div>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 flex flex-col gap-1">
          <p className="text-2xl font-bold text-slate-900">{total}</p>
          <p className="text-xs text-slate-500">Total personal</p>
        </div>
        <div className="card p-4 flex flex-col gap-1">
          <p className="text-2xl font-bold text-emerald-600">{activos}</p>
          <p className="text-xs text-slate-500">Activos</p>
        </div>
        <div className="card p-4 flex flex-col gap-1">
          <p className="text-2xl font-bold text-indigo-600">{staff.filter(s => s.staff_type === 'docente').length}</p>
          <p className="text-xs text-slate-500">Docentes</p>
        </div>
        <div className="card p-4 flex flex-col gap-1">
          <p className="text-2xl font-bold text-slate-500">{staff.filter(s => !s.is_active).length}</p>
          <p className="text-xs text-slate-500">Inactivos</p>
        </div>
      </div>

      {/* ─── Tabla / detalle ─── */}
      <div className={`grid gap-6 ${viewDetail ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

        {/* Lista */}
        <div className={viewDetail ? 'lg:col-span-3' : 'col-span-1'}>
          {/* Tabs + search */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white text-sm shrink-0">
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  {tab.label}
                  <span className="ml-1.5 text-[10px] opacity-60">
                    ({tab.types ? staff.filter(s => tab.types!.includes(s.staff_type)).length : total})
                  </span>
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, DUI, cargo..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500" />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Empleado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Tipo</th>
                    {!viewDetail && <>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">DUI</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">ISSS</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">AFP</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Desde</th>
                    </>}
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                      Sin resultados
                    </td></tr>
                  ) : filtered.map(s => {
                    const typeInfo = getTypeInfo(s.staff_type)
                    const isViewing = viewDetail?.id === s.id
                    return (
                      <tr key={s.id}
                        onClick={() => setViewDetail(isViewing ? null : s)}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isViewing ? 'bg-eos-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
                              {s.photo_url
                                ? <img src={s.photo_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                                : <span className="text-white text-xs font-bold">{getInitials(s.full_name)}</span>
                              }
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">{s.full_name}</p>
                              <p className="text-xs text-slate-400 truncate">{s.position || s.employee_number || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        {!viewDetail && <>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.national_id || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.isss_number || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {s.afp_provider ? (
                              <span className="font-medium">{s.afp_provider.replace('AFP ', '')}</span>
                            ) : '—'}
                            {s.afp_number && <span className="block font-mono text-[11px] text-slate-400">{s.afp_number}</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(s.hire_date)}</td>
                        </>}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {s.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(s)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                              <Pencil className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            <button onClick={() => toggleActive(s)}
                              className={`p-1.5 rounded-lg transition-colors ${s.is_active ? 'hover:bg-red-50' : 'hover:bg-emerald-50'}`}>
                              {s.is_active
                                ? <UserX className="w-3.5 h-3.5 text-red-400" />
                                : <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── Panel Expediente ─── */}
        {viewDetail && (
          <div className="lg:col-span-2">
            <div className="card overflow-hidden sticky top-4">
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
                    {viewDetail.photo_url
                      ? <img src={viewDetail.photo_url} className="w-12 h-12 rounded-full object-cover" alt="" />
                      : <span className="text-white text-sm font-bold">{getInitials(viewDetail.full_name)}</span>
                    }
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{viewDetail.full_name}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5 ${getTypeInfo(viewDetail.staff_type).color}`}>
                      {getTypeInfo(viewDetail.staff_type).label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(viewDetail)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewDetail(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5 max-h-[calc(100vh-220px)] overflow-y-auto">

                {/* Laboral */}
                <Section title="Datos Laborales" icon={<Building2 className="w-3.5 h-3.5" />}>
                  <Row label="N° Empleado"  value={viewDetail.employee_number} mono />
                  <Row label="Cargo"         value={viewDetail.position} />
                  <Row label="Departamento"  value={viewDetail.department} />
                  <Row label="Contrato"      value={CONTRACT_LABELS[viewDetail.contract_type ?? ''] ?? viewDetail.contract_type} />
                  {canSeeSalary && <Row label="Salario" value={fmtSalary(viewDetail.salary)} />}
                  <Row label="Contratación"  value={fmtDate(viewDetail.hire_date)} />
                  {viewDetail.end_date && <Row label="Baja" value={fmtDate(viewDetail.end_date)} />}
                </Section>

                {/* Personal */}
                <Section title="Información Personal" icon={<FileText className="w-3.5 h-3.5" />}>
                  <Row label="DUI"            value={viewDetail.national_id} mono />
                  <Row label="Nacimiento"     value={fmtDate(viewDetail.birth_date)} />
                  <Row label="Género"         value={viewDetail.gender === 'M' ? 'Masculino' : viewDetail.gender === 'F' ? 'Femenino' : viewDetail.gender} />
                  <Row label="Nacionalidad"   value={viewDetail.nationality} />
                </Section>

                {/* Contacto */}
                <Section title="Contacto" icon={<Phone className="w-3.5 h-3.5" />}>
                  <Row label="Email"     value={viewDetail.email} />
                  <Row label="Teléfono"  value={viewDetail.phone} />
                  <Row label="Dirección" value={viewDetail.address} />
                  {(viewDetail.emergency_contact_name || viewDetail.emergency_contact_phone) && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Emergencias</p>
                      <p className="text-xs text-slate-700">{viewDetail.emergency_contact_name || '—'}</p>
                      <p className="text-xs text-slate-500">{viewDetail.emergency_contact_phone || '—'}</p>
                    </div>
                  )}
                </Section>

                {/* Seguridad Social */}
                <Section title="Seguridad Social" icon={<Shield className="w-3.5 h-3.5" />}>
                  <Row label="N° ISSS"   value={viewDetail.isss_number} mono />
                  <Row label="N° AFP"    value={viewDetail.afp_number} mono />
                  <Row label="Proveedor AFP" value={viewDetail.afp_provider} />
                  <Row label="NIP"       value={viewDetail.nip} mono />
                </Section>

                {viewDetail.notes && (
                  <Section title="Notas" icon={<FileText className="w-3.5 h-3.5" />}>
                    <p className="text-xs text-slate-600 leading-relaxed">{viewDetail.notes}</p>
                  </Section>
                )}

                {/* Historial de Asistencia */}
                <Section title="Historial de Asistencia" icon={<ClipboardList className="w-3.5 h-3.5" />}>
                  {/* Selector de mes */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="month" value={attMonth}
                      onChange={e => setAttMonth(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-eos-500 flex-1"
                    />
                    {loadingAtt && <div className="w-3.5 h-3.5 border-2 border-eos-400 border-t-transparent rounded-full animate-spin shrink-0" />}
                  </div>

                  {/* Stats del mes */}
                  {staffAtt.length > 0 && (() => {
                    const counts: Record<string, number> = {}
                    staffAtt.forEach((r: any) => { counts[r.status] = (counts[r.status] ?? 0) + 1 })
                    const statItems = [
                      { key: 'presente',   label: 'P',  color: 'bg-emerald-100 text-emerald-700' },
                      { key: 'ausente',    label: 'A',  color: 'bg-red-100 text-red-700' },
                      { key: 'tardanza',   label: 'T',  color: 'bg-amber-100 text-amber-700' },
                      { key: 'permiso',    label: 'Pe', color: 'bg-blue-100 text-blue-700' },
                      { key: 'vacaciones', label: 'V',  color: 'bg-violet-100 text-violet-700' },
                    ].filter(s => counts[s.key] > 0)
                    return (
                      <div className="flex gap-1.5 flex-wrap mb-3">
                        {statItems.map(s => (
                          <span key={s.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.color}`}>
                            {s.label} {counts[s.key]}
                          </span>
                        ))}
                        <span className="text-[10px] text-slate-400 ml-auto self-center">{staffAtt.length} días registrados</span>
                      </div>
                    )
                  })()}

                  {/* Lista de registros */}
                  {!loadingAtt && staffAtt.length === 0 ? (
                    <p className="text-xs text-slate-400 mb-3">Sin registros en este mes.</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {staffAtt.map((r: any) => {
                        const statusColors: Record<string, string> = {
                          presente:   'bg-emerald-100 text-emerald-700 border-emerald-200',
                          ausente:    'bg-red-100 text-red-700 border-red-200',
                          tardanza:   'bg-amber-100 text-amber-700 border-amber-200',
                          permiso:    'bg-blue-100 text-blue-700 border-blue-200',
                          vacaciones: 'bg-violet-100 text-violet-700 border-violet-200',
                        }
                        const statusLabels: Record<string, string> = {
                          presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza',
                          permiso: 'Permiso', vacaciones: 'Vacaciones',
                        }
                        const noteVal = r.date in attEdits ? attEdits[r.date] : (r.notes ?? '')
                        const isDirty = r.date in attEdits && attEdits[r.date] !== (r.notes ?? '')
                        const dayLabel = new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: 'short' })
                        return (
                          <div key={r.date} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[11px] font-medium text-slate-600 capitalize">{dayLabel}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColors[r.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {statusLabels[r.status] ?? r.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={noteVal}
                                placeholder="Agregar observación…"
                                onChange={e => setAttEdits(prev => ({ ...prev, [r.date]: e.target.value }))}
                                className="flex-1 text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-eos-400 bg-white"
                              />
                              {isDirty && (
                                <button
                                  onClick={() => saveAttNote(r.date)}
                                  disabled={savingAtt === r.date}
                                  className="p-1.5 rounded-lg bg-eos-600 text-white hover:bg-eos-700 disabled:opacity-50 transition-colors shrink-0"
                                  title="Guardar observación">
                                  {savingAtt === r.date
                                    ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Save className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Agregar registro con observación */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Agregar / actualizar registro</p>
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <input
                          type="date" value={newAttDate}
                          onChange={e => setNewAttDate(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-eos-500"
                        />
                        <select
                          value={newAttStatus}
                          onChange={e => setNewAttStatus(e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-eos-500 bg-white">
                          <option value="presente">Presente</option>
                          <option value="ausente">Ausente</option>
                          <option value="tardanza">Tardanza</option>
                          <option value="permiso">Permiso</option>
                          <option value="vacaciones">Vacaciones</option>
                        </select>
                      </div>
                      <textarea
                        value={newAttNote}
                        onChange={e => setNewAttNote(e.target.value)}
                        placeholder="Ej: Tuvo que retirarse a las 11am por emergencia familiar…"
                        rows={2}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-eos-500"
                      />
                      <button
                        onClick={saveNewAttRecord}
                        disabled={!newAttDate || addingAtt}
                        className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl bg-eos-600 text-white hover:bg-eos-700 disabled:opacity-40 transition-colors font-medium">
                        {addingAtt
                          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <Plus className="w-3.5 h-3.5" />}
                        Guardar registro
                      </button>
                    </div>
                  </div>
                </Section>

                {/* Acciones */}
                <div className="space-y-2 pt-1">
                  {/* Vincular usuario */}
                  {viewDetail.user_id ? (
                    <button onClick={() => handleUnlinkUser(viewDetail)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-red-50 hover:text-red-600 border border-indigo-200 hover:border-red-200 transition-colors">
                      <Unlink className="w-3.5 h-3.5" /> Usuario vinculado · Desvincular
                    </button>
                  ) : (
                    <button onClick={() => openLinkModal(viewDetail)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors">
                      <Link2 className="w-3.5 h-3.5" /> Vincular Usuario del Sistema
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => toggleActive(viewDetail)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-colors ${
                        viewDetail.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                      }`}>
                      {viewDetail.is_active ? <><UserX className="w-3.5 h-3.5" /> Desactivar</> : <><UserCheck className="w-3.5 h-3.5" /> Activar</>}
                    </button>
                    {canDelete && (
                      <button onClick={() => handleDelete(viewDetail)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-colors">
                        <X className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal Agregar / Editar ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {selected ? 'Editar Expediente' : 'Nuevo Integrante del Equipo'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected ? selected.full_name : 'Completa los datos del expediente laboral'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form body */}
            <div className="overflow-y-auto px-6 py-5 space-y-6">

              {/* Sección 1: Información Laboral (primero — más importante) */}
              <FormSection title="Datos Laborales">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="form-label">Tipo de Personal *</label>
                    <select value={form.staff_type} onChange={f('staff_type')} className="form-input">
                      {STAFF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="form-label">N° de Empleado</label>
                    <input value={form.employee_number} onChange={f('employee_number')} className="form-input" placeholder="EMP-001" />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Cargo / Puesto</label>
                    <input value={form.position} onChange={f('position')} className="form-input" placeholder="Ej: Docente de Matemáticas, Jefe de Mantenimiento..." />
                  </div>
                  <div>
                    <label className="form-label">Departamento</label>
                    <input value={form.department} onChange={f('department')} className="form-input" placeholder="Académico, Administrativo..." />
                  </div>
                  <div>
                    <label className="form-label">Tipo de Contrato</label>
                    <select value={form.contract_type} onChange={f('contract_type')} className="form-input">
                      <option value="">Seleccionar</option>
                      <option value="tiempo_completo">Tiempo completo</option>
                      <option value="medio_tiempo">Medio tiempo</option>
                      <option value="eventual">Eventual</option>
                      <option value="contrato">Por contrato</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Fecha de Contratación</label>
                    <input type="date" value={form.hire_date} onChange={f('hire_date')} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Salario Mensual ($)</label>
                    <input type="number" value={form.salary} onChange={f('salary')} className="form-input" placeholder="0.00" min="0" step="0.01" />
                  </div>
                  <div>
                    <label className="form-label">Fecha de Baja <span className="text-slate-400">(si aplica)</span></label>
                    <input type="date" value={form.end_date} onChange={f('end_date')} className="form-input" />
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                        className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${form.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-sm text-slate-700">Empleado activo</span>
                    </label>
                  </div>
                </div>
              </FormSection>

              {/* Sección 2: Seguridad Social */}
              <FormSection title="Seguridad Social">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">N° ISSS</label>
                    <input value={form.isss_number} onChange={f('isss_number')} className="form-input font-mono" placeholder="Número de ISSS" />
                  </div>
                  <div>
                    <label className="form-label">N° AFP</label>
                    <input value={form.afp_number} onChange={f('afp_number')} className="form-input font-mono" placeholder="Número de AFP" />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Proveedor AFP</label>
                    <select value={form.afp_provider} onChange={f('afp_provider')} className="form-input">
                      <option value="">Seleccionar AFP</option>
                      <option value="AFP Crecer">AFP Crecer</option>
                      <option value="AFP Confia">AFP Confia</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">NIP <span className="text-slate-400 font-normal">(Número de Identificación Personal)</span></label>
                    <input value={form.nip} onChange={f('nip')} className="form-input font-mono" placeholder="Ej: 12345678-9 o código docente" />
                  </div>
                </div>
              </FormSection>

              {/* Sección 3: Información Personal */}
              <FormSection title="Información Personal">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="form-label">Nombre Completo *</label>
                    <input value={form.full_name} onChange={f('full_name')} className="form-input" placeholder="Nombre completo del empleado" />
                  </div>
                  <div>
                    <label className="form-label">DUI</label>
                    <input value={form.national_id} onChange={f('national_id')} className="form-input font-mono" placeholder="00000000-0" />
                  </div>
                  <div>
                    <label className="form-label">Fecha de Nacimiento</label>
                    <input type="date" value={form.birth_date} onChange={f('birth_date')} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Género</label>
                    <select value={form.gender} onChange={f('gender')} className="form-input">
                      <option value="">Seleccionar</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Nacionalidad</label>
                    <input value={form.nationality} onChange={f('nationality')} className="form-input" />
                  </div>
                </div>
              </FormSection>

              {/* Sección 4: Contacto */}
              <FormSection title="Contacto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Email</label>
                    <input type="email" value={form.email} onChange={f('email')} className="form-input" placeholder="correo@ejemplo.com" />
                  </div>
                  <div>
                    <label className="form-label">Teléfono</label>
                    <input value={form.phone} onChange={f('phone')} className="form-input" placeholder="0000-0000" />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Dirección</label>
                    <input value={form.address} onChange={f('address')} className="form-input" placeholder="Dirección de residencia" />
                  </div>
                  <div>
                    <label className="form-label">Contacto de Emergencia</label>
                    <input value={form.emergency_contact_name} onChange={f('emergency_contact_name')} className="form-input" placeholder="Nombre" />
                  </div>
                  <div>
                    <label className="form-label">Teléfono Emergencia</label>
                    <input value={form.emergency_contact_phone} onChange={f('emergency_contact_phone')} className="form-input" placeholder="0000-0000" />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Foto del empleado</label>
                    <div className="flex items-center gap-4">
                      <PhotoUpload
                        currentUrl={form.photo_url || null}
                        onUpload={url => setForm(p => ({ ...p, photo_url: url }))}
                        folder="staff"
                        size="lg"
                        shape="circle"
                      />
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>Clic en la foto para subir una imagen</p>
                        <p>JPG, PNG o WebP — máx. 5 MB</p>
                      </div>
                    </div>
                  </div>
                </div>
              </FormSection>

              {/* Sección 5: Notas */}
              <FormSection title="Observaciones">
                <textarea value={form.notes} onChange={f('notes')}
                  rows={3}
                  placeholder="Notas adicionales, observaciones del expediente..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 resize-none" />
              </FormSection>

              {/* Sección 6: Cuenta de acceso — solo al crear */}
              {!selected && (
                <FormSection title="Cuenta de Acceso al Sistema">
                  <div className="col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600"
                        checked={form.create_user}
                        onChange={e => setForm(p => ({ ...p, create_user: e.target.checked, username: '', password: '' }))}
                      />
                      <span className="text-sm font-medium text-slate-700">Crear cuenta de usuario al mismo tiempo</span>
                    </label>
                    <p className="text-xs text-slate-400 mt-1 ml-7">
                      {form.staff_type === 'docente'
                        ? 'Crea la cuenta, perfil y registro de docente en un solo paso.'
                        : 'Crea la cuenta y perfil de acceso al sistema.'}
                    </p>
                  </div>

                  {form.create_user && (
                    <>
                      <div>
                        <label className="form-label">Usuario *</label>
                        <input
                          value={form.username}
                          onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                          className="form-input"
                          placeholder="carlos_denilson"
                        />
                        {form.username && (
                          <p className="text-xs text-slate-400 mt-1">Acceso: {form.username}@eos-school.app</p>
                        )}
                      </div>
                      <div>
                        <label className="form-label">Contraseña * (mín. 6 caracteres)</label>
                        <input
                          type="password"
                          value={form.password}
                          onChange={f('password')}
                          className="form-input"
                          placeholder="••••••••"
                        />
                      </div>
                    </>
                  )}
                </FormSection>
              )}
            </div>

            {/* Footer modal */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-white rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {selected ? 'Guardar Cambios' : 'Registrar Personal'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Modal Exportar Personal ─── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Download className="w-4 h-4 text-slate-500" /> Exportar Personal
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Elige quiénes y qué información deseas descargar</p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-5 space-y-6">

              {/* ── Sección 1: ¿Quiénes? ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-slate-700">1. ¿A quiénes quieres exportar?</p>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    onClick={() => setExportMode('all')}
                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                      exportMode === 'all'
                        ? 'border-eos-500 bg-eos-50 text-eos-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}>
                    <span className="text-sm font-semibold">Todos los del personal</span>
                    <span className="text-xs opacity-70">Exporta todo el equipo de trabajo</span>
                  </button>
                  <button
                    onClick={() => setExportMode('select')}
                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                      exportMode === 'select'
                        ? 'border-eos-500 bg-eos-50 text-eos-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}>
                    <span className="text-sm font-semibold">Seleccionar individualmente</span>
                    <span className="text-xs opacity-70">Elige persona por persona</span>
                  </button>
                </div>

                {/* Incluir inactivos */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div
                    onClick={() => setExportIncludeInactive(p => !p)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${exportIncludeInactive ? 'bg-amber-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${exportIncludeInactive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-slate-700">Incluir empleados inactivos</span>
                </label>

                {/* Lista de selección individual */}
                {exportMode === 'select' && (
                  <div className="mt-3">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        value={exportSearchQ}
                        onChange={e => setExportSearchQ(e.target.value)}
                        placeholder="Buscar por nombre o cargo..."
                        className="w-full pl-8 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-eos-500"
                      />
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-48 divide-y divide-slate-50">
                      {staff
                        .filter(s => {
                          if (!exportIncludeInactive && !s.is_active) return false
                          const q = exportSearchQ.toLowerCase()
                          return !q || s.full_name.toLowerCase().includes(q) || (s.position ?? '').toLowerCase().includes(q)
                        })
                        .map(s => {
                          const checked = exportSelectedIds.has(s.id)
                          const typeInfo = getTypeInfo(s.staff_type)
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleExportSelect(s.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${checked ? 'bg-eos-50/50' : ''}`}>
                              <div className={`shrink-0 ${checked ? 'text-eos-600' : 'text-slate-300'}`}>
                                {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </div>
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
                                {s.photo_url
                                  ? <img src={s.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                                  : <span className="text-white text-[10px] font-bold">{getInitials(s.full_name)}</span>
                                }
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800 truncate">{s.full_name}</p>
                                <p className="text-xs text-slate-400 truncate">{s.position || '—'}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${typeInfo.color}`}>{typeInfo.label}</span>
                                {!s.is_active && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactivo</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                    </div>
                    {exportSelectedIds.size > 0 && (
                      <p className="text-xs text-eos-600 font-medium mt-1.5">
                        {exportSelectedIds.size} persona{exportSelectedIds.size !== 1 ? 's' : ''} seleccionada{exportSelectedIds.size !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Sección 2: Campos ── */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-700">2. ¿Qué campos quieres incluir?</p>
                    <div className="h-px bg-slate-100 w-8" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExportFields(new Set(EXPORT_FIELDS.map(f => f.key)))}
                      className="text-[11px] text-eos-600 hover:underline font-medium">
                      Todos
                    </button>
                    <span className="text-slate-300 text-xs">·</span>
                    <button
                      onClick={() => setExportFields(new Set())}
                      className="text-[11px] text-slate-500 hover:underline">
                      Ninguno
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {EXPORT_FIELDS.map(field => {
                    const checked = exportFields.has(field.key)
                    const isPhoto = field.key === 'photo_url'
                    return (
                      <label
                        key={field.key}
                        onClick={() => toggleExportField(field.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors select-none ${
                          checked
                            ? isPhoto
                              ? 'border-violet-300 bg-violet-50 text-violet-700'
                              : 'border-eos-300 bg-eos-50 text-eos-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-500'
                        }`}>
                        <div className={`shrink-0 ${checked ? (isPhoto ? 'text-violet-500' : 'text-eos-500') : 'text-slate-300'}`}>
                          {checked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs font-medium truncate">{field.label}</span>
                        {isPhoto && checked && (
                          <span className="ml-auto text-[9px] bg-violet-100 text-violet-600 px-1 rounded shrink-0">URL</span>
                        )}
                      </label>
                    )
                  })}
                </div>

                <p className="text-[11px] text-slate-400 mt-2">
                  La foto se muestra directamente en el PDF. Cada persona ocupa una página completa.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={() => setShowExportModal(false)} className="btn-secondary text-sm px-4">
                Cancelar
              </button>
              <div className="flex flex-1 gap-2">
                <button
                  onClick={() => handleExport('print')}
                  disabled={exportMode === 'select' && exportSelectedIds.size === 0}
                  className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors font-medium">
                  <Printer className="w-4 h-4" />
                  Imprimir
                </button>
                <button
                  onClick={() => handleExportExcel()}
                  disabled={exportMode === 'select' && exportSelectedIds.size === 0}
                  className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors font-medium">
                  <Sheet className="w-4 h-4" />
                  Excel
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded-full text-xs">
                    {exportMode === 'select'
                      ? exportSelectedIds.size
                      : staff.filter(s => exportIncludeInactive || s.is_active).length}
                  </span>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportMode === 'select' && exportSelectedIds.size === 0}
                  className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
                  <FileDown className="w-4 h-4" />
                  Descargar PDF
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
                    {exportMode === 'select'
                      ? exportSelectedIds.size
                      : staff.filter(s => exportIncludeInactive || s.is_active).length}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Vincular Usuario ─── */}
      {showLinkModal && linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Vincular Usuario del Sistema</h3>
                <p className="text-xs text-slate-400 mt-0.5">{linkTarget.full_name}</p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Buscar usuario..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {linkProfiles
                .filter(p => {
                  const q = linkSearch.toLowerCase()
                  return !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
                })
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleLinkUser(p.id)}
                    disabled={linking}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">
                        {p.full_name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.email}</p>
                    </div>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                      {p.role}
                    </span>
                  </button>
                ))
              }
            </div>
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
              Al vincular, el nombre y foto del expediente se sincronizan al perfil del usuario.
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-slate-400">{icon}</span>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className={`text-slate-700 text-right ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      {children}
    </div>
  )
}
