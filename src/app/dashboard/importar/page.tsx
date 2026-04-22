'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Download, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/ui/BackButton'
import { apiUrl } from '@/lib/api-url'

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type Entidad = 'materias' | 'estudiantes' | 'docentes' | 'nombres'

const ENTIDAD_LABEL: Record<Entidad, string> = {
  materias:    'Materias',
  estudiantes: 'Estudiantes',
  docentes:    'Equipo de Trabajo',
  nombres:     'Actualizar Nombres',
}

interface ResultadoFila {
  fila: number
  estado: 'ok' | 'error'
  mensaje?: string
}

// ─── Columnas esperadas por entidad ────────────────────────────────────────────
const COLUMNAS: Record<Entidad, { key: string; label: string; requerida: boolean }[]> = {
  materias: [
    { key: 'nombre',      label: 'Nombre',      requerida: true  },
    { key: 'codigo',      label: 'Código',       requerida: false },
    { key: 'grado',       label: 'Grado',        requerida: false },
    { key: 'seccion',     label: 'Sección',      requerida: false },
    { key: 'descripcion', label: 'Descripción',  requerida: false },
  ],
  nombres: [
    { key: 'usuario',        label: 'Usuario',        requerida: true },
    { key: 'nombre_completo', label: 'Nombre Completo', requerida: true },
  ],
  estudiantes: [
    { key: 'nombre_completo',   label: 'Nombre Completo',  requerida: true  },
    { key: 'usuario',           label: 'Usuario',          requerida: true  },
    { key: 'contrasena',        label: 'Contraseña',       requerida: true  },
    { key: 'grado',             label: 'Grado',            requerida: false },
    { key: 'seccion',           label: 'Sección',          requerida: false },
    { key: 'fecha_nacimiento',  label: 'Fecha Nacimiento', requerida: false },
    { key: 'telefono',          label: 'Teléfono',         requerida: false },
  ],
  docentes: [
    { key: 'nombre_completo',    label: 'Nombre Completo',   requerida: true  },
    { key: 'usuario',            label: 'Usuario',           requerida: true  },
    { key: 'contrasena',         label: 'Contraseña',        requerida: true  },
    { key: 'especializacion',    label: 'Especialización',   requerida: false },
    { key: 'fecha_contratacion', label: 'Fecha Contratación',requerida: false },
  ],
}

// ─── Normalizar encabezados del archivo ────────────────────────────────────────
function normalizarHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .trim()
}

function mapearFila(fila: Record<string, unknown>, entidad: Entidad): Record<string, string> {
  const columnas = COLUMNAS[entidad]
  const mapeada: Record<string, string> = {}
  const keys = Object.keys(fila)

  for (const col of columnas) {
    // Buscar coincidencia exacta o parcial en los headers del archivo
    const match = keys.find(k => {
      const norm = normalizarHeader(String(k))
      return norm === col.key || norm.includes(col.key) || col.key.includes(norm)
    })
    mapeada[col.key] = match ? String(fila[match] ?? '').trim() : ''
  }
  return mapeada
}

// ─── Validar filas antes de enviar ─────────────────────────────────────────────
function validarFila(
  fila: Record<string, string>,
  entidad: Entidad,
  indice: number
): string | null {
  for (const col of COLUMNAS[entidad]) {
    if (col.requerida && !fila[col.key]) {
      return `Fila ${indice + 1}: "${col.label}" es requerido`
    }
  }
  if ((entidad === 'estudiantes' || entidad === 'docentes') && fila.usuario) {
    if (!/^[a-z0-9._-]{3,30}$/.test(fila.usuario)) {
      return `Fila ${indice + 1}: Usuario inválido "${fila.usuario}" (solo minúsculas, números, puntos, guiones, 3–30 caracteres)`
    }
  }
  return null
}

// ─── Descargar plantilla ───────────────────────────────────────────────────────
function descargarPlantilla(entidad: Entidad) {
  const columnas = COLUMNAS[entidad]
  const wb = XLSX.utils.book_new()
  const headers = columnas.map(c => c.label)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  XLSX.utils.book_append_sheet(wb, ws, entidad)
  const nombre = entidad === 'docentes' ? 'equipo_de_trabajo' : entidad
  XLSX.writeFile(wb, `plantilla_${nombre}.xlsx`)
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ImportarPage() {
  const { role } = useAuth()
  const router = useRouter()

  const [entidad, setEntidad]           = useState<Entidad>('materias')
  const [filas, setFilas]               = useState<Record<string, string>[]>([])
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([])
  const [archivoNombre, setArchivoNombre] = useState('')
  const [importando, setImportando]     = useState(false)
  const [resultados, setResultados]     = useState<ResultadoFila[] | null>(null)
  const [arrastrando, setArrastrando]   = useState(false)
  const [modoReemplazo, setModoReemplazo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Guardia de rol (useEffect para no violar rules-of-hooks)
  useEffect(() => {
    if (role && !['master', 'administracion'].includes(role)) {
      router.replace('/dashboard')
    }
  }, [role, router])

  if (role && !['master', 'administracion'].includes(role)) return null

  // Limpiar estado al cambiar entidad
  const cambiarEntidad = (e: Entidad) => {
    setEntidad(e)
    setFilas([])
    setErroresValidacion([])
    setArchivoNombre('')
    setResultados(null)
    setModoReemplazo(false)
  }

  const procesarArchivo = useCallback((file: File) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      toast.error('Solo se aceptan archivos .xlsx, .xls o .csv')
      return
    }

    setArchivoNombre(file.name)
    setResultados(null)
    setErroresValidacion([])

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

        if (json.length === 0) {
          toast.error('El archivo está vacío')
          return
        }
        if (json.length > 500) {
          toast.error('Máximo 500 filas por importación')
          return
        }

        const filasParseadas = json.map(f => mapearFila(f, entidad))

        // Validar todas las filas
        const errores: string[] = []
        filasParseadas.forEach((fila, idx) => {
          const err = validarFila(fila, entidad, idx)
          if (err) errores.push(err)
        })

        setFilas(filasParseadas)
        setErroresValidacion(errores)

        if (errores.length === 0) {
          toast.success(`${filasParseadas.length} filas cargadas correctamente`)
        } else {
          toast.error(`${errores.length} error(es) de validación. Revisa el preview.`)
        }
      } catch {
        toast.error('Error al leer el archivo. Verifica que no esté corrupto.')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [entidad])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarArchivo(file)
  }

  const confirmarImportacion = async () => {
    if (filas.length === 0 || erroresValidacion.length > 0) return
    setImportando(true)
    setResultados(null)

    const BATCH = 20
    const todosResultados: ResultadoFila[] = []

    try {
      // Refrescar sesión antes de importar para evitar JWT expirado
      await supabase.auth.refreshSession()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Sesión expirada. Por favor recargá la página e intentá de nuevo.')
        setImportando(false)
        return
      }

      // Actualizar nombres: API route dedicada
      if (entidad === 'nombres') {
        for (let i = 0; i < filas.length; i += BATCH) {
          const lote = filas.slice(i, i + BATCH)
          const res = await fetch(apiUrl('/api/actualizar-nombres'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ filas: lote }),
          })
          const data = await res.json()
          if (!res.ok || data.error) { toast.error(data.error ?? 'Error'); setImportando(false); return }
          const conOffset = (data.resultados as ResultadoFila[]).map(r => ({ ...r, fila: r.fila + i }))
          todosResultados.push(...conOffset)
          toast.success(`Lote ${Math.floor(i / BATCH) + 1}: ${lote.length} procesados`)
        }
      // Materias: usar API route de Next.js (no Edge Function) — más confiable
      } else if (entidad === 'materias') {
        for (let i = 0; i < filas.length; i += BATCH) {
          const lote = filas.slice(i, i + BATCH)
          const res = await fetch(apiUrl('/api/importar-materias'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ filas: lote, replace: modoReemplazo && i === 0 }),
          })
          const data = await res.json()
          if (!res.ok || data.error) {
            toast.error(data.error ?? 'Error al importar')
            setImportando(false)
            return
          }
          const conOffset = (data.resultados as ResultadoFila[]).map(r => ({
            ...r,
            fila: r.fila + i,
          }))
          todosResultados.push(...conOffset)
          toast.success(`Lote ${Math.floor(i / BATCH) + 1}: ${lote.length} procesados`)
        }
      } else if (entidad === 'estudiantes' || entidad === 'docentes') {
        // Estudiantes / Docentes: Edge Function
        for (let i = 0; i < filas.length; i += BATCH) {
          const lote = filas.slice(i, i + BATCH)
          const { data, error: fnError } = await supabase.functions.invoke('importar', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { tipo: entidad, filas: lote },
          })
          if (fnError) {
            let errorMsg = fnError.message
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const body = await (fnError as any).context?.json?.()
              if (body?.error) errorMsg = body.error
            } catch { /* ignorar */ }
            toast.error(errorMsg)
            setImportando(false)
            return
          }
          if (data?.error) {
            toast.error(data.error)
            setImportando(false)
            return
          }
          const conOffset = (data.resultados as ResultadoFila[]).map(r => ({
            ...r,
            fila: r.fila + i,
          }))
          todosResultados.push(...conOffset)
          toast.success(`Lote ${Math.floor(i / BATCH) + 1}: ${lote.length} procesados`)
        }
      }

      setResultados(todosResultados)
      const exitosos = todosResultados.filter(r => r.estado === 'ok').length
      const fallidos = todosResultados.filter(r => r.estado === 'error').length
      if (fallidos === 0) {
        toast.success(`✓ ${exitosos} registros importados correctamente`)
      } else {
        toast.error(`${exitosos} ok, ${fallidos} con error`)
      }
    } catch {
      toast.error('Error de conexión al importar')
    } finally {
      setImportando(false)
    }
  }

  const columnas = COLUMNAS[entidad]
  const exitosos = resultados?.filter(r => r.estado === 'ok').length ?? 0
  const fallidos = resultados?.filter(r => r.estado === 'error').length ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <BackButton />
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          Importación Masiva
        </h1>
        <p className="page-subtitle">
          Carga estudiantes, equipo de trabajo o materias desde un archivo Excel o CSV
        </p>
      </div>

      {/* Selector de entidad */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">¿Qué deseas importar?</p>
        <div className="flex flex-wrap gap-3">
          {(['materias', 'estudiantes', 'docentes', 'nombres'] as Entidad[]).map(e => (
            <button
              key={e}
              onClick={() => cambiarEntidad(e)}
              className={
                entidad === e
                  ? 'btn-primary-gradient px-5 py-2 rounded-xl text-sm font-semibold text-white'
                  : 'btn-secondary'
              }
            >
              {ENTIDAD_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      {/* Zona de carga + columnas esperadas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dropzone */}
        <div className="lg:col-span-2">
          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              arrastrando
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
            }`}
            onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-700">
              {archivoNombre || 'Arrastra tu archivo aquí'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {archivoNombre ? `${filas.length} filas detectadas` : 'O haz clic para seleccionar (.xlsx, .xls, .csv)'}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {/* Errores de validación */}
          {erroresValidacion.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 space-y-1">
              <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Errores de validación
              </p>
              {erroresValidacion.slice(0, 10).map((err, i) => (
                <p key={i} className="text-xs text-red-500 pl-5">{err}</p>
              ))}
              {erroresValidacion.length > 10 && (
                <p className="text-xs text-red-400 pl-5">
                  ...y {erroresValidacion.length - 10} más
                </p>
              )}
            </div>
          )}
        </div>

        {/* Columnas requeridas + descargar plantilla */}
        <div className="card p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Columnas para <span className="font-bold text-blue-600">{ENTIDAD_LABEL[entidad]}</span></p>
            <ul className="space-y-1.5">
              {columnas.map(c => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  {c.requerida
                    ? <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    : <span className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                  }
                  <span className={c.requerida ? 'font-medium text-slate-700' : 'text-slate-500'}>
                    {c.label}
                    {c.requerida && <span className="text-red-400 ml-0.5">*</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-3">
              <span className="text-blue-500 font-medium">●</span> Requerido
              &nbsp;&nbsp;
              <span className="text-slate-300 font-medium">●</span> Opcional
            </p>
          </div>
          <button
            onClick={() => descargarPlantilla(entidad)}
            className="btn-secondary w-full justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar plantilla
          </button>
        </div>
      </div>

      {/* Preview de filas */}
      {filas.length > 0 && erroresValidacion.length === 0 && !resultados && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-slate-800">
                Preview — {filas.length} filas a importar
              </p>
              {entidad === 'materias' && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modoReemplazo}
                    onChange={e => setModoReemplazo(e.target.checked)}
                    className="w-4 h-4 accent-red-500"
                  />
                  <span className="text-sm text-slate-600">
                    <span className="font-semibold text-red-600">Reemplazar todo</span>
                    {' '}— borra las asignaciones de materias a grados existentes antes de importar
                  </span>
                </label>
              )}
            </div>
            <button
              onClick={confirmarImportacion}
              disabled={importando}
              className={`px-5 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60 ${
                modoReemplazo && entidad === 'materias'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'btn-primary-gradient'
              }`}
            >
              {importando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                : modoReemplazo && entidad === 'materias'
                  ? <><XCircle className="w-4 h-4" /> Reemplazar e importar</>
                  : <><CheckCircle2 className="w-4 h-4" /> Confirmar importación</>
              }
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  {columnas.map(c => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 50).map((fila, i) => (
                  <tr key={i}>
                    <td className="text-slate-400 font-mono text-xs">{i + 1}</td>
                    {columnas.map(c => (
                      <td key={c.key} className={!fila[c.key] && c.requerida ? 'text-red-400' : ''}>
                        {fila[c.key] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > 50 && (
              <p className="text-center text-xs text-slate-400 py-3">
                Mostrando las primeras 50 filas de {filas.length}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resultados de importación */}
      {resultados && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-800 mb-1">Reporte de importación</p>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" /> {exitosos} exitosos
              </span>
              {fallidos > 0 && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <XCircle className="w-4 h-4" /> {fallidos} con error
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.fila}>
                    <td className="font-mono text-xs text-slate-400">{r.fila}</td>
                    <td>
                      {r.estado === 'ok'
                        ? <span className="badge bg-green-50 text-green-700">✓ OK</span>
                        : <span className="badge bg-red-50 text-red-600">✗ Error</span>
                      }
                    </td>
                    <td className="text-xs text-slate-500">{r.mensaje || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100">
            <button
              onClick={() => {
                setFilas([])
                setArchivoNombre('')
                setResultados(null)
                setErroresValidacion([])
              }}
              className="btn-secondary text-sm"
            >
              Nueva importación
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
