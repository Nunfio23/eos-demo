'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import StatCard from '@/components/ui/StatCard'
import { Users, Package, GraduationCap, UserCheck, ArrowRight, Building2 } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

export default function AdministracionDashboard() {
  const { profile } = useAuth()

  return (
    <div className="space-y-8">
      <BackButton />
      <div>
        <h1 className="page-title">Panel Administrativo</h1>
        <p className="page-subtitle">Bienvenido, {profile?.full_name} · Colegio E-OS Demo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Estudiantes" value="—" icon={GraduationCap} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatCard title="Docentes" value="—" icon={UserCheck} iconColor="text-violet-600" iconBg="bg-violet-50" />
        <StatCard title="Usuarios" value="—" icon={Users} iconColor="text-eos-600" iconBg="bg-eos-50" />
        <StatCard title="Inventario" value="—" icon={Package} iconColor="text-amber-500" iconBg="bg-amber-50" />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-eos-600" />
          Módulos Disponibles
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Gestión de Usuarios', href: '/dashboard/usuarios', icon: Users },
            { label: 'Estudiantes', href: '/dashboard/estudiantes', icon: GraduationCap },
            { label: 'Inventario', href: '/dashboard/inventario', icon: Package },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-eos-200 hover:bg-eos-50/30 transition-all group">
              <Icon className="w-5 h-5 text-eos-600" />
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-eos-500 ml-auto transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
