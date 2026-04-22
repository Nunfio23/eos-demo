'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types/database'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, DollarSign, Package, BarChart3, Settings,
  LogOut, Bell, Building2, UserCheck, FileText, Wrench,
  ClipboardCheck, BookMarked, TrendingUp, Monitor, Clock,
  Folder, CreditCard, MessageSquare, Store, Upload, Bot, Heart,
  MoreHorizontal, X, ChevronDown, ChevronUp
} from 'lucide-react'

const db = supabase as any
const LS_KEY_ANN = 'lastComunicadosVisit'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: UserRole[]
  children?: { label: string; href: string; icon: React.ElementType }[]
}

// Full nav items list (mirrors Sidebar NAV_ITEMS — flat, no children)
const ALL_NAV_ITEMS: NavItem[] = [
  { label: 'Míster EOS IA',      href: '/dashboard/chat-ia',                   icon: Bot,             roles: ['master', 'direccion', 'docente', 'alumno', 'padre', 'administracion', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'] },
  { label: 'Dashboard',            href: '/dashboard/master',                    icon: LayoutDashboard, roles: ['master', 'direccion'] },
  { label: 'Mi Dashboard',         href: '/dashboard/docente',                   icon: LayoutDashboard, roles: ['docente'] },
  { label: 'Mi Dashboard',         href: '/dashboard/alumno',                    icon: LayoutDashboard, roles: ['alumno'] },
  { label: 'Mi Dashboard',         href: '/dashboard/administracion',            icon: LayoutDashboard, roles: ['administracion', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'] },
  { label: 'Mi Dashboard',         href: '/dashboard/padre',                     icon: LayoutDashboard, roles: ['padre'] },
  { label: 'Mi Dashboard',         href: '/dashboard/contabilidad',              icon: LayoutDashboard, roles: ['contabilidad'] },
  { label: 'Usuarios',             href: '/dashboard/usuarios',                  icon: Users,           roles: ['master', 'direccion', 'administracion'] },
  { label: 'Estudiantes',          href: '/dashboard/estudiantes',               icon: GraduationCap,   roles: ['master', 'direccion', 'administracion'] },
  { label: 'Equipo de Trabajo',    href: '/dashboard/equipo',                    icon: Users,           roles: ['master', 'contabilidad'] },
  { label: 'Padres de Familia',    href: '/dashboard/padres',                    icon: Heart,           roles: ['master'] },
  { label: 'Docentes',             href: '/dashboard/docentes',                  icon: UserCheck,       roles: ['direccion', 'administracion'] },
  { label: 'Académico',            href: '/dashboard/academico',                 icon: BookOpen,        roles: ['master', 'direccion', 'administracion', 'docente'] },
  { label: 'Asignación de Clases', href: '/dashboard/academico/asignaciones',   icon: UserCheck,       roles: ['master'] },
  { label: 'Supervisión',          href: '/dashboard/supervision',               icon: TrendingUp,      roles: ['master', 'direccion'] },
  { label: 'Mi Grado',             href: '/dashboard/mi-grado',                  icon: GraduationCap,   roles: ['docente'] },
  { label: 'Calificaciones IA',    href: '/dashboard/docente/calificaciones-ia', icon: Bot,             roles: ['docente', 'master', 'direccion'] },
  { label: 'Mis Materias',         href: '/dashboard/academico/materias',        icon: BookOpen,        roles: ['alumno', 'docente'] },
  { label: 'Mis Tareas',           href: '/dashboard/alumno/tareas',             icon: ClipboardList,   roles: ['alumno'] },
  { label: 'Asistencia',           href: '/dashboard/asistencia',                icon: ClipboardCheck,  roles: ['master', 'direccion', 'docente', 'contabilidad'] },
  { label: 'Horarios',             href: '/dashboard/horarios',                  icon: Clock,           roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre'] },
  { label: 'Aulas Virtuales',      href: '/dashboard/aulas',                     icon: Monitor,         roles: ['master', 'direccion', 'docente', 'alumno', 'padre'] },
  {
    label: 'Finanzas', href: '/dashboard/finanzas', icon: DollarSign, roles: ['master', 'contabilidad'],
    children: [
      { label: 'Pagos',        href: '/dashboard/finanzas/pagos',        icon: CreditCard  },
      { label: 'Proyección',   href: '/dashboard/finanzas/proyeccion',   icon: TrendingUp  },
      { label: 'Comprobantes', href: '/dashboard/finanzas/comprobantes', icon: FileText    },
      { label: 'Cuotas',       href: '/dashboard/finanzas/cuotas',       icon: DollarSign  },
      { label: 'Gastos',       href: '/dashboard/finanzas/gastos',       icon: Package     },
      { label: 'Facturación',  href: '/dashboard/finanzas/facturacion',  icon: FileText    },
      { label: 'Reportes',     href: '/dashboard/finanzas/reportes',     icon: BarChart3   },
    ],
  },
  { label: 'Mis Pagos',            href: '/dashboard/padre/mis-pagos',           icon: DollarSign,      roles: ['padre'] },
  { label: 'Matrícula',            href: '/dashboard/matricula',                 icon: GraduationCap,   roles: ['master', 'direccion'] },
  { label: 'Calendario',           href: '/dashboard/calendario',                icon: Calendar,        roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'] },
  { label: 'Comunicados',          href: '/dashboard/comunicados',               icon: MessageSquare,   roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'] },
  { label: 'Inventario',           href: '/dashboard/inventario',                icon: Package,         roles: ['master', 'administracion', 'biblioteca', 'tienda', 'mantenimiento', 'contabilidad'] },
  { label: 'Biblioteca',           href: '/dashboard/biblioteca',                icon: BookMarked,      roles: ['master', 'direccion', 'administracion', 'biblioteca', 'docente', 'alumno', 'padre'] },
  { label: 'Tienda Chalet',        href: '/dashboard/tienda',                    icon: Store,           roles: ['master', 'tienda', 'administracion', 'contabilidad', 'alumno', 'padre', 'docente'] },
  { label: 'Expediente',           href: '/dashboard/expediente',                icon: Folder,          roles: ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre'] },
  { label: 'Carnet Estudiantil',   href: '/dashboard/carnet',                    icon: CreditCard,      roles: ['master', 'direccion', 'administracion'] },
  { label: 'Reportes',             href: '/dashboard/reportes',                  icon: BarChart3,       roles: ['master', 'contabilidad', 'administracion'] },
  { label: 'Importación Masiva',   href: '/dashboard/importar',                  icon: Upload,          roles: ['master', 'administracion'] },
  { label: 'Configuración',        href: '/dashboard/configuracion',             icon: Settings,        roles: ['master', 'direccion'] },
]

// Main bottom tabs per role (4 items, "Más" is added automatically as 5th)
const MAIN_TABS: Record<string, { label: string; href: string }[]> = {
  master: [
    { label: 'Dashboard',   href: '/dashboard/master' },
    { label: 'Asistencia',  href: '/dashboard/asistencia' },
    { label: 'Supervisión', href: '/dashboard/supervision' },
    { label: 'Comunicados', href: '/dashboard/comunicados' },
  ],
  direccion: [
    { label: 'Dashboard',   href: '/dashboard/master' },
    { label: 'Asistencia',  href: '/dashboard/asistencia' },
    { label: 'Supervisión', href: '/dashboard/supervision' },
    { label: 'Comunicados', href: '/dashboard/comunicados' },
  ],
  docente: [
    { label: 'Dashboard',  href: '/dashboard/docente' },
    { label: 'Mi Grado',   href: '/dashboard/mi-grado' },
    { label: 'Asistencia', href: '/dashboard/asistencia' },
    { label: 'Aulas',      href: '/dashboard/aulas' },
  ],
  alumno: [
    { label: 'Dashboard',    href: '/dashboard/alumno' },
    { label: 'Mis Materias', href: '/dashboard/academico/materias' },
    { label: 'Tareas',       href: '/dashboard/alumno/tareas' },
    { label: 'Horario',      href: '/dashboard/horarios' },
  ],
  padre: [
    { label: 'Dashboard', href: '/dashboard/padre' },
    { label: 'Notas',     href: '/dashboard/academico/notas' },
    { label: 'Mis Pagos', href: '/dashboard/padre/mis-pagos' },
    { label: 'Horario',   href: '/dashboard/horarios' },
  ],
  administracion: [
    { label: 'Dashboard',    href: '/dashboard/administracion' },
    { label: 'Estudiantes',  href: '/dashboard/estudiantes' },
    { label: 'Calendario',   href: '/dashboard/calendario' },
    { label: 'Comunicados',  href: '/dashboard/comunicados' },
  ],
  contabilidad: [
    { label: 'Dashboard',   href: '/dashboard/contabilidad' },
    { label: 'Finanzas',    href: '/dashboard/finanzas' },
    { label: 'Asistencia',  href: '/dashboard/asistencia' },
    { label: 'Comunicados', href: '/dashboard/comunicados' },
  ],
  default: [
    { label: 'Dashboard',   href: '/dashboard/administracion' },
    { label: 'Calendario',  href: '/dashboard/calendario' },
    { label: 'Comunicados', href: '/dashboard/comunicados' },
    { label: 'Horario',     href: '/dashboard/horarios' },
  ],
}

export default function BottomNav() {
  const { role, signOut, blockedModules } = useAuth()
  const pathname = usePathname()
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [unreadAnn, setUnreadAnn] = useState(0)

  // Track unread announcements (mirrors Sidebar logic)
  useEffect(() => {
    if (pathname === '/dashboard/comunicados') {
      localStorage.setItem(LS_KEY_ANN, new Date().toISOString())
      setUnreadAnn(0)
      return
    }

    let cancelled = false
    const check = async () => {
      const lastVisit = localStorage.getItem(LS_KEY_ANN)
      let query = db.from('announcements').select('id', { count: 'exact', head: true })
      if (lastVisit) query = query.gt('created_at', lastVisit)
      const { count } = await query
      if (!cancelled) setUnreadAnn(count ?? 0)
    }
    check()

    const channel = db
      .channel('bottom-nav-ann-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
        setUnreadAnn(prev => prev + 1)
      })
      .subscribe()

    return () => {
      cancelled = true
      db.removeChannel(channel)
    }
  }, [pathname])

  const handleSignOut = async () => {
    localStorage.setItem(LS_KEY_ANN, new Date().toISOString())
    setOverlayOpen(false)
    setExpandedItem(null)
    await signOut()
  }

  const handleCloseOverlay = () => {
    setOverlayOpen(false)
    setExpandedItem(null)
  }

  if (!role) return null

  const mainTabDefs = MAIN_TABS[role] ?? MAIN_TABS.default
  const mainTabHrefs = new Set(mainTabDefs.map(t => t.href))

  // Build the resolved nav items for main tabs (with icons from ALL_NAV_ITEMS)
  const mainTabs = mainTabDefs.map(tab => {
    const match = ALL_NAV_ITEMS.find(n => n.href === tab.href)
    return {
      label: tab.label,
      href: tab.href,
      icon: match?.icon ?? LayoutDashboard,
    }
  })

  // Mapeo href → módulo para filtrar blocked_modules por usuario
  const HREF_TO_MODULE: Record<string, string> = {
    '/dashboard/finanzas':                  'finanzas',
    '/dashboard/finanzas/pagos':            'finanzas',
    '/dashboard/finanzas/proyeccion':       'finanzas',
    '/dashboard/finanzas/comprobantes':     'finanzas',
    '/dashboard/finanzas/cuotas':           'finanzas',
    '/dashboard/finanzas/gastos':           'finanzas',
    '/dashboard/finanzas/facturacion':      'finanzas',
    '/dashboard/finanzas/reportes':         'finanzas',
  }

  // Overlay items: all items visible to this role that are NOT in main tabs
  const allOverlay = ALL_NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role as UserRole)) return false
    if (mainTabHrefs.has(item.href)) return false
    const mod = HREF_TO_MODULE[item.href]
    if (mod && blockedModules.includes(mod)) return false
    return true
  })
  const aiItem      = allOverlay.find(i => i.href === '/dashboard/chat-ia')
  const overlayItems = allOverlay.filter(i => i.href !== '/dashboard/chat-ia')

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden bg-white"
        style={{
          boxShadow: '0 -1px 0 rgba(0,0,0,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          minHeight: 64,
        }}
      >
        {/* Main tabs */}
        {mainTabs.map(tab => {
          const Icon = tab.icon
          const active = isActive(tab.href)
          const isComunicados = tab.href === '/dashboard/comunicados'
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={handleCloseOverlay}
              className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5"
            >
              {/* Pill indicator (Material Design 3 style) */}
              <div className={`relative flex items-center justify-center rounded-full transition-all duration-200 ${
                active ? 'bg-blue-100 px-4 py-1' : 'px-4 py-1'
              }`}>
                <Icon
                  className={`w-[22px] h-[22px] transition-colors ${active ? 'text-blue-700' : 'text-slate-400'}`}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                {isComunicados && unreadAnn > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                )}
              </div>
              <span className={`text-[10px] font-medium leading-tight transition-colors ${
                active ? 'text-blue-700' : 'text-slate-400'
              }`}>
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* Más tab */}
        <button
          onClick={() => setOverlayOpen(o => !o)}
          className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5"
        >
          <div className={`flex items-center justify-center rounded-full transition-all duration-200 ${
            overlayOpen ? 'bg-blue-100 px-4 py-1' : 'px-4 py-1'
          }`}>
            <MoreHorizontal
              className={`w-[22px] h-[22px] transition-colors ${overlayOpen ? 'text-blue-700' : 'text-slate-400'}`}
              strokeWidth={overlayOpen ? 2.5 : 1.75}
            />
          </div>
          <span className={`text-[10px] font-medium leading-tight transition-colors ${
            overlayOpen ? 'text-blue-700' : 'text-slate-400'
          }`}>
            Más
          </span>
        </button>
      </nav>

      {/* Overlay backdrop */}
      {overlayOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden flex-col justify-end"
          onClick={handleCloseOverlay}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Slide-up panel */}
          <div
            className="relative bg-white rounded-t-2xl px-4 pt-4 overflow-y-auto max-h-[80vh] animate-slide-up"
            style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 80px)` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-slate-800">Más opciones</span>
              <button
                onClick={handleCloseOverlay}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Míster EOS IA — featured banner */}
            {aiItem && (
              <Link
                href={aiItem.href}
                onClick={handleCloseOverlay}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl mb-3 transition-all ${
                  isActive(aiItem.href)
                    ? 'bg-blue-700'
                    : 'bg-gradient-to-r from-[#0f2dbf] to-[#1e90ff]'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">Míster EOS</p>
                  <p className="text-[11px] text-blue-100 leading-tight">Asistente IA del Pastor Diego</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
              </Link>
            )}

            {/* Grid of items */}
            {overlayItems.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-2">
                  {overlayItems.map(item => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    const isComunicados = item.href === '/dashboard/comunicados'
                    const hasChildren = !!(item.children && item.children.length > 0)
                    const isExpanded = expandedItem === item.href

                    if (hasChildren) {
                      return (
                        <button
                          key={item.href}
                          onClick={() => setExpandedItem(isExpanded ? null : item.href)}
                          className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors relative ${
                            active || isExpanded
                              ? 'bg-blue-50 text-blue-600'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="relative">
                            <Icon
                              className={`w-5 h-5 ${active || isExpanded ? 'text-blue-600' : 'text-slate-500'}`}
                              strokeWidth={active || isExpanded ? 2.5 : 1.75}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
                            {item.label}
                          </span>
                          <div className="absolute top-1 right-1">
                            {isExpanded
                              ? <ChevronUp className="w-3 h-3 text-blue-400" />
                              : <ChevronDown className="w-3 h-3 text-slate-300" />
                            }
                          </div>
                        </button>
                      )
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleCloseOverlay}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="relative">
                          <Icon
                            className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-500'}`}
                            strokeWidth={active ? 2.5 : 1.75}
                          />
                          {isComunicados && unreadAnn > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-white" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
                          {item.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>

                {/* Expanded children panel */}
                {overlayItems.map(item => {
                  if (!item.children || expandedItem !== item.href) return null
                  return (
                    <div key={`children-${item.href}`} className="bg-blue-50 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-2 px-1">
                        {item.label}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {item.children.map(child => {
                          const ChildIcon = child.icon
                          const childActive = isActive(child.href)
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={handleCloseOverlay}
                              className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-colors ${
                                childActive
                                  ? 'bg-blue-200 text-blue-700'
                                  : 'bg-white text-slate-600 hover:bg-blue-100'
                              }`}
                            >
                              <ChildIcon
                                className={`w-4 h-4 ${childActive ? 'text-blue-700' : 'text-slate-500'}`}
                                strokeWidth={childActive ? 2.5 : 1.75}
                              />
                              <span className="text-[9px] font-medium text-center leading-tight line-clamp-2">
                                {child.label}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No hay más opciones</p>
            )}

            {/* Divider */}
            <div className="mt-4 mb-3 border-t border-slate-100" />

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
