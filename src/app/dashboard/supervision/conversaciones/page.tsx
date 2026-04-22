'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Bot, User, ChevronDown, ChevronUp, MessageSquare, Users, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import BackButton from '@/components/ui/BackButton'

const db = supabase as any

const ROLE_LABELS: Record<string, string> = {
  master: 'Super Admin', direccion: 'Dirección', docente: 'Docente',
  alumno: 'Estudiante', padre: 'Padre/Madre', administracion: 'Administración',
  contabilidad: 'Contabilidad', biblioteca: 'Biblioteca',
}
const ROLE_COLORS: Record<string, string> = {
  master: 'bg-eos-100 text-eos-700', direccion: 'bg-blue-100 text-blue-700',
  docente: 'bg-violet-100 text-violet-700', alumno: 'bg-emerald-100 text-emerald-700',
  padre: 'bg-amber-100 text-amber-700', administracion: 'bg-slate-100 text-slate-700',
}

interface ConvUser {
  user_id: string
  user_name: string
  user_role: string
  last_message: string
  last_at: string
  total: number
  messages: { id: string; role: string; content: string; created_at: string }[]
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
}

export default function ConversacionesPage() {
  const [users, setUsers] = useState<ConvUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    const load = async () => {
      const { data } = await db
        .from('ai_chat_messages')
        .select('id, user_id, user_name, user_role, role, content, created_at')
        .order('created_at', { ascending: true })

      const arr: any[] = data ?? []

      // Group by user_id
      const map = new Map<string, ConvUser>()
      for (const m of arr) {
        if (!m.user_id) continue
        if (!map.has(m.user_id)) {
          map.set(m.user_id, {
            user_id: m.user_id,
            user_name: m.user_name ?? '—',
            user_role: m.user_role ?? '',
            last_message: m.content,
            last_at: m.created_at,
            total: 0,
            messages: [],
          })
        }
        const u = map.get(m.user_id)!
        u.messages.push({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })
        u.last_message = m.content
        u.last_at = m.created_at
        u.total++
      }

      const list = Array.from(map.values())
        .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      setUsers(list)
      setLoading(false)
      clearTimeout(t)
    }
    load().catch(() => { setLoading(false); clearTimeout(t) })
    return () => clearTimeout(t)
  }, [])

  const toggle = (id: string) => setExpanded(e => e === id ? null : id)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const totalMsgs = users.reduce((s, u) => s + u.total, 0)
  const docentes = users.filter(u => u.user_role === 'docente').length
  const alumnos = users.filter(u => u.user_role === 'alumno').length
  const padres = users.filter(u => u.user_role === 'padre').length

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Bot className="w-6 h-6 text-eos-600" />
          <h1 className="page-title">Conversaciones con Míster EOS</h1>
        </div>
        <p className="page-subtitle">Supervisa todas las interacciones de la comunidad E-OS con el asistente IA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Usuarios activos', value: users.length, icon: Users, color: 'text-eos-600', bg: 'bg-eos-50' },
          { label: 'Mensajes totales', value: totalMsgs, icon: MessageSquare, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Docentes', value: docentes, icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Estudiantes + Padres', value: alumnos + padres, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="card p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Conversations */}
      {users.length === 0 ? (
        <div className="card p-16 text-center">
          <Bot className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Aún no hay conversaciones</p>
          <p className="text-xs text-slate-400 mt-1">Las conversaciones aparecerán aquí cuando los usuarios hablen con Míster EOS</p>
          <p className="text-xs text-slate-400 mt-3 font-medium">⚠️ Asegúrate de haber ejecutado <code className="bg-slate-100 px-1 rounded">supabase/e15_ai_chat.sql</code> en Supabase</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => {
            const isOpen = expanded === u.user_id
            const roleCls = ROLE_COLORS[u.user_role] ?? 'bg-slate-100 text-slate-600'
            const roleLabel = ROLE_LABELS[u.user_role] ?? u.user_role
            const initials = u.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            const userMsgs = u.messages.filter(m => m.role === 'user').length

            return (
              <div key={u.user_id} className="card overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => toggle(u.user_id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-slate-50/60 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-eos-500 to-eos-700 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-slate-800 text-sm truncate">{u.user_name}</p>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', roleCls)}>{roleLabel}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{u.last_message}</p>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {timeAgo(u.last_at)}
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {userMsgs} mens.
                    </span>
                  </div>

                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {/* Messages */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
                    {u.messages.map(m => (
                      <div key={m.id} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
                        <div className={cn(
                          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                          m.role === 'user' ? 'bg-slate-300' : 'bg-eos-600'
                        )}>
                          {m.role === 'user'
                            ? <User className="w-3 h-3 text-slate-600" />
                            : <Bot className="w-3 h-3 text-white" />
                          }
                        </div>
                        <div className={cn(
                          'max-w-[80%] rounded-xl px-3 py-2 text-xs',
                          m.role === 'user' ? 'bg-slate-200 text-slate-700 rounded-tr-sm' : 'bg-white text-slate-700 shadow-sm rounded-tl-sm'
                        )}>
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p className="text-[9px] text-slate-400 mt-1 text-right">
                            {new Date(m.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
