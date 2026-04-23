'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Bot, X, Send, ChevronDown, Sparkles } from 'lucide-react'
import { apiUrl } from '@/lib/api-url'

// ── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { greeting: (n: string) => string; accent: string; badge: string }> = {
  master:        { accent: 'bg-eos-600',   badge: 'Super Admin',     greeting: n => `Hola ${n}, soy Míster EOS, tu asistente. ¿En qué te ayudo hoy?` },
  direccion:     { accent: 'bg-blue-600',    badge: 'Dirección',       greeting: n => `Hola ${n}, soy Míster EOS, el asistente del Pastor Diego. ¿Qué necesitas?` },
  docente:       { accent: 'bg-violet-600',  badge: 'Coach Pedagógico',greeting: n => `¡Hola ${n}! Soy Míster EOS. El Pastor me envió para acompañarte en tu labor docente. ¿Planificamos una clase o hablamos de metodologías activas?` },
  alumno:        { accent: 'bg-emerald-600', badge: 'Tu Tutor',        greeting: n => `¡Hola ${n}! 👋 Soy Míster EOS. El Pastor Diego está contigo — cuéntame con qué materia necesitas ayuda.` },
  padre:         { accent: 'bg-amber-600',   badge: 'Familias',        greeting: n => `Hola ${n}, soy Míster EOS. El Pastor Diego quiere que sepa que cuenta con el apoyo del colegio. ¿En qué le ayudo?` },
}
const DEFAULT_CFG = { accent: 'bg-slate-600', badge: 'Asistente', greeting: (n: string) => `Hola ${n}, soy Míster EOS. ¿En qué te ayudo?` }

// ── Markdown-lite ─────────────────────────────────────────────────────────────

function Md({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5 text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ') || line.startsWith('## '))
          return <p key={i} className="font-bold mt-2">{line.replace(/^#{2,3}\s/, '')}</p>
        if (line.startsWith('- ') || line.startsWith('• '))
          return <div key={i} className="flex gap-1.5"><span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0" /><span>{fmt(line.slice(2))}</span></div>
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)/)![1]
          return <div key={i} className="flex gap-1.5"><span className="font-semibold shrink-0">{num}.</span><span>{fmt(line.replace(/^\d+\.\s/, ''))}</span></div>
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <p key={i}>{fmt(line)}</p>
      })}
    </div>
  )
}

function fmt(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2,-2)}</strong> : p)}</>
}

// ── Component ────────────────────────────────────────────────────────────────

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

export default function MisterEOSWidget() {
  const { profile, role } = useAuth()
  const cfg = (role && ROLE_CONFIG[role]) ? ROLE_CONFIG[role] : DEFAULT_CFG

  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const db = supabase as any

  // Load last messages from DB on first open
  useEffect(() => {
    if (!open || initialized || !profile) return
    setInitialized(true)

    const init = async () => {
      const { data } = await db
        .from('ai_chat_messages')
        .select('id, role, content')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: true })
        .limit(40)

      if (data && data.length > 0) {
        setMsgs(data)
      } else {
        const firstName = profile.full_name?.split(' ')[0] ?? 'ahí'
        setMsgs([{ id: 'g', role: 'assistant', content: cfg.greeting(firstName) }])
        // Save greeting to DB
        await db.from('ai_chat_messages').insert({
          user_id: profile.id,
          user_name: profile.full_name,
          user_role: role,
          role: 'assistant',
          content: cfg.greeting(firstName),
        })
      }
    }
    init()
  }, [open, initialized, profile]) // eslint-disable-line

  // Auto-scroll
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [msgs, loading, open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !profile) return

    const userMsg: Msg = { id: Date.now().toString(), role: 'user', content: text }
    setMsgs(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Save user message to DB
    await db.from('ai_chat_messages').insert({
      user_id: profile.id,
      user_name: profile.full_name,
      user_role: role,
      role: 'user',
      content: text,
    })

    try {
      const history = [...msgs, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await fetch(apiUrl('/api/chat-ia'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          userRole: role ?? 'administracion',
          userName: profile.full_name ?? 'Usuario',
        }),
      })
      const data = await res.json()
      const aiContent = res.ok ? (data.content ?? 'Lo siento, intenta de nuevo.') : 'Lo siento, hubo un error.'

      const aiMsg: Msg = { id: Date.now() + '-ai', role: 'assistant', content: aiContent }
      setMsgs(prev => [...prev, aiMsg])

      // Save AI response to DB
      await db.from('ai_chat_messages').insert({
        user_id: profile.id,
        user_name: profile.full_name,
        user_role: role,
        role: 'assistant',
        content: aiContent,
      })
    } catch {
      setMsgs(prev => [...prev, { id: Date.now() + '-err', role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, msgs, profile, role]) // eslint-disable-line

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="fixed bottom-[84px] right-3 md:bottom-5 md:right-5 z-50 flex flex-col items-end gap-3">

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden
            w-[calc(100vw-24px)] md:w-[360px]"
          style={{ height: 'min(520px, calc(100dvh - 180px))' }}
        >

          {/* Header */}
          <div className={cn('flex items-center justify-between px-4 py-3 text-white shrink-0', cfg.accent)}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">Míster EOS</p>
                <p className="text-[10px] text-white/75">Asistente del Pastor Diego Martínez</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50">
            {msgs.map(msg => (
              <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
                {msg.role === 'assistant' ? (
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', cfg.accent)}>
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-slate-300 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-slate-700">
                    {profile ? initials(profile.full_name) : 'U'}
                  </div>
                )}
                <div className={cn(
                  'max-w-[80%] rounded-xl px-3 py-2 shadow-sm',
                  msg.role === 'assistant' ? 'bg-white text-slate-800 rounded-tl-sm' : cn(cfg.accent, 'text-white rounded-tr-sm')
                )}>
                  {msg.role === 'assistant' ? <Md text={msg.content} /> : <p className="text-[13px]">{msg.content}</p>}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.accent)}>
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    {[0,150,300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-slate-100 px-3 py-2.5 bg-white">
            <div className="flex items-end gap-2 bg-slate-100 rounded-xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Escribe tu mensaje…"
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 resize-none outline-none leading-relaxed max-h-24"
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 96) + 'px'
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                  input.trim() && !loading ? cn(cfg.accent, 'text-white') : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 text-center mt-1.5 flex items-center justify-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              Míster EOS · Pastor Diego Martínez · Escuela Cristiana E-OS
            </p>
          </div>
        </div>
      )}

      {/* ── Floating button ── */}
      {/* Desktop: pill with label; Mobile: compact circle */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative text-white shadow-lg hover:scale-105 transition-all flex items-center justify-center',
          cfg.accent,
          open
            ? 'w-11 h-11 rounded-full'
            : 'md:flex-row md:gap-2 md:px-4 md:py-3 md:rounded-2xl w-12 h-12 rounded-full md:w-auto md:h-auto'
        )}
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <>
            <Bot className="w-5 h-5" />
            <span className="hidden md:inline text-sm font-semibold">Míster EOS</span>
            <span className="hidden md:inline w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="md:hidden absolute top-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
          </>
        )}
      </button>
    </div>
  )
}
