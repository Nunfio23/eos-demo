'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PERMISSIONS, invalidatePermissionsCache } from '@/lib/permissions'
import { ROLE_LABELS } from '@/lib/utils'
import type { UserRole } from '@/types/database'
import toast from 'react-hot-toast'
import { Shield, Save, RotateCcw, CheckCircle } from 'lucide-react'

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve'
type Module = keyof typeof PERMISSIONS

interface DBRow { role: string; module: string; actions: Action[] }

// ─── Constantes ─────────────────────────────────────────────────────────────

const ALL_ACTIONS: Action[] = ['view', 'create', 'edit', 'delete', 'approve']
const ALL_ROLES: UserRole[] = [
  'master', 'direccion', 'administracion', 'docente', 'alumno',
  'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'
]
const ALL_MODULES = Object.keys(PERMISSIONS) as Module[]

const MODULE_LABELS: Record<Module, string> = {
  usuarios:    'Usuarios',
  estudiantes: 'Estudiantes',
  docentes:    'Docentes',
  finanzas:    'Finanzas',
  inventario:  'Inventario',
  reportes:    'Reportes',
  asistencia:  'Asistencia',
  academico:   'Académico',
  calendario:  'Calendario',
  comunicados: 'Comunicados',
  horarios:    'Horarios',
  aulas:       'Aulas',
  biblioteca:  'Biblioteca',
  tienda:      'Tienda',
  expediente:  'Expediente',
  carnet:      'Carnet',
}

const ACTION_LABELS: Record<Action, string> = {
  view:    'Ver',
  create:  'Crear',
  edit:    'Editar',
  delete:  'Eliminar',
  approve: 'Aprobar',
}

const ACTION_COLORS: Record<Action, string> = {
  view:    'bg-sky-100 text-sky-700 border-sky-200',
  create:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  edit:    'bg-amber-100 text-amber-700 border-amber-200',
  delete:  'bg-red-100 text-red-700 border-red-200',
  approve: 'bg-purple-100 text-purple-700 border-purple-200',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDefaultMatrix(): Record<string, Record<string, Action[]>> {
  const matrix: Record<string, Record<string, Action[]>> = {}
  for (const mod of ALL_MODULES) {
    for (const role of ALL_ROLES) {
      const key = `${role}::${mod}`
      matrix[key] = (PERMISSIONS[mod][role] ?? []) as Action[]
    }
  }
  return matrix
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PermissionsTab() {
  // matrix[role::module] = actions[]
  const [matrix, setMatrix] = useState<Record<string, Action[]>>({})
  const [original, setOriginal] = useState<Record<string, Action[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<string | null>(null) // "role::module"
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(['master', 'direccion', 'administracion', 'contabilidad', 'docente'])

  const loadFromDB = useCallback(async () => {
    setLoading(true)
    const defaults = buildDefaultMatrix()
    const { data } = await (supabase as any)
      .from('role_permissions')
      .select('role, module, actions')

    if (data && data.length > 0) {
      const merged = { ...defaults }
      for (const row of data as DBRow[]) {
        merged[`${row.role}::${row.module}`] = row.actions
      }
      setMatrix(merged)
      setOriginal(JSON.parse(JSON.stringify(merged)))
    } else {
      // Tabla vacía — usar defaults estáticos
      setMatrix(defaults)
      setOriginal(JSON.parse(JSON.stringify(defaults)))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadFromDB() }, [loadFromDB])

  const toggleAction = (role: UserRole, module: Module, action: Action) => {
    const key = `${role}::${module}`
    setMatrix(prev => {
      const current = prev[key] ?? []
      const updated = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      // Mantener orden canónico
      return { ...prev, [key]: ALL_ACTIONS.filter(a => updated.includes(a)) }
    })
  }

  const isDirty = (key: string) => {
    const cur = JSON.stringify(matrix[key] ?? [])
    const orig = JSON.stringify(original[key] ?? [])
    return cur !== orig
  }

  const hasAnyChange = Object.keys(matrix).some(k => isDirty(k))

  const handleSave = async () => {
    setSaving(true)
    const changedKeys = Object.keys(matrix).filter(k => isDirty(k))
    const rows = changedKeys.map(key => {
      const [role, module] = key.split('::')
      return { role, module, actions: matrix[key] }
    })

    const { error } = await (supabase as any)
      .from('role_permissions')
      .upsert(rows, { onConflict: 'role,module' })

    setSaving(false)
    if (error) {
      toast.error('Error al guardar permisos: ' + error.message)
      return
    }
    toast.success(`${rows.length} permiso(s) actualizado(s)`)
    setOriginal(JSON.parse(JSON.stringify(matrix)))
    invalidatePermissionsCache()
  }

  const handleReset = () => {
    setMatrix(JSON.parse(JSON.stringify(original)))
    setActiveCell(null)
  }

  const handleResetToDefaults = () => {
    if (!confirm('¿Restaurar TODOS los permisos a los valores predeterminados del sistema?')) return
    setMatrix(buildDefaultMatrix())
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-eos-600" />
            <h2 className="font-semibold text-slate-900">Permisos por Rol</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Controla qué acciones puede realizar cada rol en cada módulo del sistema.
            Los cambios se aplican inmediatamente al guardar.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetToDefaults}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar defaults
          </button>
          {hasAnyChange && (
            <>
              <button onClick={handleReset} className="btn-secondary text-xs">
                Cancelar cambios
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-xs flex items-center gap-1.5">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />
                }
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filtro de roles */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Roles visibles</p>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map(role => (
            <button
              key={role}
              onClick={() => setSelectedRoles(prev =>
                prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
              )}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                selectedRoles.includes(role)
                  ? 'bg-eos-600 text-white border-eos-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de permisos */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36 sticky left-0 bg-slate-50 z-10">
                  Módulo
                </th>
                {selectedRoles.map(role => (
                  <th key={role} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-32">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ALL_MODULES.map(mod => (
                <tr key={mod} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 sticky left-0 bg-white z-10">
                    <span className="font-medium text-slate-700 text-sm">
                      {MODULE_LABELS[mod]}
                    </span>
                  </td>
                  {selectedRoles.map(role => {
                    const key = `${role}::${mod}`
                    const actions = matrix[key] ?? []
                    const dirty = isDirty(key)
                    const isActive = activeCell === key

                    return (
                      <td key={role} className="px-3 py-2 text-center align-middle">
                        <button
                          onClick={() => setActiveCell(isActive ? null : key)}
                          className={`inline-flex flex-wrap gap-1 justify-center items-center p-1.5 rounded-lg transition-colors min-h-8 max-w-36 ${
                            isActive
                              ? 'bg-eos-50 ring-2 ring-eos-400'
                              : dirty
                                ? 'bg-amber-50 hover:bg-amber-100'
                                : 'hover:bg-slate-100'
                          }`}
                          title="Clic para editar permisos"
                        >
                          {actions.length === 0 ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : (
                            actions.map(a => (
                              <span
                                key={a}
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${ACTION_COLORS[a]}`}
                              >
                                {ACTION_LABELS[a]}
                              </span>
                            ))
                          )}
                          {dirty && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 shrink-0" title="Modificado" />
                          )}
                        </button>

                        {/* Panel de edición inline */}
                        {isActive && (
                          <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-left z-20 relative min-w-32">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                              {ROLE_LABELS[role]} · {MODULE_LABELS[mod]}
                            </p>
                            <div className="space-y-1.5">
                              {ALL_ACTIONS.map(action => (
                                <label key={action} className="flex items-center gap-2 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={actions.includes(action)}
                                    onChange={() => toggleAction(role, mod, action)}
                                    className="rounded border-slate-300 text-eos-600 focus:ring-eos-500 w-3.5 h-3.5"
                                  />
                                  <span className={`text-xs px-2 py-0.5 rounded border flex-1 ${
                                    actions.includes(action) ? ACTION_COLORS[action] : 'text-slate-400 border-slate-100 bg-slate-50'
                                  }`}>
                                    {ACTION_LABELS[action]}
                                  </span>
                                </label>
                              ))}
                            </div>
                            <button
                              onClick={() => setActiveCell(null)}
                              className="mt-2 w-full text-xs text-center text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Listo
                            </button>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Leyenda de acciones</p>
        <div className="flex flex-wrap gap-3">
          {ALL_ACTIONS.map(a => (
            <div key={a} className="flex items-center gap-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${ACTION_COLORS[a]}`}>
                {ACTION_LABELS[a]}
              </span>
              <span className="text-xs text-slate-400">
                {a === 'view'    && '— puede ver el módulo'}
                {a === 'create'  && '— puede crear registros'}
                {a === 'edit'    && '— puede editar registros'}
                {a === 'delete'  && '— puede eliminar registros'}
                {a === 'approve' && '— puede aprobar/validar'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
          Celdas con punto naranja tienen cambios pendientes de guardar.
        </p>
      </div>
    </div>
  )
}
