'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, getInitials } from '@/lib/utils'
import { Bell, Search, X, CheckCheck, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const db = supabase as any
const LS_KEY = 'lastChatVisit'

interface Notification {
  id: string
  title: string
  body: string | null
  type: string
  event_date: string | null
  is_read: boolean
  created_at: string
}

export default function Header() {
  const { profile } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const today = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })

  const [notifs, setNotifs]         = useState<Notification[]>([])
  const [showPanel, setShowPanel]   = useState(false)
  const panelRef                    = useRef<HTMLDivElement>(null)

  const unread = notifs.filter(n => !n.is_read).length

  const loadNotifs = useCallback(async () => {
    if (!profile) return
    const { data } = await db
      .from('notifications')
      .select('id, title, body, type, event_date, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs((data ?? []) as Notification[])
  }, [profile])

  useEffect(() => { loadNotifs() }, [loadNotifs])

  // Realtime: nueva notificación → recargar campana al instante
  useEffect(() => {
    if (!profile?.id) return
    const ch = db.channel('notifs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => {
        loadNotifs()
      })
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [profile?.id, loadNotifs])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (id: string, type?: string) => {
    await db.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setShowPanel(false)
    if (type === 'store_order') {
      // Disparar evento para que tienda/page lo escuche si ya está montado
      window.dispatchEvent(new CustomEvent('tienda:open-tab', { detail: 'pedidos' }))
      // Si no está en tienda, navegar allá (el evento + localStorage cubre ambos casos)
      localStorage.setItem('tienda_open_tab', 'pedidos')
      if (pathname !== '/dashboard/tienda') router.push('/dashboard/tienda')
    }
  }

  const markAllRead = async () => {
    const ids = notifs.filter(n => !n.is_read).map(n => n.id)
    if (ids.length === 0) return
    await db.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    const hrs  = Math.floor(mins / 60)
    const days = Math.floor(hrs / 24)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `${mins}m`
    if (hrs < 24) return `${hrs}h`
    return `${days}d`
  }

  const [hasUnreadMsg, setHasUnreadMsg] = useState(false)

  // When user is on the chat page → update lastChatVisit and clear dot
  useEffect(() => {
    if (pathname === '/dashboard/chat') {
      localStorage.setItem(LS_KEY, new Date().toISOString())
      setHasUnreadMsg(false)
    }
  }, [pathname])

  // Check for unread messages whenever profile changes or pathname changes (excluding chat)
  useEffect(() => {
    if (!profile || pathname === '/dashboard/chat') return

    let cancelled = false

    const check = async () => {
      const lastVisit = localStorage.getItem(LS_KEY) ?? '2000-01-01T00:00:00.000Z'
      const { count } = await db
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .neq('sender_id', profile.id)
        .eq('is_deleted', false)
        .gt('created_at', lastVisit)
      if (!cancelled) setHasUnreadMsg((count ?? 0) > 0)
    }

    check()

    // Realtime: listen for new messages
    const channel = db
      .channel('header-msg-watch')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      }, (payload: any) => {
        if (payload.new?.sender_id !== profile.id) {
          setHasUnreadMsg(true)
        }
      })
      .subscribe()

    return () => {
      cancelled = true
      db.removeChannel(channel)
    }
  }, [profile, pathname])

  return (
    <header className="bg-white border-b border-slate-100 flex items-center shrink-0
      h-14 md:h-16 px-3 md:px-6
      justify-between md:justify-between"
    >
      {/* ── MOBILE layout ── */}
      <div className="flex md:hidden items-center w-full gap-2">
        {/* Left: avatar */}
        {profile && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{getInitials(profile.full_name)}</span>
          </div>
        )}

        {/* Center: school name */}
        <div className="flex-1 flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-800 leading-tight">E-OS School</p>
          {profile && (
            <p className="text-[10px] text-slate-400 leading-tight">{ROLE_LABELS[profile.role]}</p>
          )}
        </div>

        {/* Right: chat + bell */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Link
            href="/dashboard/chat"
            className="relative p-2 text-slate-500 hover:text-slate-700 rounded-xl transition-colors"
            title="Mensajes"
          >
            <MessageSquare className="w-5 h-5" />
            {hasUnreadMsg && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
            )}
          </Link>

          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowPanel(p => !p)}
              className="relative p-2 text-slate-500 hover:text-slate-700 rounded-xl transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showPanel && (
              <div className="absolute right-0 top-12 w-[calc(100vw-24px)] max-w-xs bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="font-semibold text-sm text-slate-800">Notificaciones</span>
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <button onClick={markAllRead} className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> Leer todas
                      </button>
                    )}
                    <button onClick={() => setShowPanel(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">Sin notificaciones</div>
                  ) : notifs.map(n => (
                    <div key={n.id} onClick={() => markRead(n.id, n.type)}
                      className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-red-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-semibold leading-snug ${!n.is_read ? 'text-slate-800' : 'text-slate-500'}`}>{n.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                      </div>
                      {n.body && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DESKTOP layout ── */}
      <div className="hidden md:block">
        <p className="text-xs text-slate-400 capitalize">{today}</p>
        <p className="text-sm font-semibold text-slate-800">Colegio E-OS Demo</p>
      </div>

      <div className="hidden md:flex items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400">
          <Search className="w-3.5 h-3.5" />
          <span>Buscar...</span>
          <kbd className="ml-2 text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </div>

        {/* Chat */}
        <Link
          href="/dashboard/chat"
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          title="Mensajes"
        >
          <MessageSquare className="w-5 h-5" />
          {hasUnreadMsg && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          )}
        </Link>

        {/* Notifications */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowPanel(p => !p)}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showPanel && (
            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-800">Notificaciones</span>
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1">
                      <CheckCheck className="w-3 h-3" /> Marcar todas leídas
                    </button>
                  )}
                  <button onClick={() => setShowPanel(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
                {notifs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">Sin notificaciones</div>
                ) : notifs.map(n => (
                  <div key={n.id} onClick={() => markRead(n.id, n.type)}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-red-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-snug ${!n.is_read ? 'text-slate-800' : 'text-slate-500'}`}>{n.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                      </div>
                    </div>
                    {n.body && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        {profile && (
          <Link href="/dashboard/perfil" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{profile.full_name}</p>
              <p className="text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{getInitials(profile.full_name)}</span>
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
