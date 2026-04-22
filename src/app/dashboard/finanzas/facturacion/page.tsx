'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  Receipt, Plus, X, AlertTriangle, CheckCircle,
  Clock, ShieldOff, Shield, RefreshCw, Calendar, DollarSign
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

interface BillingPeriod {
  id: string
  name: string
  year: number
  month: number
  due_date: string
  late_fee_amount: number
  late_fee_type: 'fixed' | 'percentage'
  is_active: boolean
}

interface Invoice {
  id: string
  student_id: string
  billing_period_id: string | null
  concept: string
  amount: number
  due_date: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partial'
  notes: string | null
  created_at: string
  student?: { enrollment_number: string; profile?: { full_name: string } | null }
  billing_period?: { name: string }
}

interface AccessFlag {
  id: string
  student_id: string
  is_blocked: boolean
  block_reason: string | null
  blocked_modules: string[]
  blocked_since: string | null
  last_payment_date: string | null
  student?: { enrollment_number: string; profile?: { full_name: string } | null }
}

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  paid:      { label: 'Pagado',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  overdue:   { label: 'Vencido',   color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  cancelled: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500', icon: X },
  partial:   { label: 'Parcial',   color: 'bg-blue-100 text-blue-700', icon: Clock },
}

const MONTHS = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function FacturacionPage() {
  const { profile } = useAuth()

  const [tab, setTab]               = useState<'facturas' | 'periodos' | 'bloqueos'>('facturas')
  const [invoices, setInvoices]     = useState<Invoice[]>([])
  const [periods, setPeriods]       = useState<BillingPeriod[]>([])
  const [flags, setFlags]           = useState<AccessFlag[]>([])
  const [students, setStudents]     = useState<{ id: string; enrollment_number: string; profile?: { full_name: string } | null }[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [loading, setLoading]       = useState(true)
  const [showInvModal, setShowInvModal]   = useState(false)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [showBlockModal, setShowBlockModal]   = useState(false)
  const [blockTarget, setBlockTarget]         = useState<AccessFlag | null>(null)
  const [saving, setSaving] = useState(false)

  const [invForm, setInvForm] = useState({
    student_id: '', billing_period_id: '', concept: '', amount: '',
    due_date: '', status: 'pending', notes: '',
  })
  const [periodForm, setPeriodForm] = useState({
    name: '', year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    due_date: '', late_fee_amount: '0', late_fee_type: 'fixed',
  })
  const [blockForm, setBlockForm] = useState({
    is_blocked: true, block_reason: '', blocked_modules: [] as string[],
  })

  const ALL_MODULES = ['aulas', 'calificaciones', 'biblioteca', 'horarios']

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        student:students(enrollment_number, profile:profiles(full_name)),
        billing_period:billing_periods(name)
      `)
      .order('created_at', { ascending: false })
    setInvoices((data ?? []) as Invoice[])
    setLoading(false)
  }, [])

  const loadPeriods = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('billing_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false })
    setPeriods((data ?? []) as BillingPeriod[])
    setLoading(false)
  }, [])

  const loadFlags = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('access_flags')
      .select(`*, student:students(enrollment_number, profile:profiles(full_name))`)
      .order('updated_at', { ascending: false })
    setFlags((data ?? []) as AccessFlag[])
    setLoading(false)
  }, [])

  const loadStudents = useCallback(async () => {
    const { data } = await supabase
      .from('students')
      .select('id, enrollment_number, profile:profiles(full_name)')
      .eq('is_active', true).order('enrollment_number')
    setStudents((data ?? []) as typeof students)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    const fn = async () => {
      loadStudents()
      if (tab === 'facturas') await loadInvoices()
      else if (tab === 'periodos') await loadPeriods()
      else await loadFlags()
    }
    fn().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [tab, loadInvoices, loadPeriods, loadFlags, loadStudents])

  // Summary stats from invoices
  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0)
  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
  const blockedCount = flags.filter(f => f.is_blocked).length

  const filteredInvoices = filterStatus === 'all'
    ? invoices
    : invoices.filter(i => i.status === filterStatus)

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const handleSaveInvoice = async () => {
    if (!invForm.student_id || !invForm.concept || !invForm.amount || !invForm.due_date) {
      toast.error('Todos los campos marcados son obligatorios')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('invoices').insert({
      student_id:        invForm.student_id,
      billing_period_id: invForm.billing_period_id || null,
      concept:           invForm.concept,
      amount:            parseFloat(invForm.amount),
      due_date:          invForm.due_date,
      status:            invForm.status,
      notes:             invForm.notes || null,
      created_by:        profile!.id,
    })
    setSaving(false)
    if (error) { toast.error('Error al crear factura'); return }
    toast.success('Factura creada')
    setShowInvModal(false)
    loadInvoices()
  }

  const handleUpdateStatus = async (id: string, status: Invoice['status']) => {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) { toast.error('Error'); return }
    toast.success('Estado actualizado')
    loadInvoices()
  }

  const handleSavePeriod = async () => {
    if (!periodForm.name || !periodForm.due_date) {
      toast.error('Nombre y fecha límite son obligatorios')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('billing_periods').insert({
      name:             periodForm.name,
      year:             parseInt(periodForm.year),
      month:            parseInt(periodForm.month),
      due_date:         periodForm.due_date,
      late_fee_amount:  parseFloat(periodForm.late_fee_amount) || 0,
      late_fee_type:    periodForm.late_fee_type,
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Error al crear periodo'); return }
    toast.success('Periodo de facturación creado')
    setShowPeriodModal(false)
    loadPeriods()
  }

  const openBlockModal = (flag: AccessFlag) => {
    setBlockTarget(flag)
    setBlockForm({
      is_blocked:      !flag.is_blocked,
      block_reason:    flag.block_reason ?? '',
      blocked_modules: flag.blocked_modules ?? [],
    })
    setShowBlockModal(true)
  }

  const openNewBlock = async (studentId: string) => {
    // Check if flag exists
    const { data } = await supabase.from('access_flags').select('*').eq('student_id', studentId).maybeSingle()
    if (data) {
      openBlockModal(data as AccessFlag)
    } else {
      setBlockTarget({ id: '', student_id: studentId, is_blocked: false,
        block_reason: null, blocked_modules: [], blocked_since: null, last_payment_date: null })
      setBlockForm({ is_blocked: true, block_reason: '', blocked_modules: [] })
      setShowBlockModal(true)
    }
  }

  const handleSaveBlock = async () => {
    if (!blockTarget) return
    setSaving(true)

    const payload = {
      student_id:      blockTarget.student_id,
      is_blocked:      blockForm.is_blocked,
      block_reason:    blockForm.block_reason || null,
      blocked_modules: blockForm.blocked_modules,
      blocked_since:   blockForm.is_blocked ? new Date().toISOString().split('T')[0] : null,
      updated_at:      new Date().toISOString(),
    }

    let error
    if (!blockTarget.id) {
      ({ error } = await supabase.from('access_flags').insert(payload))
    } else {
      ({ error } = await supabase.from('access_flags').update(payload).eq('id', blockTarget.id))
    }
    setSaving(false)
    if (error) { toast.error('Error al guardar bloqueo'); return }
    toast.success(blockForm.is_blocked ? 'Estudiante bloqueado' : 'Bloqueo levantado')
    setShowBlockModal(false)
    loadFlags()
  }

  const toggleModule = (mod: string) => {
    setBlockForm(p => ({
      ...p,
      blocked_modules: p.blocked_modules.includes(mod)
        ? p.blocked_modules.filter(m => m !== mod)
        : [...p.blocked_modules, mod],
    }))
  }

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="page-title">Facturación</h1>
            <p className="page-subtitle">Cobros, facturas y control de acceso por mora</p>
          </div>
        </div>
        {tab === 'facturas' && (
          <button onClick={() => setShowInvModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Nueva Factura
          </button>
        )}
        {tab === 'periodos' && (
          <button onClick={() => setShowPeriodModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo Periodo
          </button>
        )}
        {tab === 'bloqueos' && (
          <button onClick={() => {
            setBlockTarget({ id: '', student_id: '', is_blocked: true,
              block_reason: null, blocked_modules: [], blocked_since: null, last_payment_date: null })
            setBlockForm({ is_blocked: true, block_reason: '', blocked_modules: [] })
            setShowBlockModal(true)
          }} className="btn-primary">
            <ShieldOff className="w-4 h-4" /> Nuevo Bloqueo
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pendiente',  value: fmt(totalPending), color: 'text-amber-600',   bg: 'bg-amber-50', icon: Clock },
          { label: 'Vencido',    value: fmt(totalOverdue), color: 'text-red-600',     bg: 'bg-red-50',   icon: AlertTriangle },
          { label: 'Cobrado',    value: fmt(totalPaid),    color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          { label: 'Bloqueados', value: String(blockedCount), color: 'text-slate-600', bg: 'bg-slate-100', icon: ShieldOff },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={`card p-4 flex items-center gap-3 ${s.bg}`}>
              <Icon className={`w-5 h-5 shrink-0 ${s.color}`} />
              <div>
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
                <p className={`font-bold text-lg ${s.color}`}>{s.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit">
        {([['facturas','Facturas'],['periodos','Periodos'],['bloqueos','Control Acceso']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2 text-sm font-medium transition-colors
              ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── INVOICES ── */}
      {tab === 'facturas' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {['all','pending','paid','overdue','partial','cancelled'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${filterStatus === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                {s === 'all' ? 'Todos' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label ?? s}
              </button>
            ))}
          </div>

          <div className="card">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Cargando facturas...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No hay facturas</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredInvoices.map(inv => {
                  const cfg  = STATUS_CONFIG[inv.status]
                  const Icon = cfg.icon
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-4 gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-slate-900">{inv.student?.profile?.full_name}</p>
                        <p className="text-xs text-slate-500">{inv.concept}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          #{inv.student?.enrollment_number}
                          {inv.billing_period && ` · ${inv.billing_period.name}`}
                          {' · Vence: '}{new Date(inv.due_date + 'T12:00:00').toLocaleDateString('es-CR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.color}`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">{fmt(inv.amount)}</span>
                        {inv.status === 'pending' && (
                          <button onClick={() => handleUpdateStatus(inv.id, 'paid')}
                            className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium">
                            Marcar Pagado
                          </button>
                        )}
                        {inv.status === 'pending' && new Date(inv.due_date) < new Date() && (
                          <button onClick={() => handleUpdateStatus(inv.id, 'overdue')}
                            className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium">
                            Marcar Vencido
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PERIODS ── */}
      {tab === 'periodos' && (
        <div className="card">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Cargando periodos...</div>
          ) : periods.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No hay periodos creados</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {periods.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {MONTHS[p.month]} {p.year} · Vence:{' '}
                        {new Date(p.due_date + 'T12:00:00').toLocaleDateString('es-CR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.late_fee_amount > 0 && (
                      <span className="text-xs text-amber-600 font-medium">
                        Mora: {p.late_fee_type === 'fixed' ? fmt(p.late_fee_amount) : `${p.late_fee_amount}%`}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-1 rounded-full
                      ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ACCESS FLAGS ── */}
      {tab === 'bloqueos' && (
        <div className="space-y-4">
          {/* Blocked students */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-800">
                Estudiantes con Restricción ({flags.filter(f => f.is_blocked).length})
              </h3>
              <button onClick={loadFlags} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Cargando...</div>
            ) : flags.filter(f => f.is_blocked).length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <Shield className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                Sin estudiantes bloqueados
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {flags.filter(f => f.is_blocked).map(flag => (
                  <div key={flag.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <ShieldOff className="w-4 h-4 text-red-500" />
                        <p className="font-medium text-sm text-slate-900">{flag.student?.profile?.full_name}</p>
                      </div>
                      <p className="text-xs text-slate-400">#{flag.student?.enrollment_number}</p>
                      {flag.block_reason && (
                        <p className="text-xs text-red-500 mt-0.5">{flag.block_reason}</p>
                      )}
                      {flag.blocked_modules.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {flag.blocked_modules.map(m => (
                            <span key={m} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => openBlockModal(flag)}
                      className="btn-secondary text-xs py-1.5 px-3">
                      <Shield className="w-3.5 h-3.5" /> Levantar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick block: students without flag */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-sm text-slate-800">Bloquear Estudiante</h3>
            </div>
            <div className="p-5">
              <select className="input max-w-sm"
                onChange={e => { if (e.target.value) openNewBlock(e.target.value) }}
                defaultValue="">
                <option value="" disabled>Seleccionar estudiante para bloquear...</option>
                {students.filter(s => !flags.find(f => f.student_id === s.id && f.is_blocked)).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.profile?.full_name} — #{s.enrollment_number}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICE MODAL ── */}
      {showInvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Nueva Factura</h2>
              <button onClick={() => setShowInvModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Estudiante *</label>
                <select className="input" value={invForm.student_id}
                  onChange={e => setInvForm(p => ({ ...p, student_id: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.profile?.full_name} — #{s.enrollment_number}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Periodo de facturación</label>
                <select className="input" value={invForm.billing_period_id}
                  onChange={e => setInvForm(p => ({ ...p, billing_period_id: e.target.value }))}>
                  <option value="">Sin periodo</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Concepto *</label>
                <input className="input" value={invForm.concept}
                  onChange={e => setInvForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Ej: Mensualidad Enero 2025" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Monto ($) *</label>
                  <input type="number" className="input" step="0.01" min="0" value={invForm.amount}
                    onChange={e => setInvForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label className="label">Fecha límite *</label>
                  <input type="date" className="input" value={invForm.due_date}
                    onChange={e => setInvForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Estado inicial</label>
                <select className="input" value={invForm.status}
                  onChange={e => setInvForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                </select>
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea className="input resize-none" rows={2} value={invForm.notes}
                  onChange={e => setInvForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowInvModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveInvoice} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Crear Factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PERIOD MODAL ── */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Nuevo Periodo de Facturación</h2>
              <button onClick={() => setShowPeriodModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" value={periodForm.name}
                  onChange={e => setPeriodForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Mensualidad Enero 2025" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Año</label>
                  <input type="number" className="input" value={periodForm.year}
                    onChange={e => setPeriodForm(p => ({ ...p, year: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Mes</label>
                  <select className="input" value={periodForm.month}
                    onChange={e => setPeriodForm(p => ({ ...p, month: e.target.value }))}>
                    {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Fecha límite de pago *</label>
                <input type="date" className="input" value={periodForm.due_date}
                  onChange={e => setPeriodForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Mora</label>
                  <input type="number" className="input" step="0.01" min="0" value={periodForm.late_fee_amount}
                    onChange={e => setPeriodForm(p => ({ ...p, late_fee_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Tipo de mora</label>
                  <select className="input" value={periodForm.late_fee_type}
                    onChange={e => setPeriodForm(p => ({ ...p, late_fee_type: e.target.value }))}>
                    <option value="fixed">Fijo ($)</option>
                    <option value="percentage">Porcentaje (%)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowPeriodModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSavePeriod} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Crear Periodo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BLOCK MODAL ── */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {blockForm.is_blocked ? 'Bloquear Acceso' : 'Levantar Bloqueo'}
              </h2>
              <button onClick={() => setShowBlockModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Student selector for new block */}
              {!blockTarget?.id && !blockTarget?.student_id && (
                <div>
                  <label className="label">Estudiante *</label>
                  <select className="input" value={blockTarget?.student_id ?? ''}
                    onChange={e => setBlockTarget(p => p ? { ...p, student_id: e.target.value } : p)}>
                    <option value="">Seleccionar...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.profile?.full_name} — #{s.enrollment_number}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Motivo del bloqueo</label>
                <textarea className="input resize-none" rows={2} value={blockForm.block_reason}
                  onChange={e => setBlockForm(p => ({ ...p, block_reason: e.target.value }))}
                  placeholder="Ej: Mensualidad vencida desde Enero 2025" />
              </div>
              <div>
                <label className="label mb-2">Módulos bloqueados</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_MODULES.map(mod => (
                    <label key={mod} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded"
                        checked={blockForm.blocked_modules.includes(mod)}
                        onChange={() => toggleModule(mod)} />
                      <span className="text-sm text-slate-700 capitalize">{mod}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200">
                <input type="checkbox" className="w-4 h-4 rounded"
                  checked={blockForm.is_blocked}
                  onChange={e => setBlockForm(p => ({ ...p, is_blocked: e.target.checked }))} />
                <span className="text-sm font-medium text-slate-700">Bloqueo activo</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowBlockModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveBlock} disabled={saving}
                className={`btn-primary ${!blockForm.is_blocked ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}>
                {saving ? 'Guardando...' : blockForm.is_blocked ? 'Aplicar Bloqueo' : 'Levantar Bloqueo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
