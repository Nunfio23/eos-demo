'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import StatCard from '@/components/ui/StatCard'
import type { Expense } from '@/types/database'
import toast from 'react-hot-toast'
import { Plus, TrendingDown, Calendar } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

const CATEGORIES = [
  'Salarios', 'Servicios Básicos', 'Material Didáctico', 'Mantenimiento',
  'Tecnología', 'Alimentación', 'Transporte', 'Administrativo', 'Otros'
]

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    category: 'Administrativo', description: '', amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash', notes: ''
  })
  const [saving, setSaving] = useState(false)

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    setExpenses(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadExpenses().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadExpenses])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthlyExpenses = expenses.filter(e => e.expense_date >= startOfMonth)
    .reduce((s, e) => s + e.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

  const handleSave = async () => {
    if (!form.description || !form.amount) {
      toast.error('Descripción y monto son requeridos')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('expenses').insert({
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) { toast.error('Error al registrar'); return }
    toast.success('Gasto registrado')
    setModal(false)
    loadExpenses()
  }

  const columns = [
    { key: 'category', label: 'Categoría', render: (e: Expense) => (
      <span className="badge bg-eos-50 text-eos-700">{e.category}</span>
    )},
    { key: 'description', label: 'Descripción', render: (e: Expense) => (
      <span className="text-sm text-slate-800">{e.description}</span>
    )},
    { key: 'amount', label: 'Monto', render: (e: Expense) => (
      <span className="font-semibold text-red-600">{formatCurrency(e.amount)}</span>
    )},
    { key: 'expense_date', label: 'Fecha', render: (e: Expense) => formatDate(e.expense_date) },
    { key: 'payment_method', label: 'Método', render: (e: Expense) => (
      <span className="capitalize text-sm text-slate-600">{e.payment_method}</span>
    )},
    { key: 'notes', label: 'Notas', render: (e: Expense) => e.notes ?? '—' },
  ]

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Gastos</h1>
          <p className="page-subtitle">Control de egresos institucionales</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Gastos del Mes"
          value={formatCurrency(monthlyExpenses)}
          icon={Calendar}
          iconColor="text-orange-500"
          iconBg="bg-orange-50"
        />
        <StatCard
          title="Total Gastos"
          value={formatCurrency(totalExpenses)}
          icon={TrendingDown}
          iconColor="text-red-500"
          iconBg="bg-red-50"
        />
        <StatCard
          title="Mayor Gasto"
          value={topCategory ? topCategory[0] : '—'}
          subtitle={topCategory ? formatCurrency(topCategory[1]) : ''}
          icon={TrendingDown}
          iconColor="text-slate-500"
          iconBg="bg-slate-100"
        />
      </div>

      <DataTable
        data={expenses as unknown as Record<string, unknown>[]}
        columns={columns as Parameters<typeof DataTable>[0]['columns']}
        loading={loading}
        onRefresh={loadExpenses}
        exportFilename="gastos"
        actions={
          <button onClick={() => setModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Registrar Gasto
          </button>
        }
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Registrar Gasto">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Categoría *</label>
              <select className="input" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Monto *</label>
              <input type="number" step="0.01" className="input" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="label">Descripción *</label>
            <input className="input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe el gasto" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Método de Pago</label>
              <select className="input" value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="check">Cheque</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Registrando...' : 'Registrar Gasto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
