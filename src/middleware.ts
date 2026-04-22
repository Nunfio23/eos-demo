import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Dashboard por defecto según rol
const ROLE_DASHBOARD: Record<string, string> = {
  master:         '/dashboard/master',
  direccion:      '/dashboard/master',
  administracion: '/dashboard/administracion',
  docente:        '/dashboard/docente',
  alumno:         '/dashboard/alumno',
  padre:          '/dashboard/padre',
  contabilidad:   '/dashboard/contabilidad',
  biblioteca:     '/dashboard/administracion',
  tienda:         '/dashboard/administracion',
  marketing:      '/dashboard/administracion',
  mantenimiento:  '/dashboard/administracion',
}

// Roles permitidos por prefijo de ruta (más específico primero — orden importa)
const ROUTE_PERMISSIONS: [string, string[]][] = [
  ['/dashboard/master',                    ['master', 'direccion']],
  ['/dashboard/supervision/conversaciones',['master']],
  ['/dashboard/usuarios',                  ['master', 'direccion', 'administracion']],
  ['/dashboard/estudiantes',               ['master', 'direccion', 'administracion', 'docente', 'contabilidad']],
  ['/dashboard/docentes',                  ['master', 'direccion', 'administracion']],
  ['/dashboard/finanzas/cuotas',           ['master', 'administracion']],
  ['/dashboard/finanzas/proyeccion',       ['master', 'contabilidad', 'administracion']],
  ['/dashboard/finanzas/comprobantes',     ['master', 'contabilidad', 'administracion']],
  ['/dashboard/finanzas/reportes',         ['master', 'contabilidad', 'administracion']],
  ['/dashboard/finanzas',                  ['master', 'contabilidad', 'administracion']],
  ['/dashboard/padre/mis-pagos',           ['padre', 'master']],
  ['/dashboard/inventario',                ['master', 'direccion', 'administracion', 'biblioteca', 'tienda', 'mantenimiento']],
  ['/dashboard/reportes',                  ['master', 'contabilidad', 'administracion']],
  ['/dashboard/asistencia',                ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/importar',                  ['master', 'administracion']],
  ['/dashboard/configuracion',             ['master', 'direccion']],
  // Subrutas académicas con acceso amplio (ANTES que la ruta base)
  ['/dashboard/academico/materias',        ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/academico/calificaciones',  ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/academico/asignaciones',    ['master']],
  ['/dashboard/academico/notas',           ['master', 'direccion', 'docente']],
  ['/dashboard/academico',                 ['master', 'direccion', 'administracion', 'docente']],
  ['/dashboard/horarios',                  ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/calendario',                ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento']],
  ['/dashboard/comunicados',               ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento']],
  ['/dashboard/chat',                      ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/matricula',                 ['master', 'direccion']],
  ['/dashboard/aulas',                     ['master', 'direccion', 'docente', 'alumno', 'padre']],
  ['/dashboard/biblioteca',                ['master', 'direccion', 'administracion', 'biblioteca', 'docente', 'alumno', 'padre']],
  ['/dashboard/tienda',                    ['master', 'tienda', 'administracion', 'alumno', 'padre', 'docente']],
  ['/dashboard/expediente',                ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre']],
  ['/dashboard/carnet',                    ['master', 'direccion', 'administracion']],
  ['/dashboard/padres',                    ['master']],
  ['/dashboard/docente/calificaciones-ia', ['docente', 'master', 'direccion']],
  ['/dashboard/alumno',                    ['alumno']],
  ['/dashboard/docente',                   ['docente']],
  ['/dashboard/padre',                     ['padre']],
  ['/dashboard/contabilidad',              ['contabilidad', 'master']],
  ['/dashboard/administracion',            ['administracion', 'master', 'direccion', 'biblioteca', 'tienda', 'marketing', 'mantenimiento']],
]

export async function middleware(req: NextRequest) {
  const start = Date.now()
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Solo verificar el token — NO consultar la BD aquí para evitar loops
  const { data: { session } } = await supabase.auth.getSession()

  // Sin sesión → login
  if (!session && pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Con sesión en login → dashboard (el cliente redirige al dashboard correcto)
  if (session && pathname === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Headers de performance y trazabilidad
  const duration = Date.now() - start
  res.headers.set('X-Response-Time', `${duration}ms`)
  res.headers.set('X-Request-ID', crypto.randomUUID())

  if (process.env.NODE_ENV === 'development') {
    console.log(`[MW] ${req.method} ${pathname} — ${duration}ms`)
  } else if (duration > 3000) {
    console.warn(`[MW] Slow request: ${pathname} — ${duration}ms`)
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
