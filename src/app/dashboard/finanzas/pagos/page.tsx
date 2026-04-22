'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  Plus, CheckCircle, Clock, AlertCircle, FileText,
  TriangleAlert, ChevronDown, DollarSign, Users,
  Search, Zap, Calendar, Pencil, RotateCcw, ShieldAlert,
  LayoutList, Table2, ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'
import Modal from '@/components/ui/Modal'
import type { Payment } from '@/types/database'

// ── Constants ──────────────────────────────────────────────────────────────────
const LATE_FEE = 25
const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const SUPER_ADMIN_IDS = ['diego.visionyproyectos@gmail.com', 'diana_mendoza']
const CY = new Date().getFullYear() // current year

const STATUS_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  paid:      { label: 'Pagado',    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-400' },
  pending:   { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 border border-amber-200',       dot: 'bg-amber-300' },
  overdue:   { label: 'Vencido',   cls: 'bg-red-50 text-red-700 border border-red-200',             dot: 'bg-red-400' },
  cancelled: { label: 'Cancelado', cls: 'bg-slate-50 text-slate-500 border border-slate-200',       dot: 'bg-slate-300' },
}

// ── Types ──────────────────────────────────────────────────────────────────────
type PaymentExt = Payment & {
  folio_hacienda?: string | null
  due_date?: string | null
  late_fee_applied?: boolean | null
}

interface StudentRow {
  id: string
  full_name: string
  enrollment_number: string
  grade_level: string
  section: string
  monthly_fee: number | null
  payments: PaymentExt[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function effectiveDate(p: PaymentExt): string | null { return p.due_date || p.payment_date || null }
// Month/year assignment ALWAYS uses due_date (the month that is owed),
// not payment_date (when the parent actually paid). This ensures a
// January fee paid in May still shows under January.
function paymentMonth(p: PaymentExt): number | null {
  const d = p.due_date || effectiveDate(p); if (!d) return null
  return new Date(d + 'T12:00:00').getMonth() + 1
}
function paymentYear(p: PaymentExt): number | null {
  const d = p.due_date || effectiveDate(p); if (!d) return null
  return new Date(d + 'T12:00:00').getFullYear()
}
function dueLabel(p: PaymentExt): string {
  const d = p.due_date || effectiveDate(p); if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`
}
function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
}
// Returns the actual payment receipt date (when money was received)
function paidOn(p: PaymentExt): string | null {
  if (p.status !== 'paid') return null
  return p.payment_date ?? null
}
function sortPayments(pays: PaymentExt[], asc: boolean): PaymentExt[] {
  return [...pays].sort((a, b) => {
    const da = effectiveDate(a) ?? '', db = effectiveDate(b) ?? ''
    return asc ? da.localeCompare(db) : db.localeCompare(da)
  })
}
function getExpediente(s: StudentRow, year = CY) {
  const yp = s.payments.filter(p => paymentYear(p) === year)
  const paid    = yp.filter(p => p.status === 'paid')
  const pending = yp.filter(p => p.status === 'pending')
  const overdue = yp.filter(p => p.status === 'overdue')
  const mora    = yp.filter(p => p.late_fee_applied).reduce((sum, p) => sum + LATE_FEE, 0)
  return {
    totalPaid:    paid.reduce((s, p) => s + Number(p.amount), 0),
    totalPending: pending.reduce((s, p) => s + Number(p.amount), 0),
    totalOverdue: overdue.reduce((s, p) => s + Number(p.amount), 0),
    mora,
    paidCount:    paid.length,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    total:        yp.length,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function PagosPage() {
  const { profile, blockedModules } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (blockedModules.includes('finanzas')) {
      router.replace('/dashboard/administracion')
    }
  }, [blockedModules, router])

  const canEdit = ['master', 'administracion', 'contabilidad'].includes(profile?.role ?? '')
  const isSuperAdmin = SUPER_ADMIN_IDS.some(id =>
    profile?.email === id || profile?.email?.startsWith(id + '@'))
  const EDIT_PAYMENT_USERS = ['carlos_nunfio', 'diana_mendoza', 'diego.visionyproyectos@gmail.com']
  const canEditPayments = canEdit && EDIT_PAYMENT_USERS.some(id =>
    profile?.email === id || profile?.email?.startsWith(id + '@'))

  // ── Data ───────────────────────────────────────────────────────
  const [students, setStudents]         = useState<StudentRow[]>([])
  const [studentFees, setStudentFees]   = useState<Record<string, number>>({})
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  // ── UI ─────────────────────────────────────────────────────────
  const [viewMode, setViewMode]         = useState<'general' | 'mensual'>('general')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all')
  const [monthSel, setMonthSel]         = useState<number>(new Date().getMonth() + 1)
  const [sortAsc, setSortAsc]           = useState(true)
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())

  // Modals
  const [genModal, setGenModal]         = useState(false)
  const [genMonth, setGenMonth]         = useState(new Date().getMonth() + 1)
  const [genYear, setGenYear]           = useState(CY)
  const [genAll12, setGenAll12]         = useState(false)
  const [payModal, setPayModal]         = useState<PaymentExt | null>(null)
  const [payForm, setPayForm]           = useState({
    folio_hacienda: '', payment_method: 'cash',
    payment_date: new Date().toISOString().split('T')[0], notes: '',
  })
  const [editModal, setEditModal]       = useState<PaymentExt | null>(null)
  const [editForm, setEditForm]         = useState({ status: 'pending', amount: '', due_date: '' })
  const [undoSnapshot, setUndoSnapshot] = useState<{ id: string; status: string; amount: number; late_fee_applied: boolean | null }[] | null>(null)
  const [manualModal, setManualModal]   = useState(false)
  const [manualForm, setManualForm]     = useState({
    student_id: '', amount: '', concept: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash', status: 'paid',
    folio_hacienda: '', receipt_number: '', notes: '',
  })
  const [stuSearch, setStuSearch]       = useState('')
  const [stuDropdown, setStuDropdown]   = useState(false)

  // ── Load data ──────────────────────────────────────────────────
  const loadData = useCallback(async (): Promise<StudentRow[]> => {
    setLoading(true)
    try {
      const db = supabase as any
      const [{ data: studs }, { data: fees }, { data: pays }] = await Promise.all([
        db.from('students')
          .select('id, enrollment_number, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
          .eq('is_active', true).order('grade_level').order('section'),
        db.from('student_fees').select('student_id, monthly_amount'),
        db.from('payments').select('*')
          .order('due_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      const feeMap: Record<string, number> = {}
      for (const f of (fees ?? [])) feeMap[f.student_id] = Number(f.monthly_amount)
      setStudentFees(feeMap)
      const payMap: Record<string, PaymentExt[]> = {}
      for (const p of (pays ?? [])) {
        if (!payMap[p.student_id]) payMap[p.student_id] = []
        payMap[p.student_id].push(p)
      }
      const rows: StudentRow[] = (studs ?? []).map((s: any) => ({
        id: s.id, full_name: s.profile?.full_name ?? s.enrollment_number,
        enrollment_number: s.enrollment_number ?? '—',
        grade_level: s.grade_level ?? '—', section: s.section ?? '',
        monthly_fee: feeMap[s.id] ?? null, payments: payMap[s.id] ?? [],
      })).sort((a: StudentRow, b: StudentRow) => a.full_name.localeCompare(b.full_name))
      setStudents(rows)
      return rows
    } catch { toast.error('Error al cargar datos'); return [] }
    finally { setLoading(false) }
  }, [])

  // ── Auto-generate 12 payments for current year ────────────────
  // Returns number of records created. Does NOT call loadData (caller handles reload).
  const ensureYearPayments = useCallback(async (rows: StudentRow[]): Promise<number> => {
    const db = supabase as any
    const toInsert: any[] = []
    for (const s of rows) {
      if (s.monthly_fee == null) continue
      for (let m = 1; m <= 12; m++) {
        const exists = s.payments.some(p => paymentYear(p) === CY && paymentMonth(p) === m)
        if (!exists) toInsert.push({
          student_id: s.id, amount: s.monthly_fee,
          concept: `Mensualidad ${MONTH_NAMES[m - 1]} ${CY}`,
          due_date: `${CY}-${String(m).padStart(2, '0')}-01`,
          payment_date: `${CY}-${String(m).padStart(2, '0')}-01`,
          payment_method: 'cash', status: 'pending', late_fee_applied: false,
        })
      }
    }
    if (toInsert.length === 0) return 0
    let created = 0
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await (db as any).from('payments').insert(toInsert.slice(i, i + 50))
      if (!error) created += toInsert.slice(i, i + 50).length
    }
    return created
  }, []) // no loadData dep — caller reloads

  useEffect(() => {
    const init = async () => {
      const rows = await loadData()
      const created = await ensureYearPayments(rows)
      if (created > 0) loadData() // reload once to show new payments
    }
    init()
  }, [loadData, ensureYearPayments])

  // ── Stats ──────────────────────────────────────────────────────
  const allPayments = useMemo(() => students.flatMap(s => s.payments), [students])

  // Month-scoped payments for stats (current year only)
  const monthPayments = useMemo(() =>
    allPayments.filter(p => paymentYear(p) === CY && paymentMonth(p) === monthSel),
    [allPayments, monthSel])

  const globalStats = useMemo(() => ({
    paid:    allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
    pending: allPayments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0),
    overdue: allPayments.filter(p => p.status === 'overdue').reduce((s, p) => s + Number(p.amount), 0),
    sinFolio: allPayments.filter(p => p.status === 'paid' && !p.folio_hacienda).length,
    withFee: students.filter(s => s.monthly_fee != null).length,
  }), [allPayments, students])

  const monthStats = useMemo(() => ({
    paid:    monthPayments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
    pending: monthPayments.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((s, p) => s + Number(p.amount), 0),
    overdue: monthPayments.filter(p => p.status === 'overdue').reduce((s, p) => s + Number(p.amount), 0),
    paidCount:    monthPayments.filter(p => p.status === 'paid').length,
    pendingCount: monthPayments.filter(p => p.status === 'pending').length,
    overdueCount: monthPayments.filter(p => p.status === 'overdue').length,
  }), [monthPayments])

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = students
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        s.enrollment_number.toLowerCase().includes(q) ||
        s.grade_level.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => {
        const pays = s.payments.filter(p => paymentYear(p) === CY && paymentMonth(p) === monthSel)
        return pays.some(p => p.status === statusFilter)
      })
    }
    return list
  }, [students, search, statusFilter, monthSel])

  // Grouped by grade for mensual view
  const byGrade = useMemo(() => {
    const groups: Record<string, StudentRow[]> = {}
    for (const s of filtered) {
      const key = `${s.grade_level}${s.section ? ' ' + s.section : ''}`
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  }, [filtered])

  // ── Toggle expand ──────────────────────────────────────────────
  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Bulk helpers ───────────────────────────────────────────────
  const getBulkTargets = (statuses: string[]) =>
    filtered.flatMap(s =>
      s.payments.filter(p => statuses.includes(p.status) && paymentYear(p) === CY && paymentMonth(p) === monthSel)
    )

  const handleBulkPending = async () => {
    const targets = getBulkTargets(['overdue', 'cancelled'])
    if (!targets.length) { toast('No hay pagos vencidos para resetear'); return }
    if (!confirm(`¿Marcar ${targets.length} pago${targets.length > 1 ? 's' : ''} de ${MONTH_NAMES[monthSel - 1]} como Pendiente?`)) return
    setSaving(true)
    const db = supabase as any
    const snap = targets.map(p => ({ id: p.id, status: p.status, amount: Number(p.amount), late_fee_applied: p.late_fee_applied ?? null }))
    let ok = 0
    for (const p of targets) if (!(await db.from('payments').update({ status: 'pending' }).eq('id', p.id)).error) ok++
    setSaving(false)
    if (ok) { setUndoSnapshot(snap); toast.success(`${ok} pago${ok > 1 ? 's' : ''} marcado${ok > 1 ? 's' : ''} como pendiente`) }
    loadData()
  }

  const handleBulkOverdue = async () => {
    const todayISO = new Date().toISOString().slice(0, 10)
    const targets = getBulkTargets(['pending']).filter(p => !p.due_date || p.due_date <= todayISO)
    if (!targets.length) { toast('No hay pagos vencidos para este mes (el mes aún no ha llegado)'); return }
    if (!confirm(`¿Marcar ${targets.length} pago${targets.length > 1 ? 's' : ''} de ${MONTH_NAMES[monthSel - 1]} como Vencido (+$${LATE_FEE} mora)?`)) return
    setSaving(true)
    const db = supabase as any
    const snap = targets.map(p => ({ id: p.id, status: p.status, amount: Number(p.amount), late_fee_applied: p.late_fee_applied ?? null }))
    let ok = 0
    for (const p of targets) {
      const amt = p.late_fee_applied ? Number(p.amount) : Number(p.amount) + LATE_FEE
      if (!(await db.from('payments').update({ status: 'overdue', amount: amt, late_fee_applied: true }).eq('id', p.id)).error) ok++
    }
    setSaving(false)
    if (ok) { setUndoSnapshot(snap); toast.success(`${ok} pago${ok > 1 ? 's' : ''} marcados como vencidos (+$${LATE_FEE} mora)`) }
    loadData()
  }

  const handleBulkPaid = async () => {
    const targets = getBulkTargets(['pending', 'overdue'])
    if (!targets.length) { toast('No hay pagos pendientes/vencidos'); return }
    if (!confirm(`¿Marcar ${targets.length} pago${targets.length > 1 ? 's' : ''} de ${MONTH_NAMES[monthSel - 1]} como Pagado?`)) return
    setSaving(true)
    const db = supabase as any
    const today = new Date().toISOString().split('T')[0]
    let ok = 0
    for (const p of targets) if (!(await db.from('payments').update({ status: 'paid', payment_date: today }).eq('id', p.id)).error) ok++
    setSaving(false)
    if (ok) toast.success(`${ok} pago${ok > 1 ? 's' : ''} marcados como pagados`)
    loadData()
  }

  const handleUndo = async () => {
    if (!undoSnapshot?.length) return
    setSaving(true)
    const db = supabase as any
    for (const s of undoSnapshot)
      await db.from('payments').update({ status: s.status, amount: s.amount, late_fee_applied: s.late_fee_applied }).eq('id', s.id)
    setSaving(false); setUndoSnapshot(null)
    toast.success('Cambio revertido'); loadData()
  }

  // ── Generate ───────────────────────────────────────────────────
  const handleGenerate = async () => {
    const withFee = students.filter(s => s.monthly_fee != null)
    if (!withFee.length) { toast.error('No hay estudiantes con cuota asignada'); return }
    setSaving(true)
    const db = supabase as any
    const months = genAll12 ? Array.from({ length: 12 }, (_, i) => i + 1) : [genMonth]
    let created = 0, skipped = 0
    for (const m of months) {
      const dueDate = `${genYear}-${String(m).padStart(2, '0')}-01`
      const concept = `Mensualidad ${MONTH_NAMES[m - 1]} ${genYear}`
      for (const s of withFee) {
        const exists = s.payments.some(p => paymentYear(p) === genYear && paymentMonth(p) === m)
        if (exists) { skipped++; continue }
        if (!(await db.from('payments').insert({ student_id: s.id, amount: s.monthly_fee, concept, due_date: dueDate, payment_date: dueDate, payment_method: 'cash', status: 'pending', late_fee_applied: false })).error) created++
      }
    }
    setSaving(false); setGenModal(false)
    toast.success(created > 0 ? `${created} pagos generados${skipped > 0 ? ` · ${skipped} ya existían` : ''}` : 'Todos los pagos ya existen')
    loadData()
  }

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete = async (p: PaymentExt) => {
    if (!confirm(`¿Eliminar "${p.concept ?? '—'}" ($${Number(p.amount).toFixed(2)})?`)) return
    const db = supabase as any
    const { error } = await db.from('payments').delete().eq('id', p.id)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Pago eliminado'); loadData()
  }

  // ── Edit modal ─────────────────────────────────────────────────
  const openEditModal = (p: PaymentExt) => {
    setEditModal(p)
    setEditForm({ status: p.status, amount: String(Number(p.amount)), due_date: p.due_date ?? p.payment_date ?? '' })
  }
  const handleEditSave = async () => {
    if (!editModal) return
    setSaving(true)
    const db = supabase as any
    const isOverdue = editForm.status === 'overdue', hadMora = editModal.late_fee_applied === true
    let amt = parseFloat(editForm.amount), lfa = hadMora
    if (isOverdue && !hadMora) { amt += LATE_FEE; lfa = true }
    else if (!isOverdue && hadMora) { amt = Math.max(0, amt - LATE_FEE); lfa = false }
    const { error } = await db.from('payments').update({ status: editForm.status, amount: amt, late_fee_applied: lfa, due_date: editForm.due_date || null, payment_date: editForm.due_date || null }).eq('id', editModal.id)
    setSaving(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Pago actualizado'); setEditModal(null); loadData()
  }

  // ── Pay modal ──────────────────────────────────────────────────
  const openPayModal = (p: PaymentExt) => {
    setPayModal(p)
    setPayForm({ folio_hacienda: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' })
  }
  const handleMarkPaid = async () => {
    if (!payModal) return
    if (!payForm.folio_hacienda.trim()) { toast.error('El folio de Hacienda es requerido'); return }
    setSaving(true)
    const db = supabase as any
    const { error } = await db.from('payments').update({ status: 'paid', payment_date: payForm.payment_date, payment_method: payForm.payment_method, folio_hacienda: payForm.folio_hacienda.trim(), notes: payForm.notes || null }).eq('id', payModal.id)
    setSaving(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Pago confirmado'); setPayModal(null); loadData()
  }

  // ── Manual payment ─────────────────────────────────────────────
  const filteredForManual = useMemo(() => {
    const q = stuSearch.toLowerCase()
    return students.filter(s => s.full_name.toLowerCase().includes(q) || s.enrollment_number.toLowerCase().includes(q)).slice(0, 30)
  }, [students, stuSearch])

  const openManualModal = () => {
    setManualForm({ student_id: '', amount: '', concept: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', status: 'paid', folio_hacienda: '', receipt_number: '', notes: '' })
    setStuSearch(''); setStuDropdown(false); setManualModal(true)
  }
  const handleManualSave = async () => {
    if (!manualForm.student_id || !manualForm.amount || !manualForm.concept) { toast.error('Estudiante, monto y concepto son requeridos'); return }
    if (manualForm.status === 'paid' && !manualForm.folio_hacienda.trim()) { toast.error('El folio de Hacienda es requerido'); return }
    setSaving(true)
    const db = supabase as any
    const isOvr = manualForm.status === 'overdue'
    const amt = isOvr ? parseFloat(manualForm.amount) + LATE_FEE : parseFloat(manualForm.amount)
    const { error } = await db.from('payments').insert({ student_id: manualForm.student_id, amount: amt, concept: manualForm.concept, payment_date: manualForm.payment_date, due_date: manualForm.payment_date, payment_method: manualForm.payment_method, status: manualForm.status, folio_hacienda: manualForm.folio_hacienda.trim() || null, receipt_number: manualForm.receipt_number || null, notes: manualForm.notes || null, late_fee_applied: isOvr })
    setSaving(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Pago registrado'); setManualModal(false); loadData()
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <BackButton />

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Control de Pagos</h1>
          <p className="page-subtitle">Escuela Cristiana E-OS · {CY}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setGenAll12(false); setGenModal(true) }}
              className="btn-primary flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4" /> Generar pagos
            </button>
            <button onClick={openManualModal}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Pago manual
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          PANEL DE COMANDO — meses + stats + acciones
      ══════════════════════════════════════════════════════ */}
      <div className="card p-0 overflow-hidden">

        {/* Mes activo */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mes activo</span>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              {MONTH_NAMES[monthSel - 1]} {CY}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {MONTH_SHORT.map((name, i) => {
              const m        = i + 1
              const mPays    = allPayments.filter(p => paymentYear(p) === CY && paymentMonth(p) === m)
              const hasOverdue = mPays.some(p => p.status === 'overdue')
              const hasPending = mPays.some(p => p.status === 'pending')
              const allPaid    = mPays.length > 0 && mPays.every(p => p.status === 'paid')
              const paidCount  = mPays.filter(p => p.status === 'paid').length
              const total      = mPays.length
              const pct        = total > 0 ? Math.round(paidCount / total * 100) : 0
              const isActive   = monthSel === m
              return (
                <button key={m} onClick={() => setMonthSel(m)}
                  className={cn(
                    'relative flex flex-col items-center px-2.5 py-2 rounded-xl border transition-all text-xs font-bold min-w-[50px] overflow-hidden',
                    isActive
                      ? 'bg-eos-600 border-eos-600 text-white shadow-lg ring-2 ring-eos-300 ring-offset-1'
                      : hasOverdue  ? 'bg-red-50 border-red-200 text-red-700 hover:border-red-400 hover:shadow-sm'
                      : hasPending  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400 hover:shadow-sm'
                      : allPaid     ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                  )}>
                  {/* Progress fill bar at bottom */}
                  {total > 0 && !isActive && (
                    <div className={cn('absolute bottom-0 left-0 h-[3px] rounded-b-sm transition-all',
                      allPaid ? 'bg-emerald-400' : hasOverdue ? 'bg-red-400' : 'bg-amber-400'
                    )} style={{ width: `${pct}%` }} />
                  )}
                  <span>{name}</span>
                  <span className={cn('text-[10px] mt-0.5 tabular-nums font-semibold',
                    isActive ? 'text-white/80' : allPaid ? 'text-emerald-500' : hasOverdue ? 'text-red-500' : hasPending ? 'text-amber-500' : 'text-slate-300'
                  )}>
                    {total > 0 ? `${paidCount}/${total}` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Stats del mes seleccionado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-100">
          {[
            {
              label: 'Cobrado', value: `$${monthStats.paid.toFixed(0)}`,
              sub: `${monthStats.paidCount} pago${monthStats.paidCount !== 1 ? 's' : ''}`,
              color: 'text-emerald-600', border: 'border-emerald-400', bg: 'bg-emerald-50/60',
            },
            {
              label: 'Por cobrar', value: `$${monthStats.pending.toFixed(0)}`,
              sub: `${monthStats.pendingCount} pendiente${monthStats.pendingCount !== 1 ? 's' : ''}`,
              color: 'text-amber-600', border: 'border-amber-400', bg: 'bg-amber-50/40',
            },
            {
              label: 'Vencido', value: `$${monthStats.overdue.toFixed(0)}`,
              sub: `${monthStats.overdueCount} en mora`,
              color: monthStats.overdueCount > 0 ? 'text-red-600' : 'text-slate-300',
              border: monthStats.overdueCount > 0 ? 'border-red-400' : 'border-slate-200',
              bg: monthStats.overdueCount > 0 ? 'bg-red-50/40' : '',
            },
            {
              label: 'Año completo cobrado', value: `$${globalStats.paid.toFixed(0)}`,
              sub: `${globalStats.withFee} con cuota asignada`,
              color: 'text-slate-600', border: 'border-slate-300', bg: '',
            },
          ].map((s, idx) => (
            <div key={s.label}
              className={cn('px-4 py-3 border-l-[3px]', s.border, s.bg,
                idx > 0 ? 'border-t border-slate-100 sm:border-t-0' : '',
                idx === 0 ? '' : 'border-slate-100'
              )}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className={cn('text-2xl font-black tabular-nums leading-none', s.color)}>{s.value}</p>
              <p className="text-[11px] text-slate-400 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Acciones masivas — solo super admin */}
        {isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-1.5 mr-1">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                Masivo · {MONTH_NAMES[monthSel - 1]}
              </span>
            </div>
            <button onClick={handleBulkPending} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 font-semibold shadow-sm transition-colors">
              <Clock className="w-3 h-3" /> Pendiente
            </button>
            <button onClick={handleBulkOverdue} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40 font-semibold shadow-sm transition-colors">
              <AlertCircle className="w-3 h-3" /> Vencido
            </button>
            <button onClick={handleBulkPaid} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 font-semibold shadow-sm transition-colors">
              <CheckCircle className="w-3 h-3" /> Pagado
            </button>
            {undoSnapshot && undoSnapshot.length > 0 && (
              <button onClick={handleUndo} disabled={saving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600 font-semibold transition-colors ml-1">
                <RotateCcw className="w-3 h-3" /> Deshacer ({undoSnapshot.length})
              </button>
            )}
            <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} estudiante{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* ── Toolbar: vista + búsqueda + filtros ─────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        {/* Vista toggle */}
        <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg shrink-0">
          <button onClick={() => setViewMode('general')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              viewMode === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <LayoutList className="w-3.5 h-3.5" /> General
          </button>
          <button onClick={() => setViewMode('mensual')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              viewMode === 'mensual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <Table2 className="w-3.5 h-3.5" /> Por mes
          </button>
        </div>

        {/* Búsqueda */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar estudiante..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-400 bg-white" />
        </div>

        {/* Filtros de estado */}
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {([
            { key: 'all',     label: 'Todos',      cnt: null },
            { key: 'paid',    label: 'Pagados',    cnt: monthPayments.filter(p => p.status === 'paid').length },
            { key: 'pending', label: 'Pendientes', cnt: monthPayments.filter(p => p.status === 'pending').length },
            { key: 'overdue', label: 'Vencidos',   cnt: monthPayments.filter(p => p.status === 'overdue').length },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors',
                statusFilter === f.key
                  ? f.key === 'paid' ? 'bg-emerald-600 text-white shadow-sm' : f.key === 'pending' ? 'bg-amber-500 text-white shadow-sm' : f.key === 'overdue' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              )}>
              {f.label}
              {f.cnt !== null && f.cnt > 0 && (
                <span className={cn('text-[10px] px-1 py-0.5 rounded-full font-bold',
                  statusFilter === f.key ? 'bg-white/25' : 'bg-slate-100 text-slate-500'
                )}>{f.cnt}</span>
              )}
            </button>
          ))}
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setStatusFilter('all') }}
              className="text-xs text-slate-400 hover:text-slate-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 font-bold">×</button>
          )}
        </div>

        {/* Sort (solo vista general) */}
        {viewMode === 'general' && (
          <button onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0 border border-transparent hover:border-slate-200">
            <ArrowUpDown className="w-3 h-3" />
            {sortAsc ? 'Ene→Dic' : 'Dic→Ene'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">
        {filtered.length} estudiante{filtered.length !== 1 ? 's' : ''} · {MONTH_NAMES[monthSel - 1]} {CY}
      </p>

      {/* ══════════════════════════════════════════════════════
          VISTA POR MES — tabla estilo boleta
      ══════════════════════════════════════════════════════ */}
      {viewMode === 'mensual' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm text-slate-400">No se encontraron estudiantes</p>
            </div>
          ) : (
            byGrade.map(([grade, studs]) => {
              const gradePays = studs.flatMap(s =>
                s.payments.filter(p => paymentYear(p) === CY && paymentMonth(p) === monthSel)
              )
              const gradePaid    = gradePays.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
              const gradePending = gradePays.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0)
              return (
                <div key={grade} className="card overflow-hidden">
                  {/* Grade header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-700">{grade}</span>
                      <span className="text-xs text-slate-400">{studs.length} estudiante{studs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-emerald-600 font-medium">Cobrado: ${gradePaid.toFixed(0)}</span>
                      {gradePending > 0 && <span className="text-amber-600 font-medium">Pendiente: ${gradePending.toFixed(0)}</span>}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                          <th className="text-left px-4 py-2">Estudiante</th>
                          <th className="text-right px-3 py-2">Cuota</th>
                          <th className="text-center px-3 py-2">Estado</th>
                          <th className="text-right px-3 py-2">Monto</th>
                          <th className="text-center px-3 py-2">Fecha de pago</th>
                          <th className="text-center px-3 py-2">Folio</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {studs.map(s => {
                          const p = s.payments.find(p => paymentYear(p) === CY && paymentMonth(p) === monthSel)
                          const cfg = p ? (STATUS_CFG[p.status] ?? STATUS_CFG.pending) : null
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                                    !p ? 'bg-slate-100 text-slate-400'
                                    : p.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                                    : p.status === 'overdue' ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                  )}>
                                    {s.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800 truncate">{s.full_name}</p>
                                    <p className="text-xs text-slate-400">{s.enrollment_number}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-slate-600 tabular-nums">
                                {s.monthly_fee != null ? `$${s.monthly_fee.toFixed(0)}` : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {cfg ? (
                                  <span className={cn('text-xs px-2 py-0.5 rounded-full whitespace-nowrap', cfg.cls)}>
                                    {cfg.label}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Sin pago</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-slate-800 tabular-nums">
                                {p ? `$${Number(p.amount).toFixed(0)}` : '—'}
                                {p?.late_fee_applied && <span className="block text-[10px] text-red-400 font-normal">+mora</span>}
                              </td>
                              {/* Fecha de pago real */}
                              <td className="px-3 py-3 text-center">
                                {p?.status === 'paid' && p.payment_date
                                  ? <span className="text-xs text-emerald-600 font-medium">{formatDate(p.payment_date)}</span>
                                  : p?.status === 'pending' || p?.status === 'overdue'
                                  ? <span className="text-xs text-slate-300">Pendiente</span>
                                  : <span className="text-slate-300">—</span>
                                }
                              </td>
                              <td className="px-3 py-3 text-center">
                                {p?.folio_hacienda
                                  ? <span className="text-xs text-slate-400 font-mono">{p.folio_hacienda}</span>
                                  : p?.status === 'paid'
                                  ? <span className="text-xs text-amber-500 flex items-center gap-1 justify-center"><TriangleAlert className="w-3 h-3" />Sin folio</span>
                                  : <span className="text-slate-300">—</span>
                                }
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  {canEdit && p && (p.status === 'pending' || p.status === 'overdue') && (
                                    <button onClick={() => openPayModal(p)}
                                      className="text-xs px-2.5 py-1 bg-eos-600 text-white rounded-lg hover:bg-eos-700 transition-colors whitespace-nowrap">
                                      Pagar
                                    </button>
                                  )}
                                  {canEditPayments && p && p.status !== 'paid' && (
                                    <button onClick={() => openEditModal(p)} title="Editar"
                                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VISTA GENERAL — tarjetas con expediente
      ══════════════════════════════════════════════════════ */}
      {viewMode === 'general' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm text-slate-400">No se encontraron estudiantes</p>
            </div>
          ) : filtered.map(s => {
            const isOpen = expanded.has(s.id)
            const exp    = getExpediente(s)
            const vis    = sortPayments(s.payments.filter(p => paymentYear(p) === CY), sortAsc)
            // Color de borde izquierdo según estado del expediente
            const borderCls = exp.overdueCount > 0 ? 'border-l-red-400'
              : exp.pendingCount > 0 ? 'border-l-amber-400'
              : exp.paidCount > 0 ? 'border-l-emerald-400'
              : 'border-l-slate-200'
            const avatarCls = exp.overdueCount > 0 ? 'bg-red-100 text-red-700'
              : exp.pendingCount > 0 ? 'bg-amber-100 text-amber-700'
              : exp.paidCount > 0 ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-400'
            return (
              <div key={s.id} className={cn('card overflow-hidden border-l-4', borderCls)}>
                {/* Cabecera de tarjeta */}
                <button onClick={() => toggleExpand(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors text-left">

                  {/* Avatar con iniciales */}
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0', avatarCls)}>
                    {s.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Nombre y grado */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{s.full_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {s.grade_level}{s.section ? ' · ' + s.section : ''} · {s.enrollment_number}
                      {s.monthly_fee != null && <span className="ml-2 font-medium text-slate-500">${s.monthly_fee.toFixed(0)}/mes</span>}
                    </p>
                  </div>
                  {/* 12-month dots — siempre visibles */}
                  <div className="flex items-center gap-[3px] mx-2">
                    {Array.from({ length: 12 }, (_, i) => {
                      const p = s.payments.find(p => paymentYear(p) === CY && paymentMonth(p) === i + 1)
                      return (
                        <div key={i} title={`${MONTH_SHORT[i]}: ${p ? STATUS_CFG[p.status]?.label ?? '—' : 'Sin pago'}`}
                          className={cn('w-2 h-2 rounded-full transition-colors',
                            !p ? 'bg-slate-200'
                            : p.status === 'paid' ? 'bg-emerald-400'
                            : p.status === 'overdue' ? 'bg-red-400'
                            : 'bg-amber-300'
                          )} />
                      )
                    })}
                  </div>
                  {/* Mini stats — siempre visibles */}
                  <div className="flex items-center gap-4 text-xs shrink-0">
                    <div className="text-center">
                      <p className="font-black text-emerald-600">{exp.paidCount}<span className="text-slate-300 font-normal">/12</span></p>
                      <p className="text-slate-400">pagados</p>
                    </div>
                    {exp.overdueCount > 0 && (
                      <div className="text-center">
                        <p className="font-black text-red-600">{exp.overdueCount}</p>
                        <p className="text-red-400">vencido{exp.overdueCount !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                    {exp.mora > 0 && (
                      <div className="text-center">
                        <p className="font-black text-red-500">${exp.mora}</p>
                        <p className="text-slate-400">mora</p>
                      </div>
                    )}
                  </div>

                  {/* Monto adeudado — hero number */}
                  <div className="text-right shrink-0 min-w-[60px]">
                    {exp.totalPending + exp.totalOverdue > 0 ? (
                      <>
                        <p className={cn('font-black text-lg tabular-nums leading-tight',
                          exp.overdueCount > 0 ? 'text-red-600' : 'text-amber-600')}>
                          ${(exp.totalPending + exp.totalOverdue).toFixed(0)}
                        </p>
                        <p className="text-[10px] text-slate-400">adeuda</p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-lg text-emerald-500">✓</p>
                        <p className="text-[10px] text-emerald-400">al día</p>
                      </>
                    )}
                  </div>

                  <ChevronDown className={cn('w-4 h-4 text-slate-300 shrink-0 transition-transform ml-1', isOpen && 'rotate-180')} />
                </button>

                {/* Detalle expandido */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    {/* Expediente — 4 stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 border-b border-slate-100 bg-slate-50/60">
                      {[
                        { label: 'Cobrado', value: `$${exp.totalPaid.toFixed(0)}`, sub: `${exp.paidCount} de 12`, cls: 'text-emerald-600' },
                        { label: 'Pendiente', value: `$${exp.totalPending.toFixed(0)}`, sub: `${exp.pendingCount} cuota${exp.pendingCount !== 1 ? 's' : ''}`, cls: 'text-amber-600' },
                        { label: 'Vencido', value: `$${exp.totalOverdue.toFixed(0)}`, sub: `${exp.overdueCount} cuota${exp.overdueCount !== 1 ? 's' : ''}`, cls: exp.overdueCount > 0 ? 'text-red-600' : 'text-slate-300' },
                        { label: 'Mora', value: exp.mora > 0 ? `$${exp.mora.toFixed(0)}` : '—', sub: exp.mora > 0 ? `${Math.round(exp.mora / LATE_FEE)} cargo${Math.round(exp.mora / LATE_FEE) !== 1 ? 's' : ''}` : 'sin cargo', cls: exp.mora > 0 ? 'text-red-500' : 'text-slate-300' },
                      ].map(st => (
                        <div key={st.label} className="px-4 py-2.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{st.label}</p>
                          <p className={cn('text-lg font-black tabular-nums', st.cls)}>{st.value}</p>
                          <p className="text-[10px] text-slate-400">{st.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Filas de pagos */}
                    {vis.length === 0 ? (
                      <div className="py-6 text-center text-sm text-slate-400">Sin pagos registrados para {CY}</div>
                    ) : (
                      <div className="divide-y divide-slate-50/80">
                        {vis.map(p => {
                          const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                          const m   = paymentMonth(p)
                          return (
                            <div key={p.id}
                              className={cn(
                                'flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors',
                                p.status === 'overdue' && 'bg-red-50/30',
                              )}>
                              <div className={cn(
                                'text-[11px] font-black text-center w-8 py-1 rounded-lg shrink-0',
                                p.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                                : p.status === 'overdue' ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                              )}>
                                {m ? MONTH_SHORT[m - 1] : '—'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-700 truncate">{p.concept ?? '—'}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {p.status === 'paid' && p.payment_date && (
                                    <span className="text-[11px] text-emerald-600">Pagado {formatDate(p.payment_date)}</span>
                                  )}
                                  {p.late_fee_applied && <span className="text-[11px] text-red-400">+mora ${LATE_FEE}</span>}
                                  {p.status === 'paid' && !p.folio_hacienda && (
                                    <span className="text-[11px] text-amber-500 flex items-center gap-0.5"><TriangleAlert className="w-3 h-3" />sin folio</span>
                                  )}
                                  {p.folio_hacienda && <span className="text-[11px] text-slate-400 font-mono">{p.folio_hacienda}</span>}
                                </div>
                              </div>
                              <span className="font-bold text-slate-800 tabular-nums text-sm shrink-0">
                                ${Number(p.amount).toFixed(0)}
                              </span>
                              <span className={cn('text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0', cfg.cls)}>
                                {cfg.label}
                              </span>
                              {canEdit && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {(p.status === 'pending' || p.status === 'overdue') && (
                                    <button onClick={() => openPayModal(p)}
                                      className="text-xs px-3 py-1 bg-eos-600 text-white rounded-lg hover:bg-eos-700 font-semibold transition-colors">
                                      Pagar
                                    </button>
                                  )}
                                  {canEditPayments && p.status !== 'paid' && (
                                    <button onClick={() => openEditModal(p)} title="Editar"
                                      className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex justify-between text-xs text-slate-400">
                      <span>
                        Cuota: {s.monthly_fee != null
                          ? <strong className="text-slate-600">${s.monthly_fee.toFixed(0)}/mes</strong>
                          : <span className="text-amber-500">Sin cuota asignada</span>}
                      </span>
                      <span>{vis.length} registros · {CY}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Generar pagos
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={genModal} onClose={() => setGenModal(false)} title="Generar pagos pendientes">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setGenAll12(false)} className={cn('flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors', !genAll12 ? 'border-eos-500 bg-eos-50 text-eos-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              <Calendar className="w-5 h-5" /> Un mes
            </button>
            <button onClick={() => setGenAll12(true)} className={cn('flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors', genAll12 ? 'border-eos-500 bg-eos-50 text-eos-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              <Zap className="w-5 h-5" /> 12 meses (año completo)
            </button>
          </div>
          <div className={cn('grid gap-4', genAll12 ? 'grid-cols-1' : 'grid-cols-2')}>
            {!genAll12 && (
              <div>
                <label className="label">Mes</label>
                <select className="input" value={genMonth} onChange={e => setGenMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Año</label>
              <input type="number" className="input" value={genYear} onChange={e => setGenYear(Number(e.target.value))} min={2024} max={2030} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 space-y-1">
            {genAll12
              ? <p>12 cuotas {MONTH_NAMES[0]}–{MONTH_NAMES[11]} {genYear} para <strong>{students.filter(s => s.monthly_fee != null).length}</strong> estudiantes</p>
              : <p>Mensualidad <strong>{MONTH_NAMES[genMonth - 1]} {genYear}</strong> para <strong>{students.filter(s => s.monthly_fee != null).length}</strong> estudiantes</p>
            }
            <p className="text-xs text-slate-400">Los pagos que ya existen se omiten automáticamente.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setGenModal(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleGenerate} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Calendar className="w-4 h-4" />}
              {genAll12 ? 'Generar 12 meses' : 'Generar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          MODAL: Registrar pago recibido
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title="Registrar pago recibido">
        {payModal && (
          <div className="space-y-4">
            {/* What month is being paid */}
            <div className="p-3 rounded-xl bg-eos-50 border border-eos-200">
              <p className="text-xs text-eos-600 font-semibold uppercase tracking-wide mb-0.5">Cuota que se está pagando</p>
              <p className="text-base font-bold text-eos-800">{dueLabel(payModal)}</p>
              <p className="text-xs text-eos-600 mt-0.5">
                Monto: <strong>${Number(payModal.amount).toFixed(2)}</strong>
                {payModal.late_fee_applied && <span className="text-red-600 ml-2">(incluye mora ${LATE_FEE})</span>}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                📌 Este pago quedará registrado bajo <strong>{dueLabel(payModal)}</strong> sin importar la fecha en que se reciba.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Método de pago</label>
                <select className="input" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                  <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option><option value="check">Cheque</option>
                </select>
              </div>
              <div>
                <label className="label">
                  Fecha en que recibiste el pago
                  <span className="text-slate-400 font-normal ml-1 text-[10px]">(puede ser distinta al mes de la cuota)</span>
                </label>
                <input type="date" className="input" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <label className="label mb-0 text-emerald-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Folio de Hacienda <span className="text-red-500">*</span>
              </label>
              <input className="input bg-white" value={payForm.folio_hacienda} onChange={e => setPayForm(f => ({ ...f, folio_hacienda: e.target.value }))} placeholder="FE-00001-2026" autoFocus />
            </div>

            <div>
              <label className="label">Notas (opcional)</label>
              <textarea className="input resize-none" rows={2} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setPayModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={handleMarkPaid} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirmar pago
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          MODAL: Pago manual
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={manualModal} onClose={() => setManualModal(false)} title="Registrar pago manual">
        <div className="space-y-4">
          <div className="relative">
            <label className="label">Estudiante *</label>
            <input className="input" placeholder="Buscar..." value={stuSearch}
              onChange={e => { setStuSearch(e.target.value); setStuDropdown(true); setManualForm(f => ({ ...f, student_id: '', amount: '' })) }}
              onFocus={() => setStuDropdown(true)} autoComplete="off" />
            {manualForm.student_id && <p className="text-xs text-emerald-700 mt-1">✓ {students.find(s => s.id === manualForm.student_id)?.full_name}</p>}
            {stuDropdown && stuSearch.length > 0 && filteredForManual.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredForManual.map(s => (
                  <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-eos-50 text-sm flex flex-col border-b border-slate-50 last:border-0"
                    onMouseDown={() => { setManualForm(f => ({ ...f, student_id: s.id, amount: studentFees[s.id] != null ? String(studentFees[s.id]) : f.amount })); setStuSearch(s.full_name); setStuDropdown(false) }}>
                    <span className="font-medium">{s.full_name}</span>
                    <span className="text-xs text-slate-400">{s.grade_level} {s.section}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="label">Concepto *</label>
            <input className="input" value={manualForm.concept} onChange={e => setManualForm(f => ({ ...f, concept: e.target.value }))} placeholder="Mensualidad Abril 2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Monto *</label>
              <input type="number" step="0.01" className="input" value={manualForm.amount} onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))} />
              {manualForm.student_id && studentFees[manualForm.student_id] != null && (
                <p className="text-xs text-emerald-600 mt-1">Cuota: ${studentFees[manualForm.student_id].toFixed(0)}</p>
              )}
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={manualForm.payment_date} onChange={e => setManualForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Método</label>
              <select className="input" value={manualForm.payment_method} onChange={e => setManualForm(f => ({ ...f, payment_method: e.target.value }))}>
                <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option><option value="check">Cheque</option>
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={manualForm.status} onChange={e => setManualForm(f => ({ ...f, status: e.target.value }))}>
                <option value="paid">Pagado</option><option value="pending">Pendiente</option><option value="overdue">Vencido</option>
              </select>
            </div>
          </div>
          {manualForm.status === 'overdue' && manualForm.amount && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <TriangleAlert className="w-4 h-4 shrink-0" />
              <span>+<strong>${LATE_FEE} mora</strong> · Total: <strong>${(parseFloat(manualForm.amount || '0') + LATE_FEE).toFixed(0)}</strong></span>
            </div>
          )}
          {manualForm.status === 'paid' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <label className="label mb-0 text-emerald-800 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Folio de Hacienda *</label>
              <input className="input bg-white" value={manualForm.folio_hacienda} onChange={e => setManualForm(f => ({ ...f, folio_hacienda: e.target.value }))} placeholder="FE-00001-2026" />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setManualModal(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleManualSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
              Registrar
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          MODAL: Editar pago
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Editar pago">
        {editModal && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-sm font-semibold">{editModal.concept ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Monto actual: ${Number(editModal.amount).toFixed(2)}{editModal.late_fee_applied && ` (mora incluida $${LATE_FEE})`}</p>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pending">Pendiente</option><option value="overdue">Vencido</option><option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Monto base</label>
                <input type="number" step="0.01" className="input" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha vencimiento</label>
                <input type="date" className="input" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setEditModal(null); handleDelete(editModal!) }} disabled={saving}
                className="text-sm px-3 py-2 rounded-xl text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50">
                Borrar pago
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditModal(null)} className="btn-secondary">Cancelar</button>
                <button onClick={handleEditSave} disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
