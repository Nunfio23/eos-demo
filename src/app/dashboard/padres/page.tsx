'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import {
  Users, Search, Pencil, X, Check, Shield,
  Phone, Mail, UserPlus, Link2, Unlink, GraduationCap,
  ChevronDown, ChevronUp, Baby, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

// ─── Types ────────────────────────────────────────────────────────────────────

interface Parent {
  id: string           // profiles.id
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  is_active: boolean
  created_at: string
  children: Child[]
}

interface Child {
  student_id: string
  student_name: string
  grade_level: string
  section: string
  enrollment_number: string
}

interface StudentOption {
  student_id: string
  student_name: string
  grade_level: string
  section: string
  enrollment_number: string
  current_parent_id: string | null
}

type FormData = {
  full_name: string
  email: string
  phone: string
  address: string
}

const emptyForm: FormData = { full_name: '', email: '', phone: '', address: '' }

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PadresPage() {
  const { profile } = useAuth()

  const [parents, setParents]           = useState<Parent[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)

  // Edit modal
  const [showEdit, setShowEdit]         = useState(false)
  const [editTarget, setEditTarget]     = useState<Parent | null>(null)
  const [form, setForm]                 = useState<FormData>(emptyForm)

  // Link children modal
  const [showChildren, setShowChildren] = useState(false)
  const [childTarget, setChildTarget]   = useState<Parent | null>(null)
  const [allStudents, setAllStudents]   = useState<StudentOption[]>([])
  const [childSearch, setChildSearch]   = useState('')
  const [linking, setLinking]           = useState(false)

  // Guard
  const allowed = profile?.role === 'master'

  const load = useCallback(async () => {
    setLoading(true)

    // Get all profiles with role='padre'
    const { data: padreProfiles } = await db
      .from('profiles')
      .select('id, full_name, email, phone, address, is_active, created_at')
      .eq('role', 'padre')
      .order('full_name')

    const padreArr: any[] = padreProfiles ?? []
    if (padreArr.length === 0) { setParents([]); setLoading(false); return }

    const padreIds = padreArr.map((p: any) => p.id)

    // Get all students linked to these parents via student_parents table
    const { data: relationsRaw } = await db
      .from('student_parents')
      .select('student_id, parent_id, students(id, user_id, enrollment_number, grade_level, section)')
      .in('parent_id', padreIds)

    const relationsArr: any[] = relationsRaw ?? []

    // Get student profile names
    const stuUserIds = relationsArr.map((r: any) => r.students?.user_id).filter(Boolean)
    const stuProfileMap = new Map<string, string>()
    if (stuUserIds.length > 0) {
      const { data: stuProfiles } = await db
        .from('profiles')
        .select('id, full_name')
        .in('id', stuUserIds)
      for (const p of (stuProfiles ?? [])) stuProfileMap.set(p.id, p.full_name)
    }

    // Build parent list
    const result: Parent[] = padreArr.map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? '—',
      email: p.email,
      phone: p.phone,
      address: p.address,
      is_active: p.is_active !== false,
      created_at: p.created_at,
      children: relationsArr
        .filter((r: any) => r.parent_id === p.id)
        .map((r: any) => ({
          student_id: r.student_id,
          student_name: stuProfileMap.get(r.students?.user_id) ?? 'Estudiante',
          grade_level: r.students?.grade_level ?? '—',
          section: r.students?.section ?? '—',
          enrollment_number: r.students?.enrollment_number ?? '—',
        })),
    }))

    setParents(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!allowed) { setLoading(false); return }
    const t = setTimeout(() => setLoading(false), 15000)
    load().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [load, allowed])

  // ── Edit padre profile ──────────────────────────────────────────────────────
  const openEdit = (p: Parent) => {
    setEditTarget(p)
    setForm({ full_name: p.full_name, email: p.email ?? '', phone: p.phone ?? '', address: p.address ?? '' })
    setShowEdit(true)
  }

  const handleSave = async () => {
    if (!editTarget || !form.full_name.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    const { error } = await db.from('profiles').update({
      full_name: form.full_name.trim(),
      phone:     form.phone    || null,
      address:   form.address  || null,
    }).eq('id', editTarget.id)
    if (error) { toast.error('Error al guardar'); setSaving(false); return }
    toast.success('Datos actualizados')
    setSaving(false)
    setShowEdit(false)
    load()
  }

  // ── Link children ───────────────────────────────────────────────────────────
  const openChildren = async (p: Parent) => {
    setChildTarget(p)
    setChildSearch('')

    // Load all active students
    const { data: stuRaw } = await db
      .from('students')
      .select('id, user_id, enrollment_number, grade_level, section')
      .eq('is_active', true)
      .order('grade_level')

    const stuArr: any[] = stuRaw ?? []
    const stuUserIds2 = stuArr.map((s: any) => s.user_id).filter(Boolean)
    const nameMap = new Map<string, string>()
    if (stuUserIds2.length > 0) {
      const { data: np } = await db.from('profiles').select('id, full_name').in('id', stuUserIds2)
      for (const x of (np ?? [])) nameMap.set(x.id, x.full_name)
    }

    // Get which students are linked to THIS padre and ANY others
    const { data: allRelationsRaw } = await db
      .from('student_parents')
      .select('student_id, parent_id')
      .in('student_id', stuArr.map((s: any) => s.id))

    const relationMap = new Map<string, string[]>() // student_id → [parent_ids]
    for (const rel of (allRelationsRaw ?? [])) {
      const current = relationMap.get(rel.student_id) ?? []
      relationMap.set(rel.student_id, [...current, rel.parent_id])
    }

    setAllStudents(stuArr.map((s: any) => ({
      student_id: s.id,
      student_name: nameMap.get(s.user_id) ?? 'Estudiante',
      grade_level: s.grade_level,
      section: s.section,
      enrollment_number: s.enrollment_number,
      current_parent_id: relationMap.get(s.id)?.[0] ?? null, // First parent for backward compat
    })))

    setShowChildren(true)
  }

  const linkChild = async (studentId: string) => {
    if (!childTarget) return
    setLinking(true)
    // Check if already linked to this padre
    const { data: existing } = await db
      .from('student_parents')
      .select('id')
      .eq('student_id', studentId)
      .eq('parent_id', childTarget.id)
      .maybeSingle()

    if (existing) {
      toast.error('Este estudiante ya está vinculado a este padre')
      setLinking(false)
      return
    }

    // Insert into student_parents (muchos-a-muchos)
    const { error } = await db.from('student_parents').insert({
      student_id: studentId,
      parent_id: childTarget.id,
    })
    if (error) { toast.error('Error al vincular: ' + error.message); setLinking(false); return }
    toast.success('Hijo vinculado')
    setAllStudents(prev => prev.map(s => s.student_id === studentId ? { ...s, current_parent_id: childTarget.id } : s))
    setChildTarget(prev => prev ? { ...prev, children: [...prev.children, allStudents.find(s => s.student_id === studentId)!] } : prev)
    setLinking(false)
    load()
  }

  const unlinkChild = async (parentId: string, studentId: string) => {
    if (!confirm('¿Desvincular este hijo del padre?')) return
    // Delete from student_parents (allow-many relationship)
    const { error } = await db
      .from('student_parents')
      .delete()
      .eq('student_id', studentId)
      .eq('parent_id', parentId)
    if (error) { toast.error('Error al desvincular: ' + error.message); return }
    toast.success('Hijo desvinculado')
    load()
  }

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = parents.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      p.children.some(c => (c.student_name ?? '').toLowerCase().includes(q))
  })

  const filteredStudents = allStudents.filter(s => {
    if (!childSearch) return true
    const q = childSearch.toLowerCase()
    return (s.student_name ?? '').toLowerCase().includes(q) || (s.enrollment_number ?? '').toLowerCase().includes(q) || (s.grade_level ?? '').toLowerCase().includes(q)
  })

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!profile) return null

  if (!allowed) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <Shield className="w-10 h-10" />
      <p className="text-sm">Acceso restringido al Master</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sky-200 text-sm font-medium mb-1">Gestión de Padres de Familia</p>
            <h1 className="text-2xl font-bold">Padres de Familia</h1>
            <p className="text-sky-200 text-sm mt-1">{parents.length} padre{parents.length !== 1 ? 's' : ''} registrado{parents.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-700">
          <p className="font-semibold mb-0.5">¿Cómo registrar un padre?</p>
          <p>El padre debe crear su cuenta en el sistema. Luego, en <strong>Supabase → Auth → Users</strong>, cambia su rol a <code className="bg-blue-100 px-1 rounded">padre</code> en la tabla <code className="bg-blue-100 px-1 rounded">profiles</code>. Después vincúlale sus hijos aquí.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono o hijo…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {parents.length === 0 ? 'No hay padres registrados con rol "padre".' : 'Sin resultados para la búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ParentCard
              key={p.id}
              parent={p}
              expanded={expanded === p.id}
              onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
              onEdit={() => openEdit(p)}
              onManageChildren={() => openChildren(p)}
              onUnlinkChild={(stuId) => unlinkChild(p.id, stuId)}
            />
          ))}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEdit && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Editar Padre</h2>
              <button onClick={() => setShowEdit(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+503 0000-0000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
              </div>
              <p className="text-xs text-slate-400">El email no puede editarse aquí — se gestiona desde Supabase Auth.</p>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Children Modal ── */}
      {showChildren && childTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800">Vincular Hijos</h2>
                <p className="text-xs text-slate-400">{childTarget.full_name}</p>
              </div>
              <button onClick={() => setShowChildren(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Currently linked children */}
            {childTarget.children.length > 0 && (
              <div className="p-4 border-b border-slate-100 shrink-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hijos vinculados</p>
                <div className="space-y-2">
                  {childTarget.children.map(c => (
                    <div key={c.student_id} className="flex items-center justify-between bg-sky-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center">
                          <Baby className="w-3.5 h-3.5 text-sky-600" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-700">{c.student_name}</p>
                          <p className="text-[10px] text-slate-400">{c.grade_level} · Sección {c.section}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          unlinkChild(childTarget.id, c.student_id)
                          setChildTarget(prev => prev ? { ...prev, children: prev.children.filter(x => x.student_id !== c.student_id) } : prev)
                          setAllStudents(prev => prev.map(s => s.student_id === c.student_id ? { ...s, current_parent_id: null } : s))
                        }}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Desvincular"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search students */}
            <div className="p-4 shrink-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Vincular estudiante</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={childSearch} onChange={e => setChildSearch(e.target.value)}
                  placeholder="Buscar por nombre, código, grado…"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin estudiantes</p>
              ) : filteredStudents.map(s => {
                const isLinkedHere = s.current_parent_id === childTarget.id
                const isLinkedElsewhere = s.current_parent_id && s.current_parent_id !== childTarget.id
                return (
                  <div key={s.student_id}
                    className={cn('flex items-center justify-between rounded-xl px-3 py-2.5 border transition-colors',
                      isLinkedHere ? 'bg-sky-50 border-sky-200' : 'bg-white border-slate-100 hover:border-slate-200'
                    )}>
                    <div className="flex items-center gap-2.5">
                      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold',
                        isLinkedHere ? 'bg-sky-200 text-sky-700' : 'bg-slate-100 text-slate-500')}>
                        {s.student_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">{s.student_name}</p>
                        <p className="text-[10px] text-slate-400">{s.grade_level} · Sección {s.section} · {s.enrollment_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isLinkedElsewhere && !isLinkedHere && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">+1 padre</span>
                      )}
                      {isLinkedHere ? (
                        <span className="text-[10px] font-semibold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full">Vinculado</span>
                      ) : (
                        <button
                          onClick={() => linkChild(s.student_id)}
                          disabled={linking}
                          className="flex items-center gap-1 text-[11px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Link2 className="w-3 h-3" /> Vincular
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-4 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowChildren(false)}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Parent Card ──────────────────────────────────────────────────────────────

function ParentCard({
  parent, expanded, onToggle, onEdit, onManageChildren, onUnlinkChild,
}: {
  parent: Parent
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onManageChildren: () => void
  onUnlinkChild: (stuId: string) => void
}) {
  const initials = parent.full_name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
          <span className="text-sky-700 font-bold text-sm">{initials}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 truncate">{parent.full_name}</h3>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
              parent.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
              {parent.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {parent.email && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Mail className="w-3 h-3" /> {parent.email}
              </span>
            )}
            {parent.phone && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Phone className="w-3 h-3" /> {parent.phone}
              </span>
            )}
          </div>
        </div>

        {/* Children count */}
        <div className="text-center shrink-0">
          <div className="flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">{parent.children.length}</span>
          </div>
          <p className="text-[10px] text-slate-400">hijo{parent.children.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
            title="Editar">
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button onClick={onManageChildren}
            className="w-8 h-8 rounded-lg hover:bg-sky-50 flex items-center justify-center transition-colors"
            title="Gestionar hijos">
            <UserPlus className="w-3.5 h-3.5 text-sky-500" />
          </button>
          <button onClick={onToggle}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Expanded children */}
      {expanded && (
        <div className="border-t border-slate-100 p-4">
          {parent.children.length === 0 ? (
            <div className="text-center py-4">
              <Baby className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
              <p className="text-xs text-slate-400">Sin hijos vinculados</p>
              <button onClick={onManageChildren}
                className="mt-2 text-xs text-sky-600 hover:underline flex items-center gap-1 mx-auto">
                <Link2 className="w-3 h-3" /> Vincular hijo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hijos vinculados</p>
              {parent.children.map(c => (
                <div key={c.student_id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                      <Baby className="w-3.5 h-3.5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{c.student_name}</p>
                      <p className="text-xs text-slate-400">{c.grade_level} · Sección {c.section} · {c.enrollment_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onUnlinkChild(c.student_id)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Desvincular"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={onManageChildren}
                className="w-full mt-1 py-2 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 hover:text-sky-600 hover:border-sky-300 transition-colors flex items-center justify-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" /> Vincular otro hijo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
