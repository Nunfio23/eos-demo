'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useBranding, useBrandStyle } from '@/lib/branding-context'
import { ROLE_LABELS, ROLE_COLORS, getInitials, cn } from '@/lib/utils'
import type { UserRole } from '@/types/database'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, DollarSign, Package, BarChart3, Settings,
  LogOut, ChevronLeft, ChevronRight, Zap, Building2,
  UserCheck, FileText, ShoppingBag, Wrench, Bell, ChevronDown,
  ClipboardCheck, BookMarked, TrendingUp, Monitor, Clock,
  Folder, CreditCard, MessageSquare, Store, Upload, Bot, Heart
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const db = supabase as any

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: UserRole[]
  children?: { label: string; href: string; roles?: UserRole[] }[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard/master',
    icon: LayoutDashboard,
    roles: ['master', 'direccion'],
  },
  {
    label: 'Mi Dashboard',
    href: '/dashboard/docente',
    icon: LayoutDashboard,
    roles: ['docente'],
  },
  {
    label: 'Mi Dashboard',
    href: '/dashboard/alumno',
    icon: LayoutDashboard,
    roles: ['alumno'],
  },
  {
    label: 'Mi Dashboard',
    href: '/dashboard/administracion',
    icon: LayoutDashboard,
    roles: ['administracion', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'],
  },
  {
    label: 'Mi Dashboard',
    href: '/dashboard/padre',
    icon: LayoutDashboard,
    roles: ['padre'],
  },
  {
    label: 'Mi Dashboard',
    href: '/dashboard/contabilidad',
    icon: LayoutDashboard,
    roles: ['contabilidad'],
  },
  {
    label: 'Usuarios',
    href: '/dashboard/usuarios',
    icon: Users,
    roles: ['master', 'direccion', 'administracion'],
  },
  {
    label: 'Estudiantes',
    href: '/dashboard/estudiantes',
    icon: GraduationCap,
    roles: ['master', 'direccion', 'administracion'],
  },
  {
    label: 'Equipo de Trabajo',
    href: '/dashboard/equipo',
    icon: Users,
    roles: ['master', 'contabilidad', 'direccion', 'administracion'],
    children: [
      { label: 'Personal',           href: '/dashboard/equipo' },
      { label: 'Asistencia Personal', href: '/dashboard/equipo/asistencia' },
    ],
  },
  {
    label: 'Padres de Familia',
    href: '/dashboard/padres',
    icon: Heart,
    roles: ['master'],
  },
  {
    label: 'Docentes',
    href: '/dashboard/docentes',
    icon: UserCheck,
    roles: ['direccion', 'administracion'],
  },
  {
    label: 'Académico',
    href: '/dashboard/academico',
    icon: BookOpen,
    roles: ['master', 'direccion', 'administracion', 'docente'],
    children: [
      { label: 'Niveles y Grados',  href: '/dashboard/academico',                  roles: ['master', 'direccion', 'administracion'] },
      { label: 'Libro de Notas',    href: '/dashboard/academico/notas' },
      { label: 'Calificaciones',    href: '/dashboard/academico/calificaciones' },
      { label: 'Tareas',            href: '/dashboard/academico/tareas' },
      { label: 'Parvularia',        href: '/dashboard/academico/parvularia' },
    ],
  },
  {
    label: 'Asignación de Clases',
    href: '/dashboard/academico/asignaciones',
    icon: UserCheck,
    roles: ['master'],
  },
  {
    label: 'Supervisión',
    href: '/dashboard/supervision',
    icon: TrendingUp,
    roles: ['master', 'direccion'],
    children: [
      { label: 'Monitor Docentes',    href: '/dashboard/supervision' },
      { label: 'Monitor Alumnos',     href: '/dashboard/estudiantes' },
      { label: 'Conversaciones IA',   href: '/dashboard/supervision/conversaciones', roles: ['master'] },
    ],
  },
  {
    label: 'Mi Grado',
    href: '/dashboard/mi-grado',
    icon: GraduationCap,
    roles: ['docente'],
  },
  {
    label: 'Calificaciones IA',
    href: '/dashboard/docente/calificaciones-ia',
    icon: Bot,
    roles: ['docente', 'master', 'direccion'],
  },
  {
    label: 'Mis Materias',
    href: '/dashboard/academico/materias',
    icon: BookOpen,
    roles: ['alumno', 'docente'],
  },
  {
    label: 'Mis Tareas',
    href: '/dashboard/alumno/tareas',
    icon: ClipboardList,
    roles: ['alumno'],
  },
  {
    label: 'Asistencia',
    href: '/dashboard/asistencia',
    icon: ClipboardCheck,
    roles: ['master', 'direccion', 'docente', 'contabilidad'],
  },
  {
    label: 'Horarios',
    href: '/dashboard/horarios',
    icon: Clock,
    roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre'],
  },
  {
    label: 'Aulas Virtuales',
    href: '/dashboard/aulas',
    icon: Monitor,
    roles: ['master', 'direccion', 'docente', 'alumno', 'padre'],
  },
  {
    label: 'Finanzas',
    href: '/dashboard/finanzas',
    icon: DollarSign,
    roles: ['master', 'contabilidad', 'administracion'],
    children: [
      { label: 'Cuotas', href: '/dashboard/finanzas/cuotas', roles: ['master', 'administracion'] },
      { label: 'Proyección', href: '/dashboard/finanzas/proyeccion' },
      { label: 'Comprobantes', href: '/dashboard/finanzas/comprobantes' },
      { label: 'Pagos', href: '/dashboard/finanzas/pagos' },
      { label: 'Facturación', href: '/dashboard/finanzas/facturacion' },
      { label: 'Gastos', href: '/dashboard/finanzas/gastos' },
      { label: 'Reportes', href: '/dashboard/finanzas/reportes' },
    ],
  },
  {
    label: 'Mis Pagos',
    href: '/dashboard/padre/mis-pagos',
    icon: DollarSign,
    roles: ['padre'],
  },
  {
    label: 'Matrícula',
    href: '/dashboard/matricula',
    icon: GraduationCap,
    roles: ['master', 'direccion'],
  },
  {
    label: 'Calendario',
    href: '/dashboard/calendario',
    icon: Calendar,
    roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'],
  },
  {
    label: 'Comunicados',
    href: '/dashboard/comunicados',
    icon: MessageSquare,
    roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'],
  },
  {
    label: 'Inventario',
    href: '/dashboard/inventario',
    icon: Package,
    roles: ['master', 'administracion', 'biblioteca', 'tienda', 'mantenimiento', 'contabilidad'],
  },
  {
    label: 'Biblioteca',
    href: '/dashboard/biblioteca',
    icon: BookMarked,
    roles: ['master', 'direccion', 'administracion', 'biblioteca', 'docente', 'alumno', 'padre'],
  },
  {
    label: 'Tienda Chalet',
    href: '/dashboard/tienda',
    icon: Store,
    roles: ['master', 'tienda', 'administracion', 'contabilidad', 'alumno', 'padre', 'docente'],
  },
  {
    label: 'Expediente',
    href: '/dashboard/expediente',
    icon: Folder,
    roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre'],
  },
  {
    label: 'Carnet Estudiantil',
    href: '/dashboard/carnet',
    icon: CreditCard,
    roles: ['master', 'direccion', 'administracion'],
  },
  {
    label: 'Reportes',
    href: '/dashboard/reportes',
    icon: BarChart3,
    roles: ['master', 'contabilidad', 'administracion'],
  },
  {
    label: 'Importación Masiva',
    href: '/dashboard/importar',
    icon: Upload,
    roles: ['master', 'administracion'],
  },
  {
    label: 'Configuración',
    href: '/dashboard/configuracion',
    icon: Settings,
    roles: ['master', 'direccion'],
  },
]

const LS_KEY_ANN = 'lastComunicadosVisit'

export default function Sidebar() {
  const { profile, role, signOut, blockedModules } = useAuth()
  const { schoolName, logoUrl } = useBranding()
  const brandStyle = useBrandStyle()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [staticLogoError, setStaticLogoError] = useState(false)
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0)

  // Mark all as seen when visiting comunicados
  useEffect(() => {
    if (pathname === '/dashboard/comunicados') {
      localStorage.setItem(LS_KEY_ANN, new Date().toISOString())
      setUnreadAnnouncements(0)
    }
  }, [pathname])

  // Fetch announcements posted AFTER the last visit
  useEffect(() => {
    if (!profile || pathname === '/dashboard/comunicados') return

    let cancelled = false
    const check = async () => {
      const lastVisit = localStorage.getItem(LS_KEY_ANN)
      let query = db.from('announcements').select('id', { count: 'exact', head: true })
      if (lastVisit) query = query.gt('created_at', lastVisit)
      const { count } = await query
      if (!cancelled) setUnreadAnnouncements(count ?? 0)
    }
    check()

    const channel = db
      .channel('sidebar-ann-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
        setUnreadAnnouncements(prev => prev + 1)
      })
      .subscribe()

    return () => {
      cancelled = true
      db.removeChannel(channel)
    }
  }, [profile, pathname])

  const handleSignOut = async () => {
    // Set timestamp so dot doesn't persist after re-login
    localStorage.setItem(LS_KEY_ANN, new Date().toISOString())
    await signOut()
  }

  if (!role) return null

  // Mapeo href → módulo para filtrar blocked_modules por usuario
  const HREF_TO_MODULE: Record<string, string> = {
    '/dashboard/finanzas': 'finanzas',
  }

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role)) return false
    const mod = HREF_TO_MODULE[item.href]
    if (mod && blockedModules.includes(mod)) return false
    return true
  })

  const toggleExpand = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    )
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className={cn(
      'flex flex-col h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 shrink-0',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo / Branding */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 h-16">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={schoolName}
                className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : !staticLogoError ? (
              <img
                src="/logo-colegio.png"
                alt={schoolName}
                className="w-8 h-8 rounded-lg object-contain shrink-0"
                onError={() => setStaticLogoError(true)}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold" style={brandStyle}>
                {schoolName.charAt(0)}
              </div>
            )}
            <span className="text-white font-bold text-sm truncate leading-tight">
              {schoolName}
            </span>
          </Link>
        )}
        {collapsed && (
          logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="w-8 h-8 rounded-lg object-contain bg-white/10 mx-auto" />
          ) : !staticLogoError ? (
            <img
              src="/logo-colegio.png"
              alt={schoolName}
              className="w-8 h-8 rounded-lg object-contain mx-auto"
              onError={() => setStaticLogoError(true)}
            />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-white text-sm font-bold" style={brandStyle}>
              {schoolName.charAt(0)}
            </div>
          )
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800 shrink-0',
            collapsed && 'hidden'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-3 p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          const hasChildren = item.children && item.children.length > 0
          const expanded = expandedItems.includes(item.label)

          const isComunicados = item.href === '/dashboard/comunicados'
          const showAnnDot = isComunicados && unreadAnnouncements > 0

          if (collapsed) {
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={cn(
                  'relative flex items-center justify-center p-2.5 rounded-xl transition-all',
                  active
                    ? 'bg-eos-600 text-white'
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                )}
              >
                <Icon className="w-5 h-5" />
                {showAnnDot && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-slate-900" />
                )}
              </Link>
            )
          }

          return (
            <div key={item.label}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.label)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    active
                      ? 'bg-eos-600/20 text-eos-400'
                      : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown className={cn(
                    'w-3.5 h-3.5 transition-transform',
                    expanded && 'rotate-180'
                  )} />
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    active
                      ? 'bg-eos-600 text-white shadow-sm shadow-eos-900/30'
                      : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                  )}
                >
                  <Icon className="w-4.5 h-4.5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {showAnnDot && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-slate-900 shrink-0" />
                  )}
                </Link>
              )}

              {/* Children */}
              {hasChildren && expanded && (
                <div className="ml-4 mt-0.5 pl-3 border-l border-slate-800 space-y-0.5">
                  {item.children!.filter(child => !child.roles || child.roles.includes(role)).map(child => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                        pathname === child.href
                          ? 'text-eos-400 bg-eos-600/10 font-medium'
                          : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'
                      )}
                    >
                      <span className="w-1 h-1 rounded-full bg-current" />
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="p-3 border-t border-slate-800">
        {!collapsed && profile && (
          <Link href="/dashboard/perfil"
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 mb-2 hover:bg-slate-700/60 transition-colors">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{background: 'linear-gradient(135deg, #0f2dbf, #1e90ff)'}}>
              <span className="text-white text-xs font-bold">
                {getInitials(profile.full_name)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{profile.full_name}</p>
              <p className="text-slate-500 text-xs truncate">{ROLE_LABELS[profile.role]}</p>
            </div>
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-900/30 hover:text-red-400 transition-all w-full',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  )
}
