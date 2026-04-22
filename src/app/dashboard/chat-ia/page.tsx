'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Send, Trash2, Bot, Sparkles, BookOpen, GraduationCap, Users, Briefcase } from 'lucide-react'
import type { UserRole } from '@/types/database'
import { apiUrl } from '@/lib/api-url'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ── Role configuration ──────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, {
  botName: string
  subtitle: string
  greeting: (name: string) => string
  avatarBg: string
  userBubble: string
  aiBubble: string
  headerBg: string
  icon: React.ElementType
  badge: string
  badgeCls: string
}> = {
  master: {
    botName: 'Míster EOS',
    subtitle: 'Asistente del Pastor Diego Martínez · Acceso completo',
    greeting: (n) => `Hola ${n}, soy Míster EOS, el asistente del Pastor Diego Martínez. Tengo acceso completo al sistema E-OS para ayudarte a gestionar y tomar las mejores decisiones para la Escuela Cristiana E-OS. ¿En qué te ayudo hoy?`,
    avatarBg: 'bg-eos-600',
    userBubble: 'bg-eos-600 text-white',
    aiBubble: 'bg-slate-100 text-slate-800',
    headerBg: 'from-eos-700 to-eos-900',
    icon: Sparkles,
    badge: 'Super Admin',
    badgeCls: 'bg-eos-100 text-eos-700',
  },
  direccion: {
    botName: 'Míster EOS',
    subtitle: 'Asistente del Pastor Diego Martínez',
    greeting: (n) => `Hola ${n}, soy Míster EOS, el asistente del Pastor Diego Martínez. El Pastor quiere que sepas que está para ti y para todo el equipo. Puedo ayudarte con gestión pedagógica, supervisión de docentes y cualquier decisión operativa. ¿Qué necesitas?`,
    avatarBg: 'bg-blue-600',
    userBubble: 'bg-blue-600 text-white',
    aiBubble: 'bg-slate-100 text-slate-800',
    headerBg: 'from-blue-700 to-blue-900',
    icon: Briefcase,
    badge: 'Dirección',
    badgeCls: 'bg-blue-100 text-blue-700',
  },
  docente: {
    botName: 'Míster EOS',
    subtitle: 'Asistente del Pastor Diego Martínez · Coach Pedagógico',
    greeting: (n) => `¡Hola ${n}! Soy Míster EOS, el asistente del Pastor Diego Martínez. El Pastor me envió para acompañarte en tu labor docente — eres parte fundamental de esta familia E-OS. Soy tu coach en metodologías activas del siglo XXI. ¿Quieres planificar una clase, revisar un guión o hablar sobre estrategias de enseñanza?`,
    avatarBg: 'bg-violet-600',
    userBubble: 'bg-violet-600 text-white',
    aiBubble: 'bg-slate-100 text-slate-800',
    headerBg: 'from-violet-700 to-violet-900',
    icon: BookOpen,
    badge: 'Coach Pedagógico',
    badgeCls: 'bg-violet-100 text-violet-700',
  },
  alumno: {
    botName: 'Míster EOS',
    subtitle: 'Tu amigo en el aprendizaje · Asistente del Pastor Diego',
    greeting: (n) => `¡Hola ${n}! 👋 Soy Míster EOS. El Pastor Diego Martínez me puso aquí especialmente para ti, porque quiere que tengas todo el apoyo que necesitas para triunfar. Estoy aquí para ayudarte con tus materias y motivarte. ¿Con qué empezamos?`,
    avatarBg: 'bg-emerald-600',
    userBubble: 'bg-emerald-600 text-white',
    aiBubble: 'bg-slate-100 text-slate-800',
    headerBg: 'from-emerald-700 to-emerald-900',
    icon: GraduationCap,
    badge: 'Tu Tutor',
    badgeCls: 'bg-emerald-100 text-emerald-700',
  },
  padre: {
    botName: 'Míster EOS',
    subtitle: 'Asistente del Pastor Diego Martínez · Para las familias',
    greeting: (n) => `Hola ${n}, soy Míster EOS, el asistente del Pastor Diego Martínez. El Pastor quiere que cada familia de la Escuela Cristiana E-OS sepa que cuenta con su apoyo. Estoy aquí para orientarle sobre la educación de su hijo/a o cualquier consulta sobre el colegio. ¿En qué le ayudo?`,
    avatarBg: 'bg-amber-600',
    userBubble: 'bg-amber-600 text-white',
    aiBubble: 'bg-slate-100 text-slate-800',
    headerBg: 'from-amber-700 to-amber-900',
    icon: Users,
    badge: 'Familias',
    badgeCls: 'bg-amber-100 text-amber-700',
  },
}

const DEFAULT_CONFIG = {
  botName: 'Míster EOS',
  subtitle: 'Asistente del Pastor Diego Martínez',
  greeting: (n: string) => `Hola ${n}, soy Míster EOS, el asistente del Pastor Diego Martínez. El Pastor quiere que todo el equipo de la Escuela Cristiana E-OS sepa que cuenta con su apoyo. ¿En qué te ayudo hoy?`,
  avatarBg: 'bg-slate-600',
  userBubble: 'bg-slate-700 text-white',
  aiBubble: 'bg-slate-100 text-slate-800',
  headerBg: 'from-slate-700 to-slate-900',
  icon: Bot,
  badge: 'Asistente',
  badgeCls: 'bg-slate-100 text-slate-600',
}

// ── Markdown-lite renderer ──────────────────────────────────────────────────

function renderContent(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<p key={i} className="font-bold text-sm mt-3 mb-1 text-slate-800">{line.slice(4)}</p>)
    } else if (line.startsWith('## ')) {
      elements.push(<p key={i} className="font-bold text-base mt-3 mb-1 text-slate-800">{line.slice(3)}</p>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(<p key={i} className="font-semibold text-sm mt-1">{line.slice(2, -2)}</p>)
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm my-0.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
          <span>{formatInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)![1]
      elements.push(
        <div key={i} className="flex gap-2 text-sm my-0.5">
          <span className="shrink-0 font-semibold min-w-[18px]">{num}.</span>
          <span>{formatInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>)
    }
    i++
  }
  return <div className="space-y-0.5">{elements}</div>
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p
      )}
    </>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ChatIAPage() {
  const { profile, role } = useAuth()
  const cfg = (role && ROLE_CONFIG[role]) ? ROLE_CONFIG[role] : DEFAULT_CONFIG
  const Icon = cfg.icon

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Initial greeting
  useEffect(() => {
    if (!profile) return
    const firstName = profile.full_name?.split(' ')[0] ?? 'ahí'
    setMessages([{
      id: 'greeting',
      role: 'assistant',
      content: cfg.greeting(firstName),
    }])
  }, [profile]) // eslint-disable-line

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(apiUrl('/api/chat-ia'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          userRole: role ?? 'administracion',
          userName: profile?.full_name ?? 'Usuario',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')

      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: data.content,
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-err',
        role: 'assistant',
        content: 'Lo siento, hubo un error. Intenta de nuevo.',
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, messages, role, profile])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearChat = () => {
    if (!profile) return
    const firstName = profile.full_name?.split(' ')[0] ?? 'ahí'
    setMessages([{ id: 'greeting', role: 'assistant', content: cfg.greeting(firstName) }])
    setInput('')
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">

      {/* ── Header ── */}
      <div className={cn('bg-gradient-to-r text-white px-6 py-4 flex items-center justify-between shrink-0', cfg.headerBg)}>
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', cfg.avatarBg)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base leading-tight">{cfg.botName}</h1>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.badgeCls)}>
                {cfg.badge}
              </span>
            </div>
            <p className="text-white/70 text-xs">{cfg.subtitle}</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Nueva conversación
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>

            {/* Avatar */}
            {msg.role === 'assistant' ? (
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', cfg.avatarBg)}>
                <Icon className="w-4 h-4 text-white" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-slate-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-slate-700">
                {profile ? getInitials(profile.full_name) : 'U'}
              </div>
            )}

            {/* Bubble */}
            <div className={cn(
              'max-w-[78%] rounded-2xl px-4 py-3 shadow-sm',
              msg.role === 'assistant'
                ? cn(cfg.aiBubble, 'rounded-tl-sm')
                : cn(cfg.userBubble, 'rounded-tr-sm'),
            )}>
              {msg.role === 'assistant'
                ? renderContent(msg.content)
                : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              }
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', cfg.avatarBg)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className={cn('rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm', cfg.aiBubble)}>
              <div className="flex gap-1.5 items-center h-5">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-3">
        <div className="flex items-end gap-2 bg-slate-100 rounded-2xl px-4 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Escribe tu mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 resize-none outline-none leading-relaxed max-h-32"
            style={{ minHeight: '24px' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all',
              input.trim() && !loading
                ? cn(cfg.avatarBg, 'text-white shadow-sm hover:opacity-90')
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          <Sparkles className="w-3 h-3 inline mr-1" />
          Míster EOS · Asistente del Pastor Diego Martínez · Escuela Cristiana E-OS
        </p>
      </div>
    </div>
  )
}
