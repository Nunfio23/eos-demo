'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, ExternalLink, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque',
}

interface Receipt {
  id: string
  student_id: string
  full_name: string
  grade_level: string
  section: string
  amount: number
  payment_method: string
  reference_number: string | null
  receipt_url: string | null
  notes: string | null
  submitted_at: string
  status: 'pending_review' | 'approved' | 'rejected'
  reject_reason: string | null
}

export default function ComprobantesPage() {
  const { profile } = useAuth()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending_review' | 'approved' | 'rejected'>('pending_review')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: recs }, { data: students }] = await Promise.all([
        db.from('payment_receipts').select('*').order('submitted_at', { ascending: false }),
        db.from('students')
          .select('id, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
          .eq('is_active', true),
      ])

      const studentMap: Record<string, any> = {}
      ;(students ?? []).forEach((s: any) => { studentMap[s.id] = s })

      const rows: Receipt[] = (recs ?? []).map((r: any) => {
        const s = studentMap[r.student_id] ?? {}
        return {
          id: r.id,
          student_id: r.student_id,
          full_name: s.profile?.full_name ?? '—',
          grade_level: s.grade_level ?? '—',
          section: s.section ?? '',
          amount: Number(r.amount),
          payment_method: r.payment_method ?? 'transfer',
          reference_number: r.reference_number,
          receipt_url: r.receipt_url,
          notes: r.notes,
          submitted_at: r.submitted_at,
          status: r.status ?? 'pending_review',
          reject_reason: r.reject_reason,
        }
      })

      setReceipts(rows)
    } catch {
      toast.error('Error al cargar comprobantes')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const approve = async (r: Receipt) => {
    setProcessing(r.id)
    const now = new Date().toISOString()

    const { error: e1 } = await db.from('payment_receipts').update({
      status: 'approved',
      reviewed_by: profile?.id,
      reviewed_at: now,
    }).eq('id', r.id)

    if (e1) { toast.error('Error al aprobar'); setProcessing(null); return }

    // Register in payments table
    await db.from('payments').insert({
      student_id: r.student_id,
      amount: r.amount,
      concept: 'Cuota mensual',
      payment_date: r.submitted_at?.split('T')[0] ?? now.split('T')[0],
      payment_method: r.payment_method,
      status: 'paid',
      receipt_number: r.reference_number,
      notes: `Comprobante validado por colectoría`,
    })

    toast.success('Comprobante aprobado y pago registrado')
    setProcessing(null)
    load()
  }

  const reject = async (id: string) => {
    if (!rejectReason.trim()) { toast.error('Ingresa un motivo de rechazo'); return }
    setProcessing(id)
    const { error } = await db.from('payment_receipts').update({
      status: 'rejected',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
      reject_reason: rejectReason.trim(),
    }).eq('id', id)
    setProcessing(null)
    if (error) { toast.error('Error al rechazar'); return }
    toast.success('Comprobante rechazado')
    setRejectingId(null)
    setRejectReason('')
    load()
  }

  const filtered = receipts.filter(r => r.status === tab)
  const counts = {
    pending_review: receipts.filter(r => r.status === 'pending_review').length,
    approved: receipts.filter(r => r.status === 'approved').length,
    rejected: receipts.filter(r => r.status === 'rejected').length,
  }

  const tabConfig = [
    { key: 'pending_review' as const, label: 'Pendientes', icon: Clock, color: 'text-amber-600' },
    { key: 'approved' as const, label: 'Aprobados', icon: CheckCircle, color: 'text-emerald-600' },
    { key: 'rejected' as const, label: 'Rechazados', icon: XCircle, color: 'text-red-500' },
  ]

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="page-title">Validación de Comprobantes</h1>
        <p className="page-subtitle">Revisa y aprueba los comprobantes de pago enviados por los padres</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabConfig.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t.key ? 'bg-eos-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-semibold',
              tab === t.key ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
            )}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 gap-2">
          <AlertCircle className="w-8 h-8 text-slate-200" />
          <p className="text-slate-400 text-sm">Sin comprobantes en esta categoría</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800">{r.full_name}</p>
                  <p className="text-xs text-slate-400">{r.grade_level} {r.section}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-emerald-600">${r.amount.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">{METHOD_LABELS[r.payment_method] ?? r.payment_method}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {r.reference_number && (
                  <div>
                    <p className="text-slate-400">Referencia</p>
                    <p className="font-mono text-slate-700">{r.reference_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-400">Enviado</p>
                  <p className="text-slate-700">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('es-SV') : '—'}</p>
                </div>
                {r.receipt_url && (
                  <div>
                    <p className="text-slate-400">Comprobante</p>
                    <a href={r.receipt_url} target="_blank" rel="noopener noreferrer"
                      className="text-eos-600 hover:underline flex items-center gap-1">
                      Ver archivo <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {r.notes && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">{r.notes}</p>
              )}

              {r.status === 'rejected' && r.reject_reason && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span><b>Motivo de rechazo:</b> {r.reject_reason}</span>
                </div>
              )}

              {tab === 'pending_review' && (
                <div className="space-y-2">
                  {rejectingId === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Motivo del rechazo..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason('') }}
                          className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => reject(r.id)}
                          disabled={processing === r.id}
                          className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {processing === r.id ? 'Rechazando…' : 'Confirmar rechazo'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejectingId(r.id)}
                        className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => approve(r)}
                        disabled={processing === r.id}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processing === r.id
                          ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <><CheckCircle className="w-4 h-4" /> Aprobar</>}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
