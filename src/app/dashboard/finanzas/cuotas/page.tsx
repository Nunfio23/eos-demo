'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { DollarSign, Search, Pencil, Check, X, AlertCircle, Users, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

interface StudentFeeRow {
  student_id: string
  full_name: string
  enrollment_number: string
  grade_level: string
  section: string
  monthly_amount: number | null
  fee_id: string | null
}

export default function CuotasPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<StudentFeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const isMaster = profile?.role === 'master' || profile?.role === 'administracion'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: students }, { data: fees }] = await Promise.all([
        db.from('students')
          .select('id, enrollment_number, grade_level, section, profile:profiles!students_user_id_fkey(full_name)')
          .eq('is_active', true)
          .order('grade_level').order('section'),
        db.from('student_fees').select('id, student_id, monthly_amount, effective_from'),
      ])

      const feeMap: Record<string, any> = {}
      ;(fees ?? []).forEach((f: any) => { feeMap[f.student_id] = f })

      const result: StudentFeeRow[] = (students ?? []).map((s: any) => ({
        student_id: s.id,
        full_name: s.profile?.full_name ?? '—',
        enrollment_number: s.enrollment_number ?? '—',
        grade_level: s.grade_level ?? '—',
        section: s.section ?? '',
        monthly_amount: feeMap[s.id]?.monthly_amount ?? null,
        fee_id: feeMap[s.id]?.id ?? null,
      }))

      setRows(result)
    } catch {
      toast.error('Error al cargar datos')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const startEdit = (row: StudentFeeRow) => {
    setEditingId(row.student_id)
    setEditAmount(row.monthly_amount != null ? String(row.monthly_amount) : '')
  }

  const saveEdit = async (row: StudentFeeRow) => {
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount < 0) { toast.error('Monto inválido'); return }
    setSaving(true)
    const now = new Date().toISOString()
    const payload = {
      student_id: row.student_id,
      monthly_amount: amount,
      assigned_by: profile?.id,
      assigned_at: now,
      effective_from: now.split('T')[0],
      updated_at: now,
    }
    const { error } = row.fee_id
      ? await db.from('student_fees').update(payload).eq('id', row.fee_id)
      : await db.from('student_fees').insert(payload)
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Cuota actualizada')
    setEditingId(null)
    load()
  }

  const filtered = rows.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.grade_level.toLowerCase().includes(search.toLowerCase()) ||
    r.enrollment_number.toLowerCase().includes(search.toLowerCase())
  )

  const withFee = rows.filter(r => r.monthly_amount != null)
  const totalMonthly = withFee.reduce((s, r) => s + (r.monthly_amount ?? 0), 0)

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="page-title">Cuotas por Estudiante</h1>
        <p className="page-subtitle">Asignar y modificar cuotas de estudiantes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total alumnos', value: rows.length, icon: Users, color: 'text-slate-600' },
          { label: 'Con cuota', value: withFee.length, icon: Check, color: 'text-emerald-600' },
          { label: 'Sin cuota', value: rows.length - withFee.length, icon: AlertCircle, color: 'text-red-500' },
          { label: 'Proyección mensual', value: `$${totalMonthly.toFixed(2)}`, icon: TrendingUp, color: 'text-violet-600' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={cn('w-4 h-4', s.color)} />
              <span className="text-xs text-slate-400">{s.label}</span>
            </div>
            <p className="text-xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4 flex items-center gap-3 bg-violet-50 border border-violet-100">
        <TrendingUp className="w-5 h-5 text-violet-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-violet-900">
            Proyección anual (10 meses): ${(totalMonthly * 10).toFixed(2)}
          </p>
          <p className="text-xs text-violet-600">
            {withFee.length} estudiantes con cuota × 10 meses escolares
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, grado o código..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Estudiante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Grado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Cuota/mes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Proyección anual</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Estado</th>
                {isMaster && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(row => (
                <tr key={row.student_id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.full_name}</p>
                    <p className="text-xs text-slate-400">{row.enrollment_number}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{row.grade_level} {row.section}</td>
                  <td className="px-4 py-3 text-right">
                    {editingId === row.student_id ? (
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editAmount}
                          onChange={e => setEditAmount(e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-eos-500"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(row); if (e.key === 'Escape') setEditingId(null) }}
                        />
                      </div>
                    ) : (
                      <span className={cn('font-semibold', row.monthly_amount != null ? 'text-slate-800' : 'text-slate-300')}>
                        {row.monthly_amount != null ? `$${row.monthly_amount.toFixed(2)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs">
                    {row.monthly_amount != null ? `$${(row.monthly_amount * 10).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.monthly_amount != null ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Asignada</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Sin cuota</span>
                    )}
                  </td>
                  {isMaster && (
                    <td className="px-4 py-3">
                      {editingId === row.student_id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => saveEdit(row)}
                            disabled={saving}
                            className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(row)}
                          className="p-1.5 text-slate-300 hover:text-eos-600 hover:bg-eos-50 rounded-lg transition-colors float-right"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <DollarSign className="w-8 h-8 text-slate-200" />
              <p className="text-slate-400 text-sm">Sin resultados</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
