'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock,
  FileText, Users, ArrowRight, ShieldCheck, CreditCard, BarChart3, Package, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque',
}

interface PendingReceipt {
  id: string
  student_id: string
  full_name: string
  grade_level: string
  section: string
  amount: number
  payment_method: string
  reference_number: string | null
  submitted_at: string
}

interface DashData {
  annualProjection: number
  collected: number
  unvalidated: number
  pending: number
  pct: number
  pendingComprobantes: number
  morosoCount: number
  studentStatus: { alDia: number; parcial: number; moroso: number; sinCuota: number; total: number }
  monthRows: { month: number; label: string; projected: number; collected: number; unvalidated: number; pct: number; future: boolean }[]
}

export default function FinanzasDashboard() {
  const { profile, blockedModules } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!profile) return
    const allowedRoles = ['master', 'contabilidad', 'administracion', 'direccion']
    if (!allowedRoles.includes(profile.role)) {
      router.replace('/dashboard/padre')
      return
    }
    if (blockedModules.includes('finanzas')) {
      router.replace('/dashboard/administracion')
    }
  }, [profile, blockedModules, router])

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashData | null>(null)
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const year = new Date().getFullYear()
  const isMaster = profile?.role === 'master'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: fees }, { data: students }, { data: paidPayments }, { data: pendingRec }, { data: studentsInfo }, { data: pendingReceiptsData }] =
        await Promise.all([
          db.from('student_fees').select('student_id, monthly_amount'),
          db.from('students').select('id').eq('is_active', true),
          db.from('payments')
            .select('student_id, amount, payment_date')
            .eq('status', 'paid'),
          db.from('payment_receipts')
            .select('id, student_id, amount, payment_method, reference_number, submitted_at')
            .eq('status', 'pending_review')
            .order('submitted_at', { ascending: false }),
          db.from('students')
            .select('id, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
            .eq('is_active', true),
          db.from('payment_receipts')
            .select('student_id, amount, submitted_at')
            .eq('status', 'pending_review'),
        ])

      const feeMap: Record<string, number> = {}
      ;(fees ?? []).forEach((f: any) => { feeMap[f.student_id] = Number(f.monthly_amount) })

      const studentInfoMap: Record<string, any> = {}
      ;(studentsInfo ?? []).forEach((s: any) => { studentInfoMap[s.id] = s })

      const totalStudents = (students ?? []).length
      const totalMonthly = Object.values(feeMap).reduce((s, v) => s + v, 0)
      const annualProjection = totalMonthly * 12

      // Pagos cobrados (payments, status='paid') por mes del año actual
      const collectedByMonth: Record<number, number> = {}
      const unvalidatedByMonth: Record<number, number> = {}
      const paidByStudent: Record<string, number> = {}

      ;(paidPayments ?? []).forEach((p: any) => {
        const d = new Date(p.payment_date)
        if (d.getFullYear() !== year) return
        const m = d.getMonth() + 1
        const amount = Number(p.amount)
        collectedByMonth[m] = (collectedByMonth[m] ?? 0) + amount
        paidByStudent[p.student_id] = (paidByStudent[p.student_id] ?? 0) + amount
      })
      // Comprobantes pendientes de validar
      ;(pendingReceiptsData ?? []).forEach((r: any) => {
        const d = new Date(r.submitted_at)
        if (d.getFullYear() !== year) return
        const m = d.getMonth() + 1
        unvalidatedByMonth[m] = (unvalidatedByMonth[m] ?? 0) + Number(r.amount)
      })

      const totalCollected = Object.values(collectedByMonth).reduce((s, v) => s + v, 0)
      const totalUnvalidated = Object.values(unvalidatedByMonth).reduce((s, v) => s + v, 0)
      const totalPending = Math.max(0, annualProjection - totalCollected)
      const pct = annualProjection > 0 ? Math.round((totalCollected / annualProjection) * 100) : 0

      const currentMonth = new Date().getMonth() + 1
      const monthRows = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const col = collectedByMonth[m] ?? 0
        const unval = unvalidatedByMonth[m] ?? 0
        const mpct = totalMonthly > 0 ? Math.min(100, Math.round((col / totalMonthly) * 100)) : 0
        return { month: m, label: MONTH_NAMES[i], projected: totalMonthly, collected: col, unvalidated: unval, pct: mpct, future: m > currentMonth }
      })

      // Estado por estudiante (solo pagos validados)
      const monthsElapsed = currentMonth
      let alDia = 0, parcial = 0, moroso = 0, sinCuota = 0
      ;(students ?? []).forEach((s: any) => {
        const fee = feeMap[s.id] ?? 0
        if (fee === 0) { sinCuota++; return }
        const paid = paidByStudent[s.id] ?? 0
        const expected = fee * monthsElapsed
        if (paid >= expected) alDia++
        else if (paid > 0) {
          const unpaidMonths = monthsElapsed - Math.floor(paid / fee)
          if (unpaidMonths >= 1) moroso++; else parcial++
        } else moroso++
      })

      // Comprobantes pendientes con info de estudiante
      const pendingRows: PendingReceipt[] = (pendingRec ?? []).map((r: any) => {
        const s = studentInfoMap[r.student_id] ?? {}
        return {
          id: r.id,
          student_id: r.student_id,
          full_name: s.profile?.full_name ?? '—',
          grade_level: s.grade_level ?? '—',
          section: s.section ?? '',
          amount: Number(r.amount),
          payment_method: r.payment_method ?? 'transfer',
          reference_number: r.reference_number,
          submitted_at: r.submitted_at,
        }
      })
      setPendingReceipts(pendingRows)

      setData({
        annualProjection, collected: totalCollected, unvalidated: totalUnvalidated,
        pending: totalPending, pct,
        pendingComprobantes: pendingRows.length,
        morosoCount: moroso,
        studentStatus: { alDia, parcial, moroso, sinCuota, total: totalStudents },
        monthRows: monthRows as any,
      })
    } catch {
      // silent
    }
    setLoading(false)
  }, [year])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const approve = async (r: PendingReceipt) => {
    setProcessing(r.id)
    const now = new Date().toISOString()
    const { error } = await db.from('payment_receipts').update({
      status: 'approved',
      reviewed_by: profile?.id,
      reviewed_at: now,
    }).eq('id', r.id)
    if (error) { toast.error('Error al validar'); setProcessing(null); return }
    await db.from('payments').insert({
      student_id: r.student_id,
      amount: r.amount,
      concept: 'Cuota mensual',
      payment_date: r.submitted_at?.split('T')[0] ?? now.split('T')[0],
      payment_method: r.payment_method,
      status: 'paid',
      receipt_number: r.reference_number,
      notes: 'Comprobante validado por colectoría',
    })
    toast.success('Pago validado ✓')
    setProcessing(null)
    load()
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="page-title">Finanzas {year}</h1>
        <p className="page-subtitle">Proyección vs cobros reales por cuotas de estudiantes</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="card flex items-center justify-center h-40 text-slate-400 text-sm">Error al cargar datos</div>
      ) : (
        <>
          {/* ── Alertas de cobros ────────────────────────────────────── */}
          {(data.morosoCount > 0 || data.pendingComprobantes > 0) && (
            <div className="space-y-2">
              {data.morosoCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-800">
                      {data.morosoCount} estudiante{data.morosoCount !== 1 ? 's' : ''} con pagos atrasados
                    </p>
                    <p className="text-xs text-red-600">2 o más meses sin pago validado</p>
                  </div>
                  <Link href="/dashboard/finanzas/proyeccion"
                    className="text-xs text-red-700 font-medium hover:underline flex items-center gap-1 shrink-0">
                    Ver detalle <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
              {data.pendingComprobantes > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">
                      {data.pendingComprobantes} comprobante{data.pendingComprobantes !== 1 ? 's' : ''} pendiente{data.pendingComprobantes !== 1 ? 's' : ''} de validación
                    </p>
                    <p className="text-xs text-amber-600">
                      ${data.unvalidated.toLocaleString('es-SV', { minimumFractionDigits: 2 })} registrados pero <strong>sin validar</strong> — no cuentan como cobrados
                    </p>
                  </div>
                  <Link href="/dashboard/finanzas/comprobantes"
                    className="text-xs text-amber-700 font-medium hover:underline flex items-center gap-1 shrink-0">
                    Ir a validar <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── Validación rápida (solo master) ─────────────────────── */}
          {isMaster && pendingReceipts.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-100 bg-amber-50">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-800">Validación rápida — Super admin</h2>
                <span className="ml-auto text-xs text-amber-600 font-medium">
                  {pendingReceipts.length} pendiente{pendingReceipts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {pendingReceipts.map(r => (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.full_name}</p>
                      <p className="text-xs text-slate-400">
                        {r.grade_level} {r.section} · {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('es-SV') : '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-700">${r.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">{METHOD_LABELS[r.payment_method] ?? r.payment_method}</p>
                    </div>
                    <button
                      onClick={() => approve(r)}
                      disabled={processing === r.id}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {processing === r.id
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <><CheckCircle className="w-3.5 h-3.5" /> Validar</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-xs text-slate-400 font-medium">Proyección anual</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">${data.annualProjection.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-400 mt-1">Suma de cuotas × 12 meses</p>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-xs text-slate-400 font-medium">Cobrado y validado</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">${data.collected.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</p>
              {data.unvalidated > 0 ? (
                <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  +${data.unvalidated.toLocaleString('es-SV', { minimumFractionDigits: 2 })} sin validar
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Comprobantes aprobados {year}</p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <span className="text-xs text-slate-400 font-medium">Pendiente</span>
              </div>
              <p className="text-2xl font-bold text-red-600">${data.pending.toLocaleString('es-SV', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-400 mt-1">Por cobrar en el año</p>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                  data.pct >= 80 ? 'bg-emerald-50' : data.pct >= 50 ? 'bg-amber-50' : 'bg-red-50')}>
                  <DollarSign className={cn('w-4 h-4', data.pct >= 80 ? 'text-emerald-500' : data.pct >= 50 ? 'text-amber-500' : 'text-red-500')} />
                </div>
                <span className="text-xs text-slate-400 font-medium">% Cumplimiento</span>
              </div>
              <p className={cn('text-2xl font-bold', data.pct >= 80 ? 'text-emerald-600' : data.pct >= 50 ? 'text-amber-600' : 'text-red-600')}>
                {data.pct}%
              </p>
              <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={cn('h-1.5 rounded-full transition-all', data.pct >= 80 ? 'bg-emerald-500' : data.pct >= 50 ? 'bg-amber-400' : 'bg-red-500')}
                  style={{ width: `${Math.min(100, data.pct)}%` }} />
              </div>
            </div>
          </div>

          {/* ── Cobro mensual ────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Cobro mensual {year}</h2>
              <Link href="/dashboard/finanzas/proyeccion" className="text-xs text-eos-600 hover:underline flex items-center gap-1">
                Ver detalle completo <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Mes</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Proyectado</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Cobrado</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Sin validar</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 w-28">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.monthRows.map((r: any) => (
                    <tr key={r.month} className={cn('hover:bg-slate-50/50', r.future && 'opacity-40')}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">${r.projected.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 text-xs">${r.collected.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        {r.unvalidated > 0
                          ? <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                              <Clock className="w-3 h-3" />${r.unvalidated.toFixed(2)}
                            </span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={cn('h-1.5 rounded-full', r.pct >= 80 ? 'bg-emerald-500' : r.pct >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                              style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 w-8 text-right">{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Estado estudiantes + Acceso rápido ───────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">Estado de pago — estudiantes</h2>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'alDia',    label: 'Al día',    value: data.studentStatus.alDia,    color: 'bg-emerald-500' },
                  { key: 'parcial',  label: 'Parcial',   value: data.studentStatus.parcial,  color: 'bg-amber-400' },
                  { key: 'moroso',   label: 'Moroso',    value: data.studentStatus.moroso,   color: 'bg-red-500' },
                  { key: 'sinCuota', label: 'Sin cuota', value: data.studentStatus.sinCuota, color: 'bg-slate-300' },
                ].map(s => (
                  <div key={s.key} className="flex items-center gap-3 text-sm">
                    <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', s.color)} />
                    <span className="flex-1 text-slate-600">{s.label}</span>
                    <span className="font-semibold text-slate-800">{s.value}</span>
                    <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className={cn('h-1.5 rounded-full', s.color)}
                        style={{ width: data.studentStatus.total > 0 ? `${(s.value / data.studentStatus.total) * 100}%` : '0%' }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-1 border-t border-slate-100">{data.studentStatus.total} estudiantes activos en total</p>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">Acceso rápido</h2>
              </div>
              <div className="space-y-2">
                {[
                  { href: '/dashboard/finanzas/pagos',        icon: CreditCard,  label: 'Control de Pagos',        sub: 'Pagos por estudiante',                           color: 'text-eos-500',  hover: 'hover:border-eos-200 hover:bg-eos-50',   arrow: 'group-hover:text-eos-500' },
                  { href: '/dashboard/finanzas/comprobantes', icon: Clock,       label: 'Validar comprobantes',    sub: `${data.pendingComprobantes} pendiente${data.pendingComprobantes !== 1 ? 's' : ''} de revisión`, color: 'text-amber-500',  hover: 'hover:border-amber-200 hover:bg-amber-50',   arrow: 'group-hover:text-amber-500' },
                  { href: '/dashboard/finanzas/proyeccion',   icon: TrendingUp,  label: 'Proyección detallada',    sub: 'Por mes y por estudiante',                       color: 'text-blue-500',   hover: 'hover:border-blue-200 hover:bg-blue-50',     arrow: 'group-hover:text-blue-500' },
                  { href: '/dashboard/finanzas/cuotas',       icon: DollarSign,  label: 'Gestionar cuotas',        sub: 'Solo master puede modificar',                    color: 'text-slate-400',  hover: 'hover:border-slate-200 hover:bg-slate-50',   arrow: 'group-hover:text-slate-500' },
                  { href: '/dashboard/finanzas/gastos',       icon: Package,     label: 'Gastos',                  sub: 'Registro de egresos',                            color: 'text-orange-500', hover: 'hover:border-orange-200 hover:bg-orange-50', arrow: 'group-hover:text-orange-500' },
                  { href: '/dashboard/finanzas/facturacion',  icon: Receipt,     label: 'Facturación',             sub: 'Emisión de facturas',                            color: 'text-violet-500', hover: 'hover:border-violet-200 hover:bg-violet-50', arrow: 'group-hover:text-violet-500' },
                  { href: '/dashboard/finanzas/reportes',     icon: BarChart3,   label: 'Reportes',                sub: 'Estadísticas financieras',                       color: 'text-emerald-500',hover: 'hover:border-emerald-200 hover:bg-emerald-50',arrow: 'group-hover:text-emerald-500' },
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className={cn('flex items-center justify-between p-3 rounded-xl border border-slate-100 transition-colors group', item.hover)}>
                    <div className="flex items-center gap-3">
                      <item.icon className={cn('w-4 h-4', item.color)} />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.label}</p>
                        <p className="text-xs text-slate-400">{item.sub}</p>
                      </div>
                    </div>
                    <ArrowRight className={cn('w-4 h-4 text-slate-300 transition-colors shrink-0', item.arrow)} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
