'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateTime, ROLE_LABELS, ROLE_COLORS } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import {
  Users, GraduationCap, UserCheck, DollarSign,
  TrendingDown, TrendingUp, Activity, ArrowRight,
  BookOpen, Package, AlertCircle, CheckCircle,
  UserPlus, Clock, Shield, LayoutDashboard
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, Legend
} from 'recharts'
import type { MasterStats } from '@/types/database'
import { CardSkeleton } from '@/components/ui/LoadingSkeleton'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { withTimeout } from '@/lib/db'
import { useAuth } from '@/lib/auth-context'
import BackButton from '@/components/ui/BackButton'
import { apiUrl } from '@/lib/api-url'
import PermissionsTab from './PermissionsTab'

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

export default function MasterDashboard() {
  const { profile } = useAuth()
  const isDireccion = profile?.role === 'direccion'

  const [activeTab, setActiveTab] = useState<'dashboard' | 'permisos'>('dashboard')

  const [stats, setStats] = useState<Partial<MasterStats>>({
    totalStudents: 0, totalTeachers: 0, totalUsers: 0,
    totalIncome: 0, monthlyIncome: 0, totalExpenses: 0, pendingPayments: 0,
  })
  const [financeKPIs, setFinanceKPIs] = useState({ annualProjection: 0, collected: 0, pending: 0, pct: 0, pendingComprobantes: 0 })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrated, setMigrated] = useState(false)

  const runMigration = async () => {
    setMigrating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(apiUrl('/api/run-migration'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const json = await res.json()
    setMigrating(false)
    if (res.ok) { setMigrated(true); alert('✅ Migración ejecutada: ' + json.message) }
    else alert('❌ Error: ' + json.error)
  }
  interface RecentLogin { user_id: string; full_name: string; role: string; last_sign_in: string; email: string }
  const [recentActivity, setRecentActivity] = useState<RecentLogin[]>([])
  const [incomeData, setIncomeData] = useState<{ month: string; ingresos: number; gastos: number }[]>([])
  const [roleDistribution, setRoleDistribution] = useState<{ name: string; value: number }[]>([])

  const loadStats = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Un solo query para todos los perfiles — evita head:true que puede no enviar token
      const [
        { data: allProfiles, error: e0 },
        { data: expenses },
        { data: activity },
        { data: fees },
        { data: receipts },
        { data: pendingRec },
      ] = await Promise.all([
        withTimeout(supabase.from('profiles').select('role, is_active'), 10000),
        withTimeout(supabase.from('expenses').select('amount, expense_date'), 10000),
        withTimeout((supabase as any).rpc('get_recent_logins', { limit_count: 8 }), 10000),
        withTimeout((supabase as any).from('student_fees').select('monthly_amount'), 10000),
        withTimeout((supabase as any).from('payment_receipts').select('amount, submitted_at, status').eq('status', 'approved'), 10000),
        withTimeout((supabase as any).from('payment_receipts').select('id').eq('status', 'pending_review'), 10000),
      ])

      if (e0) { setLoadError(true); return }

      const activeProfiles = (allProfiles ?? []) as any[]
      const totalStudents = activeProfiles.filter(p => p.role === 'alumno' && p.is_active).length
      const totalTeachers = activeProfiles.filter(p => p.role === 'docente' && p.is_active).length
      const totalUsers = activeProfiles.filter(p => p.is_active).length
      const profiles = activeProfiles

      // Finance KPIs — new flow: student_fees + payment_receipts (approved)
      const now = new Date()
      const currentYear = now.getFullYear()
      const feesArr = (fees as any[] ?? [])
      const receiptsArr = (receipts as any[] ?? [])
      const pendingRecArr = (pendingRec as any[] ?? [])
      const expensesArr = (expenses as any[] ?? [])

      const annualProjection = feesArr.reduce((s: number, f: any) => s + Number(f.monthly_amount) * 12, 0)
      const collected = receiptsArr
        .filter((r: any) => new Date(r.submitted_at).getFullYear() === currentYear)
        .reduce((s: number, r: any) => s + Number(r.amount), 0)
      const pending = Math.max(0, annualProjection - collected)
      const pct = annualProjection > 0 ? Math.round((collected / annualProjection) * 100) : 0
      const pendingComprobantes = pendingRecArr.length

      setFinanceKPIs({ annualProjection, collected, pending, pct, pendingComprobantes })

      const totalExpenses = expensesArr.reduce((sum: number, e: any) => sum + e.amount, 0)

      setStats({
        totalStudents: totalStudents ?? 0,
        totalTeachers: totalTeachers ?? 0,
        totalUsers: totalUsers ?? 0,
        totalIncome: collected,
        monthlyIncome: collected,
        totalExpenses,
        pendingPayments: pendingComprobantes,
      })

      setRecentActivity((activity ?? []) as RecentLogin[])

      // Build role distribution
      const roleCounts: Record<string, number> = {}
      profiles.forEach((p: any) => {
        roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1
      })
      setRoleDistribution(
        Object.entries(roleCounts).map(([name, value]) => ({
          name: ROLE_LABELS[name as keyof typeof ROLE_LABELS] ?? name,
          value
        }))
      )

      // Build last 6 months chart from approved payment_receipts
      const months = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        return {
          month: d.toLocaleString('es', { month: 'short' }),
          start: d.toISOString(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString(),
        }
      })

      const chartData = months.map(({ month, start, end }) => ({
        month,
        ingresos: receiptsArr
          .filter((r: any) => r.submitted_at >= start && r.submitted_at < end)
          .reduce((s: number, r: any) => s + Number(r.amount), 0),
        gastos: expensesArr
          .filter((e: any) => e.expense_date >= start && e.expense_date < end)
          .reduce((s: number, e: any) => s + e.amount, 0),
      }))
      setIncomeData(chartData)

    } catch (err) {
      console.error('Error loading stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const safety = setTimeout(() => setLoading(false), 25000)
    loadStats().finally(() => clearTimeout(safety))
    return () => clearTimeout(safety)
  }, [loadStats])

  if (!loading && loadError) return (
    <div className="p-4">
      <ErrorDisplay error={new Error('No se pudo cargar el dashboard. Revisa tu conexión.')} onRetry={loadStats} />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      <BackButton />
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">{isDireccion ? 'Dashboard Dirección' : 'Dashboard Master'}</h1>
          <p className="page-subtitle">{isDireccion ? 'Panel académico y administrativo' : 'Panel de control completo'} · Colegio E-OS Demo</p>
        </div>
        <div className="flex items-center gap-2">
          {!isDireccion && !migrated && (
            <button onClick={runMigration} disabled={migrating}
              className="btn-secondary text-xs flex items-center gap-1.5">
              {migrating ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {migrating ? 'Aplicando...' : 'Aplicar Fix RLS'}
            </button>
          )}
          <Link href="/dashboard/usuarios" className="btn-primary">
            <UserPlus className="w-4 h-4" />
            Nuevo Usuario
          </Link>
        </div>
      </div>

      {/* Tabs — solo para master (no direccion) */}
      {!isDireccion && (
        <div className="flex gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'dashboard'
                ? 'border-eos-600 text-eos-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('permisos')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'permisos'
                ? 'border-eos-600 text-eos-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Shield className="w-4 h-4" />
            Roles y Permisos
          </button>
        </div>
      )}

      {/* Tab: Permisos */}
      {!isDireccion && activeTab === 'permisos' && <PermissionsTab />}

      {/* Tab: Dashboard (contenido original) */}
      {(isDireccion || activeTab === 'dashboard') && <>

      {/* Stats Grid — 4 cards en una sola fila */}
      {loading ? <CardSkeleton count={4} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Total Estudiantes"
            value={stats.totalStudents ?? 0}
            subtitle="Matriculados activos"
            icon={GraduationCap}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            trend={{ value: 5, label: 'vs mes anterior' }}
          />
          <StatCard
            title="Total Docentes"
            value={stats.totalTeachers ?? 0}
            subtitle="Docentes activos"
            icon={UserCheck}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
          {isDireccion ? (
            <>
              <StatCard
                title="Total Usuarios"
                value={stats.totalUsers ?? 0}
                subtitle="Todos los roles"
                icon={Users}
                iconColor="text-eos-600"
                iconBg="bg-eos-50"
              />
              <StatCard
                title="Módulos Activos"
                value="11"
                subtitle="Todos operativos"
                icon={Activity}
                iconColor="text-cyan-600"
                iconBg="bg-cyan-50"
              />
            </>
          ) : (
            <>
              <StatCard
                title="Cobrado (año)"
                value={formatCurrency(financeKPIs.collected)}
                subtitle={`Proyección: ${formatCurrency(financeKPIs.annualProjection)}`}
                icon={TrendingUp}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
              />
              <StatCard
                title="Pendiente"
                value={formatCurrency(financeKPIs.pending)}
                subtitle={`${financeKPIs.pct}% cumplimiento · ${financeKPIs.pendingComprobantes} por validar`}
                icon={TrendingDown}
                iconColor="text-red-500"
                iconBg="bg-red-50"
              />
            </>
          )}
        </div>
      )}

      {/* Segunda fila de stats — solo master, con sección diferenciada */}
      {!isDireccion && !loading && (
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4">Resumen operativo</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatCard
              title="Total Usuarios"
              value={stats.totalUsers ?? 0}
              subtitle="Todos los roles"
              icon={Users}
              iconColor="text-eos-600"
              iconBg="bg-eos-50"
            />
            <StatCard
              title="Balance Neto"
              value={formatCurrency((stats.totalIncome ?? 0) - (stats.totalExpenses ?? 0))}
              subtitle="Ingresos menos gastos"
              icon={DollarSign}
              iconColor="text-gold-600"
              iconBg="bg-amber-50"
            />
            <StatCard
              title="Módulos Activos"
              value="11"
              subtitle="Todos operativos"
              icon={Activity}
              iconColor="text-cyan-600"
              iconBg="bg-cyan-50"
            />
          </div>
        </div>
      )}

      {/* Finance projection strip */}
      {!isDireccion && !loading && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Proyección Financiera {new Date().getFullYear()}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Cuotas de estudiantes — cobrado vs proyectado</p>
            </div>
            <Link href="/dashboard/finanzas/proyeccion" className="text-xs text-eos-600 hover:underline flex items-center gap-1">
              Ver detalle <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            {[
              { label: 'Proyección anual', value: formatCurrency(financeKPIs.annualProjection), color: 'text-slate-700' },
              { label: 'Cobrado real',     value: formatCurrency(financeKPIs.collected),        color: 'text-emerald-600' },
              { label: 'Pendiente',        value: formatCurrency(financeKPIs.pending),           color: 'text-red-500' },
              { label: 'Por validar',      value: `${financeKPIs.pendingComprobantes} comprobantes`, color: 'text-amber-600' },
            ].map(k => (
              <div key={k.label}>
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
            <div className="flex-1 min-w-48">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Cumplimiento</span>
                <span className="font-semibold">{financeKPIs.pct}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`h-2 rounded-full transition-all ${financeKPIs.pct >= 80 ? 'bg-emerald-500' : financeKPIs.pct >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, financeKPIs.pct)}%` }} />
              </div>
            </div>
            {financeKPIs.pendingComprobantes > 0 && (
              <Link href="/dashboard/finanzas/comprobantes"
                className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors">
                <Clock className="w-3.5 h-3.5" />
                Validar ahora
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className={`grid grid-cols-1 gap-6 ${!isDireccion ? 'lg:grid-cols-3' : ''}`}>
        {/* Income Chart — solo master */}
        {!isDireccion && <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-slate-900">Flujo Financiero</h3>
              <p className="text-xs text-slate-400 mt-0.5">Últimos 6 meses · Ingresos vs Gastos</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={incomeData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
              />
              <Area type="monotone" dataKey="ingresos" stroke="#6366f1" strokeWidth={2}
                fill="url(#colorIngresos)" name="Ingresos" />
              <Area type="monotone" dataKey="gastos" stroke="#ef4444" strokeWidth={2}
                fill="url(#colorGastos)" name="Gastos" />
            </AreaChart>
          </ResponsiveContainer>
        </div>}

        {/* Role Distribution */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-1">Usuarios por Rol</h3>
          <p className="text-xs text-slate-400 mb-4">Distribución del sistema</p>
          {roleDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={isDireccion ? 300 : 200}>
              <PieChart>
                <Pie data={roleDistribution} cx="50%" cy="45%" innerRadius={isDireccion ? 80 : 50} outerRadius={isDireccion ? 130 : 80}
                  paddingAngle={3} dataKey="value">
                  {roleDistribution.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8}
                  formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                <Tooltip formatter={(v: number) => [v, 'usuarios']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Sin datos disponibles
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Actividad Reciente</h3>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivity.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">
                No hay actividad reciente
              </div>
            ) : (
              recentActivity.map((log) => (
                <div key={log.user_id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-full bg-eos-100 text-eos-700 flex items-center justify-center shrink-0 text-xs font-bold">
                    {log.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 font-medium truncate">{log.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{log.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[log.role as keyof typeof ROLE_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ROLE_LABELS[log.role as keyof typeof ROLE_LABELS] ?? log.role}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(log.last_sign_in)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Access Modules */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Acceso Rápido</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Gestión de Usuarios', href: '/dashboard/usuarios', icon: Users, color: 'bg-eos-50 text-eos-600' },
              { label: 'Académico', href: '/dashboard/academico', icon: BookOpen, color: 'bg-blue-50 text-blue-600' },
              ...(!isDireccion ? [
                { label: 'Finanzas', href: '/dashboard/finanzas', icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
                { label: 'Inventario', href: '/dashboard/inventario', icon: Package, color: 'bg-amber-50 text-amber-600' },
              ] : []),
              { label: 'Estudiantes', href: '/dashboard/estudiantes', icon: GraduationCap, color: 'bg-violet-50 text-violet-600' },
              { label: 'Reportes', href: '/dashboard/reportes', icon: Activity, color: 'bg-cyan-50 text-cyan-600' },
            ].map(({ label, href, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{label}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      </> /* fin tab dashboard */}
    </div>
  )
}
