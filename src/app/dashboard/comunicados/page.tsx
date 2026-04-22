'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { usePermissions } from '@/lib/permissions'
import toast from 'react-hot-toast'
import {
  MessageSquare, Plus, X, CheckCircle, Circle, Megaphone,
  ChevronDown, ChevronUp, Trash2, Edit2, AlertCircle
} from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

type AnnouncementAudience = 'all' | 'docentes' | 'alumnos' | 'padres' | 'administrativo'

interface Announcement {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  requires_confirmation: boolean
  is_published: boolean
  published_at: string | null
  created_at: string
  created_by: string
  creator?: { full_name: string }
  reads?: { confirmed_at: string | null }[]
}

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Todos', docentes: 'Docentes', alumnos: 'Alumnos',
  padres: 'Padres', administrativo: 'Administrativo',
}

const emptyForm = {
  title: '', body: '', audience: 'all' as AnnouncementAudience,
  requires_confirmation: false, is_published: true,
}

export default function ComunicadosPage() {
  const { profile } = useAuth()
  const perms = usePermissions()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [editing, setEditing]             = useState(emptyForm)
  const [editId, setEditId]               = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [filterAudience, setFilterAudience] = useState<'all' | AnnouncementAudience>('all')

  const canCreate = perms.canCreate('comunicados')
  const canDelete = perms.canDelete('comunicados')
  const role = profile?.role ?? null

  // Qué audiencias puede ver cada rol
  const myAudiences: AnnouncementAudience[] | null = (() => {
    if (!role || role === 'master' || role === 'direccion') return null // ven todo
    if (role === 'docente')     return ['all', 'docentes']
    if (role === 'alumno')      return ['all', 'alumnos']
    if (role === 'padre')       return ['all', 'padres']
    // administracion, contabilidad, biblioteca, tienda, marketing, mantenimiento
    return ['all', 'administrativo']
  })()

  // Pestañas de filtro visibles para este rol
  const visibleTabs = (() => {
    if (!myAudiences) return ['all', 'docentes', 'alumnos', 'padres', 'administrativo'] as const
    return ['all', ...myAudiences.filter(a => a !== 'all')] as const
  })()

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('announcements')
      .select(`
        *,
        creator:profiles!announcements_created_by_fkey(full_name),
        reads:announcement_reads!left(confirmed_at)
      `)
      .eq('is_published', true)
      .order('published_at', { ascending: false })

    // Filtrar por audiencia según el rol del usuario
    if (myAudiences) {
      query = query.in('audience', myAudiences)
    }

    const { data, error } = await query

    setLoading(false)
    if (error) { toast.error('Error al cargar comunicados'); return }
    setAnnouncements((data ?? []) as Announcement[])
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadAnnouncements().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadAnnouncements])

  const isRead = (ann: Announcement) => {
    return (ann.reads ?? []).length > 0
  }

  const isConfirmed = (ann: Announcement) => {
    return (ann.reads ?? []).some(r => r.confirmed_at !== null)
  }

  const handleMarkRead = async (ann: Announcement, confirm = false) => {
    if (!profile) return
    const alreadyRead = isRead(ann)

    if (alreadyRead && !confirm) return  // already marked, no action needed

    if (confirm) {
      const { error } = await supabase.from('announcement_reads').upsert({
        announcement_id: ann.id,
        user_id: profile.id,
        confirmed_at: new Date().toISOString(),
      }, { onConflict: 'announcement_id,user_id' })
      if (error) { toast.error('Error al confirmar'); return }
      toast.success('Comunicado confirmado')
    } else {
      const { error } = await supabase.from('announcement_reads').upsert({
        announcement_id: ann.id,
        user_id: profile.id,
        confirmed_at: null,
      }, { onConflict: 'announcement_id,user_id' })
      if (error) return
    }
    loadAnnouncements()
  }

  const openNew = () => {
    setEditId(null)
    setEditing(emptyForm)
    setShowModal(true)
  }

  const openEdit = (ann: Announcement) => {
    setEditId(ann.id)
    setEditing({
      title: ann.title,
      body: ann.body,
      audience: ann.audience,
      requires_confirmation: ann.requires_confirmation,
      is_published: ann.is_published,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!editing.title.trim() || !editing.body.trim()) {
      toast.error('Título y contenido son obligatorios')
      return
    }
    setSaving(true)

    const payload = {
      title: editing.title.trim(),
      body: editing.body.trim(),
      audience: editing.audience,
      requires_confirmation: editing.requires_confirmation,
      is_published: editing.is_published,
      published_at: editing.is_published ? new Date().toISOString() : null,
      created_by: profile!.id,
    }

    let error
    if (!editId) {
      ({ error } = await supabase.from('announcements').insert(payload))
    } else {
      ({ error } = await supabase.from('announcements').update(payload).eq('id', editId))
    }

    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success(!editId ? 'Comunicado publicado' : 'Comunicado actualizado')
    setShowModal(false)
    loadAnnouncements()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este comunicado?')) return
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Comunicado eliminado')
    loadAnnouncements()
  }

  const filtered = filterAudience === 'all'
    ? announcements
    : announcements.filter(a => a.audience === filterAudience || a.audience === 'all')

  const unreadCount = announcements.filter(a => !isRead(a)).length
  const pendingConfirmation = announcements.filter(
    a => a.requires_confirmation && !isConfirmed(a)
  ).length

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="page-title">Comunicados</h1>
            <p className="page-subtitle">Avisos y anuncios institucionales</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={openNew} className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo Comunicado
          </button>
        )}
      </div>

      {/* Stats */}
      {(unreadCount > 0 || pendingConfirmation > 0) && (
        <div className="flex flex-wrap gap-3">
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 rounded-xl border border-blue-100">
              <Circle className="w-4 h-4 text-blue-500 fill-blue-500" />
              <span className="text-sm text-blue-700 font-medium">{unreadCount} sin leer</span>
            </div>
          )}
          {pendingConfirmation > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 rounded-xl border border-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-amber-700 font-medium">
                {pendingConfirmation} pendiente{pendingConfirmation > 1 ? 's' : ''} de confirmar
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {visibleTabs.map(aud => (
          <button
            key={aud}
            onClick={() => setFilterAudience(aud)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border
              ${filterAudience === aud
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
          >
            {aud === 'all' ? 'Todos' : AUDIENCE_LABELS[aud]}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-12 text-center text-slate-400 text-sm">Cargando comunicados...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No hay comunicados disponibles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ann => {
            const read = isRead(ann)
            const confirmed = isConfirmed(ann)
            const isExpanded = expanded === ann.id

            return (
              <div
                key={ann.id}
                className={`card border transition-all ${
                  !read ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100'
                }`}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer"
                  onClick={() => {
                    setExpanded(isExpanded ? null : ann.id)
                    if (!read) handleMarkRead(ann, false)
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${!read ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm ${!read ? 'text-slate-900' : 'text-slate-700'}`}>
                        {ann.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">
                          {ann.creator?.full_name ?? 'Sistema'} ·{' '}
                          {ann.published_at
                            ? new Date(ann.published_at).toLocaleDateString('es-CR', { day:'numeric', month:'short', year:'numeric' })
                            : '—'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                          {AUDIENCE_LABELS[ann.audience]}
                        </span>
                        {ann.requires_confirmation && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${confirmed ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {confirmed ? '✓ Confirmado' : 'Requiere confirmación'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {canCreate && (
                      <>
                        <button onClick={e => { e.stopPropagation(); openEdit(ann) }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {canDelete && (
                          <button onClick={e => { e.stopPropagation(); handleDelete(ann.id) }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {ann.body}
                    </p>
                    {ann.requires_confirmation && !confirmed && (
                      <button
                        onClick={() => handleMarkRead(ann, true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700
                          text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Confirmar lectura
                      </button>
                    )}
                    {ann.requires_confirmation && confirmed && (
                      <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />
                        Confirmaste la lectura de este comunicado
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {!editId ? 'Nuevo Comunicado' : 'Editar Comunicado'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Título *</label>
                <input className="input" value={editing.title}
                  onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                  placeholder="Título del comunicado" />
              </div>
              <div>
                <label className="label">Contenido *</label>
                <textarea
                  className="input min-h-[140px] resize-y"
                  value={editing.body}
                  onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  placeholder="Escribe el contenido del comunicado..." />
              </div>
              <div>
                <label className="label">Dirigido a</label>
                <select className="input" value={editing.audience}
                  onChange={e => setEditing(p => ({ ...p, audience: e.target.value as AnnouncementAudience }))}>
                  <option value="all">Todos</option>
                  <option value="docentes">Docentes</option>
                  <option value="alumnos">Alumnos</option>
                  <option value="padres">Padres</option>
                  <option value="administrativo">Administrativo</option>
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setEditing(p => ({ ...p, requires_confirmation: !p.requires_confirmation }))}
                    className={`w-10 h-5.5 rounded-full transition-colors relative
                      ${editing.requires_confirmation ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform
                      ${editing.requires_confirmation ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-slate-700">Requiere confirmación de lectura</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setEditing(p => ({ ...p, is_published: !p.is_published }))}
                    className={`w-10 h-5.5 rounded-full transition-colors relative
                      ${editing.is_published ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform
                      ${editing.is_published ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-slate-700">Publicar inmediatamente</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : !editId ? 'Publicar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
