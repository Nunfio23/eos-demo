'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Clock, Save, Users,
  CheckCircle, XCircle, AlertCircle, Calendar, Shield,
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

// ─── Tipos ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'presente',   label: 'Presente',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'ausente',    label: 'Ausente',     color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'tardanza',   label: 'Tardanza',    color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'permiso',    label: 'Permiso',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'vacaciones', label: 'Vacaciones',  color: 'bg-violet-100 text-violet-700 border-violet-200' },
]

const STAFF_TYPE_LABELS: Record<string, string> = {
  docente: 'Docente', director: 'Director/a', sub_director: 'Sub-Director/a',
  administracion: 'Administración', recepcionista: 'Recepcionista',
  asistente: 'Asistente', mantenimiento: 'Mantenimiento',
  limpieza: 'Limpieza', tienda: 'Tienda', vigilancia: 'Vigilancia', otro: 'Otro',
}

interface StaffMember {
  id: string
  full_name: string
  staff_type: string
  photo_url: string | null
  employee_number: string | null
  position: string | null
}

interface AttendanceRow {
  staff_id:   string
  date:       string
  status:     string
  check_in:   string
  check_out:  string
  notes:      string
  saved:      boolean   // whether DB already has this record
  dirty:      boolean   // whether user changed it
}

const getInitials = (name: string) =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

const fmtDate = (d: Date) => d.toISOString().split('T')[0]

const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ─── Página ───────────────────────────────────────────────────

export default function StaffAsistenciaPage() {
  const { profile } = useAuth()

  if (profile && profile.role !== 'master') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Shield className="w-10 h-10" />
        <p className="text-sm">Acceso restringido al Master</p>
      </div>
    )
  }

  const [date, setDate]           = useState<Date>(new Date())
  const [staff, setStaff]         = useState<StaffMember[]>([])
  const [rows, setRows]           = useState<Record<string, AttendanceRow>>({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // Load all active staff
  useEffect(() => {
    supabase
      .from('staff')
      .select('id, full_name, staff_type, photo_url, employee_number, position')
      .eq('is_active', true)
      .order('staff_type').order('full_name')
      .then(({ data }) => setStaff((data ?? []) as StaffMember[]))
  }, [])

  const dateStr = fmtDate(date)

  const loadAttendance = useCallback(async () => {
    if (staff.length === 0) return
    setLoading(true)
    const { data } = await supabase
      .from('staff_attendance')
      .select('*')
      .eq('date', dateStr)

    const map: Record<string, AttendanceRow> = {}
    // Init all staff with empty rows
    staff.forEach(s => {
      map[s.id] = {
        staff_id:  s.id, date: dateStr,
        status:    'presente',
        check_in:  '07:00', check_out: '15:00',
        notes:     '', saved: false, dirty: false,
      }
    })
    // Fill saved records
    ;(data ?? []).forEach((r: any) => {
      if (map[r.staff_id]) {
        map[r.staff_id] = {
          staff_id:  r.staff_id, date: r.date,
          status:    r.status,
          check_in:  r.check_in   ? r.check_in.slice(0,5)  : '',
          check_out: r.check_out  ? r.check_out.slice(0,5) : '',
          notes:     r.notes ?? '',
          saved: true, dirty: false,
        }
      }
    })
    setRows(map)
    setLoading(false)
  }, [staff, dateStr])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadAttendance().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadAttendance])

  const updateRow = (staffId: string, field: keyof AttendanceRow, value: string) => {
    setRows(prev => ({
      ...prev,
      [staffId]: { ...prev[staffId], [field]: value, dirty: true },
    }))
  }

  const saveRow = async (staffId: string) => {
    const row = rows[staffId]
    if (!row) return
    setSaving(staffId)
    const payload = {
      staff_id:    row.staff_id,
      date:        row.date,
      status:      row.status,
      check_in:    row.check_in  || null,
      check_out:   row.check_out || null,
      notes:       row.notes     || null,
      recorded_by: profile?.id,
    }
    const { error } = await supabase
      .from('staff_attendance')
      .upsert(payload, { onConflict: 'staff_id,date' })
    setSaving(null)
    if (error) { toast.error('Error al guardar'); return }
    setRows(prev => ({ ...prev, [staffId]: { ...prev[staffId], saved: true, dirty: false } }))
    toast.success('Guardado')
  }

  const saveAll = async () => {
    const dirty = Object.values(rows).filter(r => r.dirty)
    if (dirty.length === 0) { toast('Sin cambios pendientes'); return }
    setSavingAll(true)
    const payloads = dirty.map(row => ({
      staff_id:    row.staff_id,
      date:        row.date,
      status:      row.status,
      check_in:    row.check_in  || null,
      check_out:   row.check_out || null,
      notes:       row.notes     || null,
      recorded_by: profile?.id,
    }))
    const { error } = await supabase
      .from('staff_attendance')
      .upsert(payloads, { onConflict: 'staff_id,date' })
    setSavingAll(false)
    if (error) { toast.error('Error al guardar'); return }
    setRows(prev => {
      const next = { ...prev }
      dirty.forEach(r => { next[r.staff_id] = { ...next[r.staff_id], saved: true, dirty: false } })
      return next
    })
    toast.success(`${dirty.length} registro${dirty.length > 1 ? 's' : ''} guardado${dirty.length > 1 ? 's' : ''}`)
  }

  // Stats
  const counts = Object.values(rows).reduce(
    (acc, r) => {
      if (!r.saved && !r.dirty) acc.sin++
      else acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { presente: 0, ausente: 0, tardanza: 0, permiso: 0, vacaciones: 0, sin: 0 } as Record<string, number>
  )
  const dirtyCount = Object.values(rows).filter(r => r.dirty).length

  const statusColor = (s: string) =>
    STATUS_OPTIONS.find(o => o.value === s)?.color ?? 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Asistencia del Personal</h1>
          <p className="page-subtitle">{staff.length} empleados activos</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date navigator */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
            <button onClick={() => setDate(d => addDays(d, -1))}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <input type="date" value={dateStr}
              onChange={e => setDate(new Date(e.target.value + 'T12:00:00'))}
              className="text-sm font-medium text-slate-800 focus:outline-none bg-transparent" />
            <button onClick={() => setDate(d => addDays(d, 1))}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <button onClick={() => setDate(new Date())}
            className="btn-secondary text-sm py-2">
            <Calendar className="w-3.5 h-3.5" /> Hoy
          </button>
          <button onClick={saveAll} disabled={savingAll || dirtyCount === 0}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            {savingAll
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Save className="w-4 h-4" />}
            Guardar Todo {dirtyCount > 0 && `(${dirtyCount})`}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { key: 'presente',   label: 'Presentes',   icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, count: counts.presente },
          { key: 'ausente',    label: 'Ausentes',    icon: <XCircle className="w-4 h-4 text-red-500" />,          count: counts.ausente },
          { key: 'tardanza',   label: 'Tardanzas',   icon: <AlertCircle className="w-4 h-4 text-amber-500" />,    count: counts.tardanza },
          { key: 'permiso',    label: 'Permiso',     icon: <Clock className="w-4 h-4 text-blue-500" />,           count: counts.permiso },
          { key: 'vacaciones', label: 'Vacaciones',  icon: <Users className="w-4 h-4 text-violet-500" />,         count: counts.vacaciones },
          { key: 'sin',        label: 'Sin registrar',icon: <Clock className="w-4 h-4 text-slate-400" />,         count: counts.sin },
        ].map(s => (
          <div key={s.key} className="card p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">{s.icon}<span className="text-xs text-slate-500">{s.label}</span></div>
            <p className="text-xl font-bold text-slate-900">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No hay personal activo registrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Entrada</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Salida</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Notas</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staff.map(s => {
                  const row = rows[s.id]
                  if (!row) return null
                  const isSaving = saving === s.id
                  const sColor = statusColor(row.status)
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${row.dirty ? 'bg-amber-50/40' : ''}`}>
                      {/* Empleado */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0 overflow-hidden">
                            {s.photo_url
                              ? <img src={s.photo_url} className="w-full h-full object-cover" alt="" />
                              : <span className="text-white text-xs font-bold">{getInitials(s.full_name)}</span>
                            }
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 text-sm leading-tight">{s.full_name}</p>
                            <p className="text-[11px] text-slate-400">{STAFF_TYPE_LABELS[s.staff_type] ?? s.staff_type}</p>
                          </div>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <select
                          value={row.status}
                          onChange={e => updateRow(s.id, 'status', e.target.value)}
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-full border focus:outline-none cursor-pointer ${sColor}`}
                        >
                          {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* Entrada */}
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={row.check_in}
                          onChange={e => updateRow(s.id, 'check_in', e.target.value)}
                          className="text-sm font-mono px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-eos-500 w-28"
                          disabled={row.status === 'ausente' || row.status === 'vacaciones'}
                        />
                      </td>

                      {/* Salida */}
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={row.check_out}
                          onChange={e => updateRow(s.id, 'check_out', e.target.value)}
                          className="text-sm font-mono px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-eos-500 w-28"
                          disabled={row.status === 'ausente' || row.status === 'vacaciones'}
                        />
                      </td>

                      {/* Notas */}
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={e => updateRow(s.id, 'notes', e.target.value)}
                          placeholder="Observación..."
                          className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-eos-500 w-40"
                        />
                      </td>

                      {/* Save */}
                      <td className="px-4 py-3">
                        {row.dirty ? (
                          <button onClick={() => saveRow(s.id)} disabled={isSaving}
                            className="p-1.5 bg-eos-600 text-white rounded-lg hover:bg-eos-700 transition-colors disabled:opacity-50">
                            {isSaving
                              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Save className="w-3.5 h-3.5" />
                            }
                          </button>
                        ) : row.saved ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-200 mx-auto" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
