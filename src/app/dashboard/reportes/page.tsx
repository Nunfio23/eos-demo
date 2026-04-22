'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, exportToCSV } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import { TrendingUp, TrendingDown, DollarSign, Download, BarChart3 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import BackButton from '@/components/ui/BackButton'

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

export default function ReportesPage() {
  const [payments, setPayments] = useState<{ amount: number; status: string; payment_date: string; concept: string }[]>([])
  const [expenses, setExpenses] = useState<{ amount: number; category: string; expense_date: string; description: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('payments').select('amount, status, payment_date, concept'),
      supabase.from('expenses').select('amount, category, expense_date, description'),
    ])
    setPayments(p ?? [])
    setExpenses(e ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load])

  const totalIncome = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const balance = totalIncome - totalExpenses

  // Monthly chart data (last 6 months)
  const now = new Date()
  const monthlyData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const start = d.toISOString()
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
    return {
      mes: d.toLocaleString('es', { month: 'short' }),
      Ingresos: payments.filter(p => p.payment_date >= start && p.payment_date < end && p.status === 'paid')
        .reduce((s, p) => s + p.amount, 0),
      Gastos: expenses.filter(e => e.expense_date >= start && e.expense_date < end)
        .reduce((s, e) => s + e.amount, 0),
    }
  })

  // Expenses by category
  const expByCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const handleExport = () => {
    const data = [
      ...payments.map(p => ({ tipo: 'Ingreso', concepto: p.concept, monto: p.amount, fecha: p.payment_date, estado: p.status })),
      ...expenses.map(e => ({ tipo: 'Gasto', concepto: e.description, monto: e.amount, fecha: e.expense_date, estado: e.category })),
    ]
    exportToCSV(data, 'reporte_financiero')
  }

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-eos-50 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-eos-600" />
          </div>
          <div>
            <h1 className="page-title">Reportes Financieros</h1>
            <p className="page-subtitle">Análisis completo de ingresos y gastos</p>
          </div>
        </div>
        <button onClick={handleExport} className="btn-secondary">
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title="Total Ingresos" value={formatCurrency(totalIncome)} icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatCard title="Total Gastos" value={formatCurrency(totalExpenses)} icon={TrendingDown} iconColor="text-red-500" iconBg="bg-red-50" />
        <StatCard
          title="Balance Neto"
          value={formatCurrency(balance)}
          icon={DollarSign}
          iconColor={balance >= 0 ? 'text-eos-600' : 'text-red-500'}
          iconBg={balance >= 0 ? 'bg-eos-50' : 'bg-red-50'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly bar chart */}
        <div className="card p-6 lg:col-span-2">
          <h3 className="font-semibold text-slate-900 mb-1">Ingresos vs Gastos Mensuales</h3>
          <p className="text-xs text-slate-400 mb-5">Últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
              />
              <Bar dataKey="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expenses by category */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-1">Gastos por Categoría</h3>
          <p className="text-xs text-slate-400 mb-4">Distribución total</p>
          {expByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={expByCategory} cx="50%" cy="45%" outerRadius={80} dataKey="value" paddingAngle={2}>
                  {expByCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconSize={8} formatter={v => <span className="text-xs text-slate-600">{v}</span>} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), '']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Sin datos de gastos
            </div>
          )}
        </div>
      </div>

      {/* Top expenses table */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Resumen por Categoría de Gastos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Total Gastos</th>
                <th>% del Total</th>
                <th>Transacciones</th>
              </tr>
            </thead>
            <tbody>
              {expByCategory.sort((a, b) => b.value - a.value).map((cat, i) => (
                <tr key={i}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="font-medium text-slate-800">{cat.name}</span>
                    </div>
                  </td>
                  <td className="font-semibold text-red-600">{formatCurrency(cat.value)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full max-w-24">
                        <div
                          className="h-1.5 rounded-full bg-eos-500"
                          style={{ width: `${totalExpenses ? (cat.value / totalExpenses * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        {totalExpenses ? (cat.value / totalExpenses * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="text-slate-500">
                    {expenses.filter(e => e.category === cat.name).length}
                  </td>
                </tr>
              ))}
              {expByCategory.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
