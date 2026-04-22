'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { DollarSign, TrendingDown, TrendingUp, FileText, ArrowRight } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import BackButton from '@/components/ui/BackButton'

export default function ContabilidadDashboard() {
  const { profile } = useAuth()

  return (
    <div className="space-y-8">
      <BackButton />
      <div>
        <h1 className="page-title">Panel de Contabilidad</h1>
        <p className="page-subtitle">Bienvenido, {profile?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title="Ingresos del Mes" value="—" icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatCard title="Gastos del Mes" value="—" icon={TrendingDown} iconColor="text-red-500" iconBg="bg-red-50" />
        <StatCard title="Balance" value="—" icon={DollarSign} iconColor="text-eos-600" iconBg="bg-eos-50" />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Acceso Rápido</h3>
        <div className="space-y-3">
          {[
            { label: 'Registrar Pago', href: '/dashboard/finanzas/pagos', icon: DollarSign },
            { label: 'Registrar Gasto', href: '/dashboard/finanzas/gastos', icon: TrendingDown },
            { label: 'Reportes Financieros', href: '/dashboard/reportes', icon: FileText },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-eos-200 hover:bg-eos-50/30 transition-all group">
              <Icon className="w-5 h-5 text-eos-600" />
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-eos-500 ml-auto" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
