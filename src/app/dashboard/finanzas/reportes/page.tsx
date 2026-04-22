'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

interface PaymentRow {
  id: string
  amount: number
  status: string
  concept: string
  payment_date: string
  student_name?: string
}

interface Summary {
  total: number
  paid: number
  pending: number
  overdue: number
  collected: number
  pendingAmount: number
}

export default function FinanzasReportesPage() {
  const { profile } = useAuth()
  const canView = profile?.role && ['master', 'direccion', 'contabilidad', 'administracion'].includes(profile.role)

  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [summary, setSummary] = useState<Summary>({ total: 0, paid: 0, pending: 0, overdue: 0, collected: 0, pendingAmount: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${month}-01`
    const to   = `${month}-31`

    // Fuente única: tabla payments (incluye pagos manuales y los generados al aprobar comprobantes)
    const { data: paymentsData } = await (supabase as any)
      .from('payments')
      .select('id, amount, status, concept, payment_date, student:students(profile:profiles!students_user_id_fkey(full_name))')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .order('payment_date', { ascending: false })

    const rows: PaymentRow[] = (paymentsData ?? []).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      concept: p.concept ?? 'Pago',
      payment_date: p.payment_date,
      student_name: p.student?.profile?.full_name ?? '—',
    }))

    setPayments(rows)

    const s: Summary = { total: rows.length, paid: 0, pending: 0, overdue: 0, collected: 0, pendingAmount: 0 }
    rows.forEach(p => {
      if (p.status === 'paid') { s.paid++; s.collected += p.amount }
      else if (p.status === 'overdue') { s.overdue++; s.pendingAmount += p.amount }
      else { s.pending++; s.pendingAmount += p.amount }
    })
    setSummary(s)
    setLoading(false)
  }, [month])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const statusLabel = (s: string) => ({
    paid: { text: 'Pagado', cls: 'bg-emerald-50 text-emerald-700' },
    pending: { text: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
    overdue: { text: 'Vencido', cls: 'bg-red-50 text-red-700' },
  }[s] ?? { text: s, cls: 'bg-slate-100 text-slate-500' })

  if (!canView) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-400">Acceso restringido</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Reportes Financieros</h1>
          <p className="page-subtitle">Resumen de cobros y pagos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="focus:outline-none text-sm bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total cobros', value: summary.total, sub: 'registros', icon: BarChart3, color: 'text-eos-600 bg-eos-50' },
          { label: 'Recaudado', value: fmt(summary.collected), sub: `${summary.paid} pagados`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Por cobrar', value: fmt(summary.pendingAmount), sub: `${summary.pending + summary.overdue} pendientes`, icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
          { label: 'Vencidos', value: summary.overdue, sub: 'cobros vencidos', icon: TrendingDown, color: 'text-red-600 bg-red-50' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">{k.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${k.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Barra de progreso recaudo */}
      {summary.total > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Tasa de cobro</span>
            <span className="text-sm font-bold text-eos-600">
              {Math.round((summary.paid / summary.total) * 100)}%
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-eos-500 to-emerald-500 rounded-full transition-all"
              style={{ width: `${(summary.paid / summary.total) * 100}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Pagado: {summary.paid}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pendiente: {summary.pending}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Vencido: {summary.overdue}</span>
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-700">Detalle de cobros — {month}</p>
            <span className="text-xs text-slate-400">{payments.length} registros</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Estudiante</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Concepto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Monto</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                    No hay cobros registrados para {month}
                  </td>
                </tr>
              ) : payments.map(p => {
                const st = statusLabel(p.status)
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {p.student_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.concept || '—'}</td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">{fmt(p.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>
                        {st.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {p.payment_date ? new Date(p.payment_date).toLocaleDateString('es-SV') : '—'}
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
