'use client'

import { useAuth } from '@/lib/auth-context'
import type { UserRole } from '@/types/database'

// ============================================================
// Cache dinámico — se carga desde role_permissions en Supabase
// ============================================================
let _dbPerms: Record<string, Record<string, Action[]>> | null = null

/** Carga los permisos desde la tabla role_permissions y los cachea en memoria.
 *  Se llama desde AuthProvider al iniciar sesión. */
export async function loadPermissionsFromDB(supabaseClient: any): Promise<void> {
  try {
    const { data, error } = await supabaseClient
      .from('role_permissions')
      .select('role, module, actions')
    if (error || !data || data.length === 0) return
    const cache: Record<string, Record<string, Action[]>> = {}
    for (const row of data) {
      if (!cache[row.role]) cache[row.role] = {}
      cache[row.role][row.module] = row.actions as Action[]
    }
    _dbPerms = cache
  } catch {
    // Falla silenciosa — usará los permisos estáticos como fallback
  }
}

/** Invalida la cache para forzar recarga en el próximo can() */
export function invalidatePermissionsCache(): void {
  _dbPerms = null
}

// ============================================================
// Tipos
// ============================================================
export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve'

export type Module =
  | 'usuarios'
  | 'estudiantes'
  | 'docentes'
  | 'finanzas'
  | 'inventario'
  | 'reportes'
  | 'asistencia'
  | 'academico'
  | 'calendario'
  | 'comunicados'
  | 'horarios'
  | 'aulas'
  | 'biblioteca'
  | 'tienda'
  | 'expediente'
  | 'carnet'

type PermissionMatrix = Partial<Record<UserRole, Action[]>>

// ============================================================
// Matriz de permisos por módulo (base estática / fallback)
// ============================================================
export const PERMISSIONS: Record<Module, PermissionMatrix> = {
  usuarios: {
    master:        ['view', 'create', 'edit', 'delete', 'approve'],
    direccion:     ['view', 'create', 'edit'],
    administracion:['view', 'edit'],
  },
  estudiantes: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit', 'delete'],
    administracion:['view', 'create', 'edit'],
    docente:       ['view'],
    contabilidad:  ['view'],
    padre:         ['view'],
    alumno:        ['view'],
  },
  docentes: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit'],
    administracion:['view', 'create', 'edit'],
  },
  finanzas: {
    master:        ['view', 'create', 'edit', 'delete', 'approve'],
    contabilidad:  ['view', 'create', 'edit', 'approve'],
    administracion:['view', 'create'],
    padre:         ['view'],
    alumno:        ['view'],
  },
  inventario: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view'],
    administracion:['view', 'create', 'edit'],
    biblioteca:    ['view', 'create', 'edit'],
    tienda:        ['view', 'create', 'edit'],
    mantenimiento: ['view', 'create', 'edit'],
    contabilidad:  ['view'],
  },
  reportes: {
    master:        ['view'],
    contabilidad:  ['view'],
    administracion:['view'],
  },
  asistencia: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit'],
    administracion:['view'],
    docente:       ['view', 'create', 'edit'],
    padre:         ['view'],
    alumno:        ['view'],
  },
  academico: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view'],           // solo lectura en notas
    administracion:['view'],           // sin acceso a ingreso de notas
    docente:       ['view', 'edit'],   // edita solo sus materias asignadas
    alumno:        ['view'],
    padre:         ['view'],
  },
  calendario: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit', 'delete'],
    administracion:['view', 'create', 'edit'],
    marketing:     ['view'],
    docente:       ['view'],
    alumno:        ['view'],
    padre:         ['view'],
    contabilidad:  ['view'],
    biblioteca:    ['view'],
    tienda:        ['view'],
    mantenimiento: ['view'],
  },
  comunicados: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit', 'delete'],
    administracion:['view', 'create', 'edit'],
    contabilidad:  ['view', 'create', 'edit'],
    marketing:     ['view'],
    docente:       ['view'],
    alumno:        ['view'],
    padre:         ['view'],
    biblioteca:    ['view'],
    tienda:        ['view'],
    mantenimiento: ['view'],
  },
  horarios: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create', 'edit'],
    administracion:['view', 'create', 'edit'],
    docente:       ['view'],
    alumno:        ['view'],
    padre:         ['view'],
  },
  aulas: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view'],
    docente:       ['view', 'create', 'edit'],
    alumno:        ['view', 'create'],
    padre:         ['view'],
  },
  biblioteca: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view'],
    administracion:['view'],
    biblioteca:    ['view', 'create', 'edit', 'delete'],
    docente:       ['view'],
    alumno:        ['view'],
    padre:         ['view'],
  },
  tienda: {
    master:        ['view', 'create', 'edit', 'delete'],
    tienda:        ['view', 'create', 'edit'],
    administracion:['view'],
    alumno:        ['view', 'create'],
    padre:         ['view', 'create'],
    docente:       ['view'],
  },
  expediente: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'edit'],
    administracion:['view', 'edit'],
    docente:       ['view'],
    alumno:        ['view'],
    padre:         ['view'],
  },
  carnet: {
    master:        ['view', 'create', 'edit', 'delete'],
    direccion:     ['view', 'create'],
    administracion:['view', 'create'],
  },
}

// ============================================================
// Funciones puras (se pueden usar fuera de componentes)
// ============================================================
export function can(role: UserRole | null, module: Module, action: Action): boolean {
  if (!role) return false
  // DB overrides tienen prioridad sobre los permisos estáticos
  if (_dbPerms?.[role]?.[module]) {
    return _dbPerms[role][module].includes(action)
  }
  const rolePerms = PERMISSIONS[module][role]
  return rolePerms?.includes(action) ?? false
}

export function canAny(role: UserRole | null, module: Module, actions: Action[]): boolean {
  return actions.some(action => can(role, module, action))
}

// Roles con acceso total de administración
export const ADMIN_ROLES: UserRole[] = ['master', 'direccion', 'administracion']
export const FINANCE_ROLES: UserRole[] = ['master', 'contabilidad']

// ============================================================
// Hook de permisos (solo para componentes React)
// ============================================================
export function usePermissions() {
  const { role } = useAuth()

  return {
    role,
    // Genérico
    can:       (module: Module, action: Action) => can(role, module, action),
    canView:   (module: Module) => can(role, module, 'view'),
    canCreate: (module: Module) => can(role, module, 'create'),
    canEdit:   (module: Module) => can(role, module, 'edit'),
    canDelete: (module: Module) => can(role, module, 'delete'),
    canApprove:(module: Module) => can(role, module, 'approve'),
    // Helpers de rol
    isMaster:  role === 'master',
    isAdmin:   ADMIN_ROLES.includes(role as UserRole),
    isDocente: role === 'docente',
    isAlumno:  role === 'alumno',
    isPadre:   role === 'padre',
    isFinanzas: FINANCE_ROLES.includes(role as UserRole),
  }
}
