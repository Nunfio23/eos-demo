'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { DollarSign, Upload, CheckCircle, Clock, X, AlertCircle, Image, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

interface ChildPayment {
  student_id: string
  full_name: string
  grade_level: string
  section: string
  monthly_amount: number | null
  paid_months: Set<number>
  pending_months: number
  pending_receipts: number
}

interface SubmittedReceipt {
  id: string
  amount: number
  reference_number: string | null
  receipt_url: string | null
  notes: string | null
  submitted_at: string
  status: string
  reject_reason: string | null
}

export default function MisPagosPage() {
  const { profile } = useAuth()
  const [children, setChildren] = useState<ChildPayment[]>([])
  const [receipts, setReceipts] = useState<SubmittedReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedChild, setSelectedChild] = useState<ChildPayment | null>(null)
  const [form, setForm] = useState({ amount: '', reference_number: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [activePeriods, setActivePeriods] = useState<number[]>([])

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  // Detail modal
  const [detailReceipt, setDetailReceipt] = useState<SubmittedReceipt | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const year = new Date().getFullYear()
      const currentMonth = new Date().getMonth() + 1

      // Obtener IDs de hijos: student_parents (nueva tabla) + fallback a students.parent_id (legacy)
      const { data: spRows } = await db.from('student_parents').select('student_id').eq('parent_id', profile.id)
      const spIds = (spRows ?? []).map((r: any) => r.student_id)
      const { data: legacyRaw } = await db.from('students').select('id').eq('parent_id', profile.id)
      const legacyIds = (legacyRaw ?? []).map((r: any) => r.id).filter((id: string) => !spIds.includes(id))
      const allChildIds = [...new Set([...spIds, ...legacyIds])]

      const [{ data: students }, { data: fees }, { data: recs }] =
        await Promise.all([
          allChildIds.length > 0
            ? db.from('students')
                .select('id, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
                .in('id', allChildIds).eq('is_active', true)
            : Promise.resolve({ data: [] }),
          db.from('student_fees').select('student_id, monthly_amount'),
          db.from('payment_receipts')
            .select('id, student_id, amount, reference_number, receipt_url, notes, submitted_at, status, reject_reason')
            .order('submitted_at', { ascending: false }),
        ])

      const feeMap: Record<string, number> = {}
      ;(fees ?? []).forEach((f: any) => { feeMap[f.student_id] = Number(f.monthly_amount) })

      const studentIds = (students ?? []).map((s: any) => s.id)

      // Load payments using due_date (authoritative month), not payment_date
      const { data: payments } = studentIds.length > 0
        ? await db.from('payments')
            .select('student_id, due_date, payment_date, status')
            .in('student_id', studentIds)
            .eq('year', year)
        : { data: [] }

      // Show all 12 months; front-end filters future ones visually
      setActivePeriods([1,2,3,4,5,6,7,8,9,10,11,12])

      // Build status map: student_id → month → status
      const monthStatus: Record<string, Record<number, string>> = {}
      ;(payments ?? []).forEach((p: any) => {
        if (!p.due_date) return
        const m = new Date(p.due_date + 'T12:00:00').getMonth() + 1
        if (!monthStatus[p.student_id]) monthStatus[p.student_id] = {}
        monthStatus[p.student_id][m] = p.status
      })

      const pendingCount: Record<string, number> = {}
      ;(recs ?? []).filter((r: any) => r.status === 'pending_review').forEach((r: any) => {
        pendingCount[r.student_id] = (pendingCount[r.student_id] ?? 0) + 1
      })

      const childRows: ChildPayment[] = (students ?? []).map((s: any) => {
        const statuses = monthStatus[s.id] ?? {}
        // Count months ≤ currentMonth that are not paid
        const pendingMonths = Object.entries(statuses)
          .filter(([m, st]) => Number(m) <= currentMonth && st !== 'paid')
          .length
        return {
          student_id: s.id,
          full_name: s.profile?.full_name ?? '—',
          grade_level: s.grade_level ?? '—',
          section: s.section ?? '',
          monthly_amount: feeMap[s.id] ?? null,
          paid_months: new Set(
            Object.entries(statuses)
              .filter(([, st]) => st === 'paid')
              .map(([m]) => Number(m))
          ),
          pending_months: pendingMonths,
          pending_receipts: pendingCount[s.id] ?? 0,
        }
      })
      setChildren(childRows)

      const myReceipts = (recs ?? []).filter((r: any) => studentIds.includes(r.student_id))
      setReceipts(myReceipts.map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        reference_number: r.reference_number,
        receipt_url: r.receipt_url,
        notes: r.notes,
        submitted_at: r.submitted_at,
        status: r.status,
        reject_reason: r.reject_reason,
      })))
    } catch {
      toast.error('Error al cargar pagos')
    }
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const openModal = (child: ChildPayment) => {
    setSelectedChild(child)
    setForm({ amount: child.monthly_amount != null ? String(child.monthly_amount) : '', reference_number: '', notes: '' })
    setUploadedFile(null)
    setUploadedUrl('')
    setShowModal(true)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Solo se permiten imágenes (JPG, PNG, etc.) o PDF')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no puede superar 5 MB')
      return
    }
    setUploadedFile(file)
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await (supabase as any).storage.from('receipts').upload(path, file, { upsert: true })
    if (error) {
      toast.error('Error al subir imagen')
      setUploadedFile(null)
      setUploading(false)
      return
    }
    const { data: pub } = (supabase as any).storage.from('receipts').getPublicUrl(data.path)
    setUploadedUrl(pub.publicUrl)
    setUploading(false)
    toast.success('Imagen lista')
  }

  const submit = async () => {
    if (!selectedChild) return
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Monto inválido'); return }
    if (!form.reference_number.trim() && !uploadedUrl) {
      toast.error('Ingresa número de referencia o sube un comprobante')
      return
    }
    setSubmitting(true)
    const { error } = await db.from('payment_receipts').insert({
      student_id: selectedChild.student_id,
      amount,
      payment_method: 'transfer',
      reference_number: form.reference_number.trim() || null,
      receipt_url: uploadedUrl || null,
      notes: form.notes.trim() || null,
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
    })
    setSubmitting(false)
    if (error) { toast.error('Error al enviar comprobante'); return }
    toast.success('Comprobante enviado — pendiente de validación')
    setShowModal(false)
    load()
  }

  const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending_review: { label: 'En revisión', color: 'bg-amber-100 text-amber-700', icon: Clock },
    approved:       { label: 'Aprobado',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    rejected:       { label: 'Rechazado',   color: 'bg-red-100 text-red-700',        icon: X },
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="page-title">Mis Pagos</h1>
        <p className="page-subtitle">Estado de cuotas y envío de comprobantes</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {children.map(child => (
            <div key={child.student_id} className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800 text-lg">{child.full_name}</p>
                  <p className="text-sm text-slate-400">{child.grade_level} {child.section}</p>
                </div>
                <div className="text-right">
                  {child.monthly_amount != null ? (
                    <>
                      <p className="text-2xl font-bold text-slate-800">${child.monthly_amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">cuota mensual</p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Cuota no asignada</span>
                  )}
                </div>
              </div>

              {child.pending_receipts > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {child.pending_receipts} comprobante(s) en revisión por colectoría
                </div>
              )}

              <button
                onClick={() => openModal(child)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-eos-600 text-white text-sm font-medium hover:bg-eos-700"
              >
                <Upload className="w-4 h-4" /> Enviar comprobante de pago
              </button>
            </div>
          ))}

          {children.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-12 gap-2">
              <AlertCircle className="w-8 h-8 text-slate-200" />
              <p className="text-slate-400 text-sm">No hay estudiantes vinculados a tu cuenta</p>
            </div>
          )}

          {receipts.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-slate-700 text-sm">Historial de comprobantes</h2>
              {receipts.map(r => {
                const cfg = statusConfig[r.status] ?? statusConfig.pending_review
                return (
                  <button
                    key={r.id}
                    onClick={() => setDetailReceipt(r)}
                    className="card p-4 flex items-center gap-3 flex-wrap w-full text-left hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">${r.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('es-SV') : '—'}
                        {r.reference_number && ` · Ref: ${r.reference_number}`}
                      </p>
                      {r.status === 'rejected' && r.reject_reason && (
                        <p className="text-xs text-red-600 mt-1">Rechazado: {r.reject_reason}</p>
                      )}
                    </div>
                    {r.receipt_url && (
                      <Image className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', cfg.color)}>
                      {cfg.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: enviar comprobante */}
      {showModal && selectedChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Enviar comprobante</h3>
                <p className="text-xs text-slate-400">{selectedChild.full_name}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto pagado *</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Número de referencia / transacción</label>
                <input
                  value={form.reference_number}
                  onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
                  placeholder="Ej: TXN-123456"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
                />
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Imagen del comprobante</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {uploadedFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                    {uploadedFile.type.startsWith('image/') ? (
                      <img
                        src={uploadedUrl || URL.createObjectURL(uploadedFile)}
                        alt="comprobante"
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                      />
                    ) : (
                      <FileText className="w-10 h-10 text-slate-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{uploadedFile.name}</p>
                      <p className="text-xs text-emerald-600">{uploading ? 'Subiendo...' : 'Listo'}</p>
                    </div>
                    <button
                      onClick={() => { setUploadedFile(null); setUploadedUrl('') }}
                      className="p-1 hover:bg-emerald-100 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-eos-400 hover:bg-slate-50 transition-colors"
                  >
                    <Image className="w-6 h-6 text-slate-300" />
                    <span className="text-xs text-slate-400">Toca para subir imagen o PDF</span>
                    <span className="text-xs text-slate-300">JPG, PNG, PDF · máx. 5 MB</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notas (opcional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej: Pago de enero y febrero juntos"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 resize-none"
                />
              </div>
              <p className="text-xs text-slate-400 flex items-start gap-1.5">
                <DollarSign className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Tu comprobante será revisado por colectoría antes de quedar registrado.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={submit}
                disabled={submitting || uploading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Upload className="w-4 h-4" /> Enviar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle de comprobante */}
      {detailReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Detalle del comprobante</h3>
              <button onClick={() => setDetailReceipt(null)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Status badge */}
              {(() => {
                const cfg = statusConfig[detailReceipt.status] ?? statusConfig.pending_review
                const Icon = cfg.icon
                return (
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium', cfg.color)}>
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </div>
                )
              })()}

              {/* Amount */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-sm text-slate-500">Monto</span>
                <span className="text-2xl font-bold text-slate-800">${detailReceipt.amount.toFixed(2)}</span>
              </div>

              {/* Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Fecha de envío</span>
                <span className="text-sm font-medium text-slate-700">
                  {detailReceipt.submitted_at
                    ? new Date(detailReceipt.submitted_at).toLocaleDateString('es-SV', {
                        day: '2-digit', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })
                    : '—'}
                </span>
              </div>

              {/* Reference */}
              {detailReceipt.reference_number && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Número de referencia</span>
                  <span className="text-sm font-medium text-slate-700">{detailReceipt.reference_number}</span>
                </div>
              )}

              {/* Notes */}
              {detailReceipt.notes && (
                <div>
                  <span className="text-sm text-slate-500">Notas</span>
                  <p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-xl px-3 py-2">{detailReceipt.notes}</p>
                </div>
              )}

              {/* Rejection reason */}
              {detailReceipt.status === 'rejected' && detailReceipt.reject_reason && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <p className="text-xs font-medium text-red-700 mb-0.5">Motivo de rechazo</p>
                  <p className="text-sm text-red-600">{detailReceipt.reject_reason}</p>
                </div>
              )}

              {/* Receipt image */}
              {detailReceipt.receipt_url && (
                <div>
                  <p className="text-sm text-slate-500 mb-2">Comprobante adjunto</p>
                  {detailReceipt.receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || detailReceipt.receipt_url.includes('supabase') ? (
                    <a href={detailReceipt.receipt_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={detailReceipt.receipt_url}
                        alt="comprobante"
                        className="w-full rounded-xl border border-slate-200 object-contain max-h-64"
                      />
                    </a>
                  ) : (
                    <a
                      href={detailReceipt.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-eos-600 hover:underline text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      Ver comprobante
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              <button onClick={() => setDetailReceipt(null)} className="btn-secondary w-full">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
