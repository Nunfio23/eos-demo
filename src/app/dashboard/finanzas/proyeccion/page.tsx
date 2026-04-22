'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { TrendingUp, CheckCircle, AlertCircle, Clock, DollarSign, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const QUARTER_LABELS = ['T1 (Ene–Mar)', 'T2 (Abr–Jun)', 'T3 (Jul–Sep)', 'T4 (Oct–Dic)']
const QUARTER_MONTHS = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]]

interface MonthRow   { month: number; label: string; projected: number; collected: number; unvalidated: number; future: boolean }
interface QuarterRow { q: number; label: string; projected: number; collected: number; unvalidated: number }
interface StudentStatus {
  student_id: string; full_name: string; grade_level: string; section: string
  monthly_amount: number; total_paid: number; months_paid: number; months_total: number
  pending_unvalidated: number
  status: 'al-dia' | 'parcial' | 'moroso' | 'sin-cuota'
}

export default function ProyeccionPage() {
  const [loading, setLoading]     = useState(true)
  const [monthRows, setMonthRows] = useState<MonthRow[]>([])
  const [quarters, setQuarters]   = useState<QuarterRow[]>([])
  const [students, setStudents]   = useState<StudentStatus[]>([])
  const [tab, setTab]             = useState<'anual' | 'trimestral' | 'meses' | 'alumnos'>('anual')

  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: fees }, { data: allStudents }, { data: paidPayments }, { data: pendingReceipts }] =
        await Promise.all([
          db.from('student_fees').select('student_id, monthly_amount'),
          db.from('students')
            .select('id, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
            .eq('is_active', true),
          db.from('payments')
            .select('student_id, amount, payment_date')
            .eq('status', 'paid'),
          db.from('payment_receipts')
            .select('student_id, amount, submitted_at')
            .eq('status', 'pending_review'),
        ])

      const feeMap: Record<string, number> = {}
      ;(fees ?? []).forEach((f: any) => { feeMap[f.student_id] = Number(f.monthly_amount) })
      const totalMonthly = Object.values(feeMap).reduce((s, v) => s + v, 0)

      // Pagos cobrados (tabla payments, status='paid') por mes del año actual
      const collectedByMonth: Record<number, number> = {}
      const unvalidatedByMonth: Record<number, number> = {}
      const collectedByStudentMonth: Record<string, number> = {}
      const unvalidatedByStudent: Record<string, number> = {}
      ;(paidPayments ?? [])
        .filter((p: any) => new Date(p.payment_date).getFullYear() === year)
        .forEach((p: any) => {
          const m = new Date(p.payment_date).getMonth() + 1
          const amount = Number(p.amount)
          collectedByMonth[m] = (collectedByMonth[m] ?? 0) + amount
          const key = `${p.student_id}_${m}`
          collectedByStudentMonth[key] = (collectedByStudentMonth[key] ?? 0) + amount
        })
      // Comprobantes pendientes de validar (payment_receipts, status='pending_review')
      ;(pendingReceipts ?? [])
        .filter((r: any) => new Date(r.submitted_at).getFullYear() === year)
        .forEach((r: any) => {
          const m = new Date(r.submitted_at).getMonth() + 1
          const amount = Number(r.amount)
          unvalidatedByMonth[m] = (unvalidatedByMonth[m] ?? 0) + amount
          unvalidatedByStudent[r.student_id] = (unvalidatedByStudent[r.student_id] ?? 0) + amount
        })

      const currentMonth = new Date().getMonth() + 1

      // Monthly rows — all 12, no billing_periods dependency
      const mRows: MonthRow[] = MONTH_NAMES.map((label, i) => {
        const m = i + 1
        return {
          month: m, label, projected: totalMonthly,
          collected: collectedByMonth[m] ?? 0,
          unvalidated: unvalidatedByMonth[m] ?? 0,
          future: m > currentMonth,
        }
      })
      setMonthRows(mRows)

      // Quarterly rows
      const qRows: QuarterRow[] = QUARTER_MONTHS.map((months, qi) => ({
        q: qi + 1,
        label: QUARTER_LABELS[qi],
        projected: totalMonthly * 3,
        collected: months.reduce((s, m) => s + (collectedByMonth[m] ?? 0), 0),
        unvalidated: months.reduce((s, m) => s + (unvalidatedByMonth[m] ?? 0), 0),
      }))
      setQuarters(qRows)

      // Student status
      const monthsElapsed = currentMonth
      const studentRows: StudentStatus[] = (allStudents ?? []).map((s: any) => {
        const monthlyFee = feeMap[s.id] ?? 0
        const totalPaid = Array.from({ length: 12 }, (_, i) => i + 1)
          .reduce((sum, m) => sum + (collectedByStudentMonth[`${s.id}_${m}`] ?? 0), 0)
        const expectedSoFar = monthlyFee * monthsElapsed
        const monthsPaid = monthlyFee > 0 ? Math.min(monthsElapsed, Math.floor(totalPaid / monthlyFee)) : 0

        let status: StudentStatus['status'] = 'sin-cuota'
        if (monthlyFee > 0) {
          if (totalPaid >= expectedSoFar) status = 'al-dia'
          else if (totalPaid > 0) status = (monthsElapsed - monthsPaid) >= 1 ? 'moroso' : 'parcial'
          else status = 'moroso'
        }

        return {
          student_id: s.id,
          full_name: s.profile?.full_name ?? '—',
          grade_level: s.grade_level ?? '—',
          section: s.section ?? '',
          monthly_amount: monthlyFee,
          total_paid: totalPaid,
          months_paid: monthsPaid,
          months_total: monthsElapsed,
          pending_unvalidated: unvalidatedByStudent[s.id] ?? 0,
          status,
        }
      })
      setStudents(studentRows.sort((a, b) => {
        const order = { moroso: 0, parcial: 1, 'sin-cuota': 2, 'al-dia': 3 }
        return order[a.status] - order[b.status]
      }))
    } catch {
      toast.error('Error al cargar proyección')
    }
    setLoading(false)
  }, [year])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const totalProjected = monthRows.reduce((s, r) => s + r.projected, 0)  // annual
  const totalCollected = monthRows.reduce((s, r) => s + r.collected, 0)
  const totalPending   = Math.max(0, totalProjected - totalCollected)
  const pct            = totalProjected > 0 ? Math.round((totalCollected / totalProjected) * 100) : 0

  const statusConfig = {
    'al-dia':    { label: 'Al día',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    'parcial':   { label: 'Parcial',   color: 'bg-amber-100 text-amber-700',     icon: Clock },
    'moroso':    { label: 'Moroso',    color: 'bg-red-100 text-red-700',         icon: AlertCircle },
    'sin-cuota': { label: 'Sin cuota', color: 'bg-slate-100 text-slate-500',     icon: DollarSign },
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="page-title">Proyección Financiera {year}</h1>
        <p className="page-subtitle">Contraste entre ingresos proyectados y cobros reales por cuotas</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Proyectado anual', value: `$${totalProjected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}`, color: 'text-slate-700' },
          { label: 'Cobrado real',     value: `$${totalCollected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}`, color: 'text-emerald-600' },
          { label: 'Pendiente',        value: `$${totalPending.toLocaleString('es-SV', { minimumFractionDigits: 2 })}`,   color: 'text-red-600' },
          { label: '% Cumplimiento',   value: `${pct}%`,  color: pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
          <span>Cobrado: ${totalCollected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</span>
          <span className="font-semibold">{pct}%</span>
          <span>Meta anual: ${totalProjected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div className={cn('h-3 rounded-full transition-all', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500')}
            style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'anual',      label: 'Anual' },
          { key: 'trimestral', label: 'Trimestral' },
          { key: 'meses',      label: 'Por mes' },
          { key: 'alumnos',    label: 'Por alumno' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t.key ? 'bg-eos-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'anual' ? (
        /* ── Vista anual ─────────────────────────────────────────────── */
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Período</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Proyectado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Cobrado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-amber-500">Sin validar</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Diferencia</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 w-28">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {/* 4 quarters summary */}
              {quarters.map(q => {
                const diff = q.collected - q.projected
                const qpct = q.projected > 0 ? Math.min(100, Math.round((q.collected / q.projected) * 100)) : 0
                return (
                  <tr key={q.q} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-700">{q.label}</td>
                    <td className="px-4 py-3 text-right text-slate-500">${q.projected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">${q.collected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {q.unvalidated > 0
                        ? <span className="inline-flex items-center justify-end gap-1 text-amber-500 font-medium">
                            <Clock className="w-3 h-3" />${q.unvalidated.toLocaleString('es-SV', { minimumFractionDigits: 2 })}
                          </span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-semibold', diff >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {diff >= 0 ? '+' : ''}${Math.abs(diff).toLocaleString('es-SV', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn('h-1.5 rounded-full', qpct >= 80 ? 'bg-emerald-500' : qpct >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                            style={{ width: `${qpct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8">{qpct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {/* Annual total row */}
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <td className="px-4 py-3 text-slate-800">Total {year}</td>
                <td className="px-4 py-3 text-right text-slate-700">${totalProjected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right text-emerald-600">${totalCollected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">
                  {quarters.reduce((s, q) => s + q.unvalidated, 0) > 0
                    ? <span className="text-amber-500 font-medium text-xs inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        ${quarters.reduce((s, q) => s + q.unvalidated, 0).toLocaleString('es-SV', { minimumFractionDigits: 2 })}
                      </span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className={cn('px-4 py-3 text-right', totalCollected - totalProjected >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {(totalCollected - totalProjected) >= 0 ? '+' : ''}${Math.abs(totalCollected - totalProjected).toLocaleString('es-SV', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-sm font-bold', pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600')}>{pct}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      ) : tab === 'trimestral' ? (
        /* ── Vista trimestral ────────────────────────────────────────── */
        <div className="space-y-4">
          {quarters.map(q => {
            const qpct = q.projected > 0 ? Math.min(100, Math.round((q.collected / q.projected) * 100)) : 0
            const diff = q.collected - q.projected
            const qMonths = QUARTER_MONTHS[q.q - 1]
            return (
              <div key={q.q} className="card overflow-hidden">
                <div className={cn('flex items-center justify-between px-5 py-3 border-b', qpct >= 80 ? 'bg-emerald-50' : qpct >= 50 ? 'bg-amber-50' : 'bg-red-50')}>
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">{q.label}</span>
                    <span className={cn('ml-3 text-xs font-bold', qpct >= 80 ? 'text-emerald-700' : qpct >= 50 ? 'text-amber-700' : 'text-red-700')}>{qpct}%</span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-emerald-700 font-semibold">${q.collected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</span>
                    <span className="text-slate-400"> / ${q.projected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</span>
                    <span className={cn('ml-2 font-semibold', diff >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      ({diff >= 0 ? '+' : ''}${Math.abs(diff).toLocaleString('es-SV', { minimumFractionDigits: 2 })})
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {qMonths.map(m => {
                      const row = monthRows.find(r => r.month === m)!
                      const mpct = row.projected > 0 ? Math.min(100, Math.round((row.collected / row.projected) * 100)) : 0
                      return (
                        <tr key={m} className={cn('hover:bg-slate-50/50', row.future && 'opacity-40')}>
                          <td className="px-4 py-2.5 text-slate-600 w-28">{row.label}</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 text-xs">${row.projected.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold text-xs">${row.collected.toFixed(2)}</td>
                          <td className="px-4 py-2.5 w-36">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className={cn('h-1.5 rounded-full', mpct >= 80 ? 'bg-emerald-500' : mpct >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                                  style={{ width: `${mpct}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-400 w-8">{row.future ? '—' : `${mpct}%`}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>

      ) : tab === 'meses' ? (
        /* ── Vista mensual ───────────────────────────────────────────── */
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Mes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Proyectado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Cobrado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-amber-500">Sin validar</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Diferencia</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 w-32">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {monthRows.map(r => {
                const diff = r.collected - r.projected
                const mpct = r.projected > 0 ? Math.min(100, Math.round((r.collected / r.projected) * 100)) : 0
                return (
                  <tr key={r.month} className={cn('hover:bg-slate-50/50', r.future && 'opacity-40')}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {r.label} {year}
                      {r.future && <span className="ml-2 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Futuro</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">${r.projected.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">${r.collected.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {r.unvalidated > 0
                        ? <span className="inline-flex items-center justify-end gap-1 text-amber-500 font-medium">
                            <Clock className="w-3 h-3" />${r.unvalidated.toFixed(2)}
                          </span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-semibold', diff >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {diff >= 0 ? '+' : ''}${Math.abs(diff).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn('h-1.5 rounded-full', mpct >= 80 ? 'bg-emerald-500' : mpct >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                            style={{ width: `${mpct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8">{r.future ? '—' : `${mpct}%`}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      ) : (
        /* ── Vista por alumno ────────────────────────────────────────── */
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Estudiante</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Cuota/mes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Meses pagados</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total pagado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-amber-500">Sin validar</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Pendiente</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map(s => {
                const expected = s.monthly_amount * s.months_total
                const pending  = Math.max(0, expected - s.total_paid)
                const cfg      = statusConfig[s.status]
                const Icon     = cfg.icon
                return (
                  <tr key={s.student_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{s.full_name}</p>
                      <p className="text-xs text-slate-400">{s.grade_level} {s.section}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {s.monthly_amount > 0 ? `$${s.monthly_amount.toFixed(2)}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {s.monthly_amount > 0 ? `${s.months_paid} / ${s.months_total}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {s.total_paid > 0 ? `$${s.total_paid.toFixed(2)}` : <span className="text-slate-300">$0.00</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.pending_unvalidated > 0
                        ? <span className="inline-flex items-center justify-end gap-1 text-amber-500 font-medium text-xs">
                            <Clock className="w-3 h-3" />${s.pending_unvalidated.toFixed(2)}
                            <span className="text-[10px] text-amber-400 font-normal">sin validar</span>
                          </span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-500">
                      {pending > 0 ? `$${pending.toFixed(2)}` : <span className="text-emerald-500">$0.00</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
