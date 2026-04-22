'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { ROLE_COLORS } from '@/lib/utils'
import { UserCheck, Search, Plus, Pencil, X, Check, Mail, Phone, BookOpen, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { TableSkeleton } from '@/components/ui/LoadingSkeleton'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import BackButton from '@/components/ui/BackButton'

interface Teacher {
  id: string
  user_id: string
  employee_number: string
  nip: string | null
  specialization: string | null
  hire_date: string | null
  is_active: boolean
  created_at: string
  profile: { full_name: string; email: string; avatar_url: string | null; phone: string | null } | null
}

export default function DocentesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role && ['master', 'direccion', 'administracion'].includes(profile.role)

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_number: '', nip: '', specialization: '', hire_date: '',
    full_name: '', email: '', phone: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*, profile:profiles(full_name, email, avatar_url, phone)')
        .order('created_at', { ascending: false })
      if (error) { setLoadError(true); return }
      setTeachers((data ?? []) as Teacher[])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const filtered = teachers.filter(t =>
    !search ||
    t.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.profile?.email?.toLowerCase().includes(search.toLowerCase()) ||
    t.employee_number?.toLowerCase().includes(search.toLowerCase()) ||
    t.specialization?.toLowerCase().includes(search.toLowerCase())
  )

  const openEdit = (t: Teacher) => {
    setSelected(t)
    setForm({
      employee_number: t.employee_number ?? '',
      nip: t.nip ?? '',
      specialization: t.specialization ?? '',
      hire_date: t.hire_date ?? '',
      full_name: t.profile?.full_name ?? '',
      email: t.profile?.email ?? '',
      phone: t.profile?.phone ?? '',
    })
    setModal(true)
  }

  const openNew = () => {
    setSelected(null)
    setForm({ employee_number: '', nip: '', specialization: '', hire_date: '', full_name: '', email: '', phone: '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.full_name || !form.email) { toast.error('Nombre y email son requeridos'); return }
    setSaving(true)

    if (selected) {
      // Actualizar datos del teacher
      const { error: tErr } = await supabase.from('teachers').update({
        employee_number: form.employee_number,
        nip: form.nip || null,
        specialization: form.specialization || null,
        hire_date: form.hire_date || null,
      }).eq('id', selected.id)

      // Actualizar perfil
      const { error: pErr } = await supabase.from('profiles').update({
        full_name: form.full_name,
        phone: form.phone || null,
      }).eq('id', selected.user_id)

      if (tErr || pErr) { toast.error('Error al actualizar'); setSaving(false); return }
      toast.success('Docente actualizado')
    }
    // Nota: crear nuevo docente requiere crear usuario en Auth primero → indicar al admin
    setSaving(false)
    setModal(false)
    load()
  }

  const toggleActive = async (t: Teacher) => {
    await supabase.from('teachers').update({ is_active: !t.is_active }).eq('id', t.id)
    await supabase.from('profiles').update({ is_active: !t.is_active }).eq('id', t.user_id)
    toast.success(t.is_active ? 'Docente desactivado' : 'Docente activado')
    load()
  }

  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Docentes</h1>
          <p className="page-subtitle">{teachers.length} docentes registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 w-56" />
          </div>
          {isAdmin && (
            <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Nuevo Docente
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: teachers.length, color: 'bg-eos-50 text-eos-700' },
          { label: 'Activos', value: teachers.filter(t => t.is_active).length, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Inactivos', value: teachers.filter(t => !t.is_active).length, color: 'bg-slate-50 text-slate-500' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm opacity-70">{s.label}</p>
          </div>
        ))}
      </div>

      {loadError && (
        <ErrorDisplay
          error={new Error('No se pudo cargar la lista de docentes.')}
          onRetry={load}
        />
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Docente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">N° Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Especialización</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Contratación</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
                {isAdmin && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">No hay docentes</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
                        {t.profile?.avatar_url
                          ? <img src={t.profile.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                          : <span className="text-white text-xs font-bold">{getInitials(t.profile?.full_name ?? 'D')}</span>
                        }
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{t.profile?.full_name ?? 'Sin nombre'}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" />{t.profile?.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-600"><Hash className="w-3 h-3" />{t.employee_number || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-600">
                      <BookOpen className="w-3 h-3 text-slate-400" />{t.specialization || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {t.hire_date ? new Date(t.hire_date).toLocaleDateString('es-SV') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <button onClick={() => toggleActive(t)} className={`p-1.5 rounded-lg transition-colors ${t.is_active ? 'hover:bg-red-50' : 'hover:bg-emerald-50'}`}>
                          {t.is_active
                            ? <X className="w-3.5 h-3.5 text-red-400" />
                            : <Check className="w-3.5 h-3.5 text-emerald-500" />
                          }
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{selected ? 'Editar Docente' : 'Nuevo Docente'}</h3>
              <button onClick={() => setModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {[
                { label: 'Nombre completo', key: 'full_name', col: '2' },
                { label: 'Email', key: 'email', col: '2', disabled: !!selected },
                { label: 'N° Empleado', key: 'employee_number', col: '1' },
                { label: 'Teléfono', key: 'phone', col: '1' },
                { label: 'NIP (DUI u otro documento)', key: 'nip', col: '2' },
                { label: 'Especialización', key: 'specialization', col: '2' },
                { label: 'Fecha de contratación', key: 'hire_date', col: '2', type: 'date' },
              ].map(f => (
                <div key={f.key} className={f.col === '2' ? 'col-span-2' : 'col-span-1'}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                  <input
                    type={f.type ?? 'text'}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    disabled={f.disabled}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              ))}
              {!selected && (
                <div className="col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">Para crear un nuevo docente, primero crea el usuario en <strong>Supabase Auth Dashboard</strong> con email/contraseña y rol <code>docente</code>, luego aparecerá aquí.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(false)} className="btn-secondary flex-1">Cancelar</button>
              {selected && (
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
