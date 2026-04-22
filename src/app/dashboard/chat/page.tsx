'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import {
  Send, Search, Plus, X, MessageSquare, ChevronLeft,
  Users, UserCircle2, Hash, MessageCircle, Check,
  Pencil, Trash2, CheckSquare, Square, ArrowLeft,
  Paperclip, FileText, Download, Image as ImageIcon, ZoomIn
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string
  role: string
  avatar_url?: string | null
}

interface Conversation {
  id: string
  type: 'direct' | 'group' | 'classroom'
  name: string | null
  section_id: string | null
  updated_at: string
  other_user?: Profile
  unread?: number
  last_message?: string
}

interface DirectMessage {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  updated_at?: string
  is_edited?: boolean
  sender?: Profile
  attachment_url?: string | null
  attachment_type?: 'image' | 'document' | null
  attachment_name?: string | null
  attachment_size?: number | null
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  master: 'Director',
  direccion: 'Dirección',
  docente: 'Docente',
  alumno: 'Estudiante',
  padre: 'Padre/Madre',
  administracion: 'Administración',
  contabilidad: 'Contabilidad',
}

const ROLE_COLORS: Record<string, string> = {
  master: 'bg-red-500',
  direccion: 'bg-blue-600',
  docente: 'bg-violet-600',
  alumno: 'bg-emerald-500',
  padre: 'bg-amber-500',
  administracion: 'bg-slate-500',
  contabilidad: 'bg-teal-600',
}

const ROLE_BADGE: Record<string, string> = {
  master: 'bg-red-100 text-red-700',
  direccion: 'bg-blue-100 text-blue-700',
  docente: 'bg-violet-100 text-violet-700',
  alumno: 'bg-emerald-100 text-emerald-700',
  padre: 'bg-amber-100 text-amber-700',
  administracion: 'bg-slate-100 text-slate-600',
  contabilidad: 'bg-teal-100 text-teal-700',
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'ahora'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit' })
}

function groupMessagesByDate(messages: DirectMessage[]) {
  const groups: { date: string; messages: DirectMessage[] }[] = []
  let currentDate = ''
  for (const msg of messages) {
    const d = new Date(msg.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let label: string
    if (d.toDateString() === today.toDateString()) label = 'Hoy'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Ayer'
    else label = d.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })
    if (label !== currentDate) {
      currentDate = label
      groups.push({ date: label, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }
  return groups
}

function Avatar({ profile, size = 'md' }: { profile?: Profile | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses: Record<string, string> = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }
  const colorClass = profile ? (ROLE_COLORS[profile.role] ?? 'bg-slate-500') : 'bg-slate-300'
  return (
    <div className={`${sizeClasses[size]} ${colorClass} rounded-full flex items-center justify-center shrink-0 font-bold text-white shadow-sm`}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
        : <span>{profile ? getInitials(profile.full_name) : '?'}</span>
      }
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ChatPage() {
  const { profile: me, role } = useAuth()
  const router = useRouter()
  const db = supabase as any

  // Tab: 'direct' | 'groups'
  const [activeTab, setActiveTab] = useState<'direct' | 'groups'>('direct')

  // Direct conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)

  // Group conversations
  const [groupConvs, setGroupConvs] = useState<Conversation[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)

  // Active conversation & messages
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  // New direct chat modal
  const [showNewChat, setShowNewChat] = useState(false)
  const [searchUsers, setSearchUsers] = useState('')
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // New group modal
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [searchGroupUsers, setSearchGroupUsers] = useState('')
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<Profile[]>([])
  const [loadingAllUsers, setLoadingAllUsers] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tappedMsg,   setTappedMsg]   = useState<string | null>(null)

  // Message actions
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[], label: string } | null>(null)

  // Assigned teachers for padre
  const [assignedTeacherGroups, setAssignedTeacherGroups] = useState<{ groupName: string; users: Profile[] }[]>([])

  // Adjuntos
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string; type: 'image' | 'document' } | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef      = useRef<HTMLInputElement>(null)

  // ── Load direct conversations ────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!me) return
    setLoadingConvs(true)

    const { data: myConvs } = await db
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', me.id)

    if (!myConvs || myConvs.length === 0) {
      setConversations([])
      setLoadingConvs(false)
      return
    }

    const convIds = myConvs.map((c: any) => c.conversation_id)
    const { data: convData } = await db
      .from('conversations')
      .select('id, type, name, section_id, updated_at')
      .in('id', convIds)
      .eq('is_active', true)
      .eq('type', 'direct')
      .order('updated_at', { ascending: false })

    if (!convData) { setLoadingConvs(false); return }

    const enriched: Conversation[] = await Promise.all(
      convData.map(async (conv: any) => {
        let otherUser: Profile | undefined

        const { data: parts } = await db
          .from('conversation_participants')
          .select('user_id, profiles(id, full_name, role, avatar_url)')
          .eq('conversation_id', conv.id)
          .neq('user_id', me.id)
          .limit(1)
        if (parts && parts[0]) {
          const p = parts[0] as any
          otherUser = p.profiles
        }

        const { data: lastMsg } = await db
          .from('direct_messages')
          .select('body')
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)

        const lastMessage = lastMsg?.[0]?.body
          ? (lastMsg[0].body.length > 45 ? lastMsg[0].body.slice(0, 45) + '…' : lastMsg[0].body)
          : ''

        const myParticipant = myConvs.find((c: any) => c.conversation_id === conv.id)
        const { count: unread } = await db
          .from('direct_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .neq('sender_id', me.id)
          .gt('created_at', myParticipant?.last_read_at ?? '1970-01-01')

        return {
          ...conv,
          other_user: otherUser,
          last_message: lastMessage,
          unread: unread ?? 0,
          name: conv.name ?? (otherUser?.full_name ?? 'Conversación'),
        } as Conversation
      })
    )

    setConversations(enriched)
    setLoadingConvs(false)
  }, [me])

  // ── Load group conversations ─────────────────────────────────────────────
  const loadGroupConversations = useCallback(async () => {
    if (!me) return
    setLoadingGroups(true)

    const { data: myConvs } = await db
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', me.id)

    if (!myConvs || myConvs.length === 0) {
      setGroupConvs([])
      setLoadingGroups(false)
      return
    }

    const convIds = myConvs.map((c: any) => c.conversation_id)
    const { data: convData } = await db
      .from('conversations')
      .select('id, type, name, section_id, updated_at')
      .in('id', convIds)
      .eq('is_active', true)
      .in('type', ['group', 'classroom'])
      .order('updated_at', { ascending: false })

    if (!convData) { setLoadingGroups(false); return }

    const enriched: Conversation[] = await Promise.all(
      convData.map(async (conv: any) => {
        const { data: lastMsg } = await db
          .from('direct_messages')
          .select('body')
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)

        const lastMessage = lastMsg?.[0]?.body
          ? (lastMsg[0].body.length > 45 ? lastMsg[0].body.slice(0, 45) + '…' : lastMsg[0].body)
          : ''

        const myParticipant = myConvs.find((c: any) => c.conversation_id === conv.id)
        const { count: unread } = await db
          .from('direct_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .neq('sender_id', me.id)
          .gt('created_at', myParticipant?.last_read_at ?? '1970-01-01')

        return {
          ...conv,
          last_message: lastMessage,
          unread: unread ?? 0,
        } as Conversation
      })
    )

    setGroupConvs(enriched)
    setLoadingGroups(false)
  }, [me])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { loadGroupConversations() }, [loadGroupConversations])

  // ── Load messages for active conversation ────────────────────────────────
  useEffect(() => {
    if (!activeConv || !me) return
    setLoadingMsgs(true)
    setMessages([])

    db.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', activeConv.id)
      .eq('user_id', me.id)
      .then(() => {})

    db
      .from('direct_messages')
      .select('id, conversation_id, sender_id, body, created_at, is_edited, attachment_url, attachment_type, attachment_name, attachment_size, sender:profiles(id, full_name, role, avatar_url)')
      .eq('conversation_id', activeConv.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }: { data: DirectMessage[] | null }) => {
        setMessages(data ?? [])
        setLoadingMsgs(false)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })

    const channel = db
      .channel(`dm:${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async (payload: any) => {
        const newMsg = payload.new as DirectMessage
        const { data: senderData } = await db
          .from('profiles').select('id, full_name, role, avatar_url')
          .eq('id', newMsg.sender_id).single()
        setMessages(prev => [...prev, { ...newMsg, sender: senderData ?? undefined }])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        db.from('conversation_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', activeConv.id).eq('user_id', me.id).then(() => {})
      })
      .subscribe()

    return () => { db.removeChannel(channel) }
  }, [activeConv, me])

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : ''
    setAttachment({ file, previewUrl, type: isImage ? 'image' : 'document' })
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const removeAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    setAttachment(null)
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!body.trim() && !attachment) return
    if (!activeConv || !me) return
    setSending(true)

    let attachData: Partial<DirectMessage> = {}

    if (attachment) {
      setUploadingFile(true)
      const ext = attachment.file.name.split('.').pop() ?? 'bin'
      const path = `${activeConv.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, attachment.file, { contentType: attachment.file.type })
      setUploadingFile(false)
      if (upErr) { toast.error('Error al subir el archivo'); setSending(false); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)
      attachData = {
        attachment_url:  publicUrl,
        attachment_type: attachment.type,
        attachment_name: attachment.file.name,
        attachment_size: attachment.file.size,
      }
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      setAttachment(null)
    }

    const msgBody = body.trim()
    const { data: newMsg, error } = await db
      .from('direct_messages')
      .insert({ conversation_id: activeConv.id, sender_id: me.id, body: msgBody || '', ...attachData })
      .select('id, conversation_id, sender_id, body, created_at, attachment_url, attachment_type, attachment_name, attachment_size')
      .single()
    setSending(false)
    if (error) { toast.error('Error al enviar'); return }
    if (newMsg) {
      setMessages(prev => [...prev, { ...newMsg, sender: me as unknown as Profile } as DirectMessage])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setBody('')
    inputRef.current?.focus()
    if (activeConv.type === 'direct') loadConversations()
    else loadGroupConversations()
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Load users for new direct chat ───────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!me) return
    setLoadingUsers(true)
    let usersFromRoles: Profile[] = []
    let extraUsers: Profile[] = []

    // Roles permitidos según el rol del usuario actual
    let allowedRoles: string[] = []
    if (role === 'alumno') {
      allowedRoles = ['docente', 'direccion']
    } else if (role === 'padre') {
      allowedRoles = ['docente', 'direccion', 'administracion']
    } else if (role === 'docente') {
      allowedRoles = ['alumno', 'padre', 'docente', 'direccion', 'administracion', 'master']
    } else {
      allowedRoles = ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad']
    }

    if (allowedRoles.length > 0) {
      const { data } = await db
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .in('role', allowedRoles)
        .eq('is_active', true)
        .neq('id', me.id)
        .order('role').order('full_name')
      usersFromRoles = data ?? []
    }

    // ── Fix: alumno puede chatear con su padre ───────────────────────────
    if (role === 'alumno') {
      const { data: studentData } = await db
        .from('students')
        .select('parent_id')
        .eq('user_id', me.id)
        .single()
      if (studentData?.parent_id) {
        const { data: parentProfile } = await db
          .from('profiles')
          .select('id, full_name, role, avatar_url')
          .eq('id', studentData.parent_id)
          .eq('is_active', true)
          .single()
        if (parentProfile) extraUsers.push(parentProfile)
      }
    }

    // ── Padre: puede chatear con su(s) hijo(s) vinculado(s) ──
    if (role === 'padre') {
      const { data: childrenData } = await db
        .from('students')
        .select('id, user_id')
        .eq('parent_id', me.id)
        .eq('is_active', true)

      if (childrenData && childrenData.length > 0) {
        const childUserIds = childrenData.map((c: any) => c.user_id).filter(Boolean)
        if (childUserIds.length > 0) {
          const { data: childProfiles } = await db
            .from('profiles').select('id, full_name, role, avatar_url')
            .in('id', childUserIds).eq('is_active', true)
          extraUsers = [...extraUsers, ...(childProfiles ?? [])]
        }
      }
      setAssignedTeacherGroups([])
    } else {
      setAssignedTeacherGroups([])
    }

    // Combinar y deduplicar por ID
    const allFound = [...usersFromRoles, ...extraUsers]
    const deduped = allFound.filter((u, idx, self) => self.findIndex(x => x.id === u.id) === idx)
    setAvailableUsers(deduped)
    setLoadingUsers(false)
  }, [me, role])

  useEffect(() => { if (showNewChat) loadUsers() }, [showNewChat, loadUsers])

  // ── Start direct message ─────────────────────────────────────────────────
  const startDM = async (otherUser: Profile) => {
    if (!me) return

    const existing = conversations.find(c => c.type === 'direct' && c.other_user?.id === otherUser.id)
    if (existing) {
      setActiveConv(existing)
      setShowNewChat(false)
      setSidebarOpen(false)
      setActiveTab('direct')
      return
    }

    try {
      // Usar la función RPC SECURITY DEFINER para evitar problemas de RLS
      // (el SELECT tras INSERT falla si aún no eres participante)
      const { data: convId, error: rpcErr } = await db
        .rpc('get_or_create_direct_conversation', { other_user_id: otherUser.id })

      if (rpcErr || !convId) {
        toast.error('No se pudo iniciar la conversación')
        return
      }

      const { data: convData } = await db
        .from('conversations')
        .select('id, type, name, section_id, updated_at')
        .eq('id', convId)
        .single()

      setShowNewChat(false)
      setSidebarOpen(false)
      setActiveTab('direct')

      const newConvObj: Conversation = {
        ...(convData ?? { id: convId, type: 'direct', name: null, section_id: null, updated_at: new Date().toISOString() }),
        other_user: otherUser,
        unread: 0,
        last_message: '',
        name: otherUser.full_name,
      }
      setConversations(prev => {
        const exists = prev.find(c => c.id === convId)
        return exists ? prev : [newConvObj, ...prev]
      })
      setActiveConv(newConvObj)
      toast.success(`Chat con ${otherUser.full_name} iniciado`)
    } catch {
      toast.error('No se pudo iniciar la conversación')
    }
  }

  // ── Load all users for group creation ────────────────────────────────────
  const loadAllUsers = useCallback(async () => {
    if (!me) return
    setLoadingAllUsers(true)
    let allowedRoles: string[] = []
    if (role === 'docente') {
      allowedRoles = ['alumno', 'padre', 'docente', 'direccion']
    } else {
      allowedRoles = ['master', 'direccion', 'administracion', 'docente', 'alumno', 'padre', 'contabilidad']
    }
    const { data } = await db
      .from('profiles')
      .select('id, full_name, role, avatar_url')
      .in('role', allowedRoles)
      .eq('is_active', true)
      .neq('id', me.id)
      .order('role').order('full_name')
    setAllUsers(data ?? [])
    setLoadingAllUsers(false)
  }, [me, role])

  useEffect(() => {
    if (showNewGroup) { loadAllUsers(); setSelectedGroupUsers([]); setGroupName('') }
  }, [showNewGroup, loadAllUsers])

  // ── Create group chat ────────────────────────────────────────────────────
  const createGroup = async () => {
    if (!me || !groupName.trim() || selectedGroupUsers.length === 0) return
    setCreatingGroup(true)
    try {
      const { data: newConv, error } = await db
        .from('conversations')
        .insert({ type: 'group', name: groupName.trim(), created_by: me.id })
        .select()
        .single()

      if (error || !newConv) { toast.error('Error al crear el grupo'); return }

      const participants = [
        { conversation_id: newConv.id, user_id: me.id },
        ...selectedGroupUsers.map(u => ({ conversation_id: newConv.id, user_id: u.id })),
      ]
      await db.from('conversation_participants').insert(participants)

      const newGroup: Conversation = {
        ...newConv,
        unread: 0,
        last_message: '',
      }
      setGroupConvs(prev => [newGroup, ...prev])
      setActiveConv(newGroup)
      setShowNewGroup(false)
      setSidebarOpen(false)
      setActiveTab('groups')
      toast.success(`Canal "${groupName.trim()}" creado`)
    } catch {
      toast.error('Error al crear el grupo')
    } finally {
      setCreatingGroup(false)
    }
  }

  // ── Message actions ───────────────────────────────────────────────────────
  // Solo el super admin (master) puede eliminar mensajes
  const canDeleteMsg = (_msg: DirectMessage) => role === 'master'

  const deleteMessage = (id: string) => {
    setPendingDelete({ ids: [id], label: '¿Eliminar este mensaje? Esta acción no se puede deshacer.' })
  }

  const deleteSelected = () => {
    const ids = Array.from(selectedMsgs)
    setPendingDelete({ ids, label: `¿Eliminar ${ids.length} mensaje(s) seleccionado(s)? Esta acción no se puede deshacer.` })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    await db.from('direct_messages').update({ is_deleted: true }).in('id', pendingDelete.ids)
    setMessages(prev => prev.filter(m => !pendingDelete.ids.includes(m.id)))
    setSelectedMsgs(prev => { const s = new Set(prev); pendingDelete.ids.forEach(id => s.delete(id)); return s })
    if (pendingDelete.ids.length > 1) { setSelectionMode(false); toast.success(`${pendingDelete.ids.length} mensajes eliminados`) }
    setPendingDelete(null)
  }

  const startEdit = (msg: DirectMessage) => {
    setEditingMsgId(msg.id)
    setEditBody(msg.body)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const saveEdit = async (id: string) => {
    if (!editBody.trim()) return
    await db.from('direct_messages')
      .update({ body: editBody.trim(), is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, body: editBody.trim(), is_edited: true } : m))
    setEditingMsgId(null)
  }

  const cancelEdit = () => { setEditingMsgId(null); setEditBody('') }

  const toggleSelect = (id: string) => {
    setSelectedMsgs(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedMsgs(new Set()) }

  // ── Computed helpers ─────────────────────────────────────────────────────
  const filteredUsers = availableUsers.filter(u =>
    u.full_name.toLowerCase().includes(searchUsers.toLowerCase()) ||
    ROLE_LABELS[u.role]?.toLowerCase().includes(searchUsers.toLowerCase())
  )

  const groupedUsers = filteredUsers.reduce((acc, u) => {
    const label = ROLE_LABELS[u.role] ?? u.role
    if (!acc[label]) acc[label] = []
    acc[label].push(u)
    return acc
  }, {} as Record<string, Profile[]>)

  const filteredGroupUsers = allUsers.filter(u =>
    u.full_name.toLowerCase().includes(searchGroupUsers.toLowerCase()) ||
    ROLE_LABELS[u.role]?.toLowerCase().includes(searchGroupUsers.toLowerCase())
  )
  const groupedGroupUsers = filteredGroupUsers.reduce((acc, u) => {
    const label = ROLE_LABELS[u.role] ?? u.role
    if (!acc[label]) acc[label] = []
    acc[label].push(u)
    return acc
  }, {} as Record<string, Profile[]>)

  function convDisplayName(conv: Conversation) {
    if (conv.type === 'direct') return conv.other_user?.full_name ?? 'Conversación'
    return conv.name ?? 'Grupo'
  }

  const canCreateGroup = ['master', 'direccion', 'administracion', 'docente'].includes(role ?? '')
  const messageGroups = groupMessagesByDate(messages)
  const activeList = activeTab === 'direct' ? conversations : groupConvs
  const isLoading = activeTab === 'direct' ? loadingConvs : loadingGroups

  // Total unread across all tabs for badge
  const totalDirectUnread = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0)
  const totalGroupUnread = groupConvs.reduce((sum, c) => sum + (c.unread ?? 0), 0)

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 bg-slate-50 overflow-hidden">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'flex' : 'hidden lg:flex'} w-full lg:w-80 xl:w-96 flex-col bg-white border-r border-slate-100 shrink-0`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-100">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900">Mensajes</h1>
              <p className="text-xs text-slate-400">{ROLE_LABELS[role ?? ''] ?? role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canCreateGroup && (
              <button
                onClick={() => setShowNewGroup(true)}
                title="Crear grupo"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowNewChat(true)}
              title="Nuevo chat directo"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-700 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2 pt-1">
          <button
            onClick={() => setActiveTab('direct')}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors rounded-t-lg ${activeTab === 'direct' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chats
            {totalDirectUnread > 0 && (
              <span className="w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalDirectUnread > 9 ? '9+' : totalDirectUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors rounded-t-lg ${activeTab === 'groups' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Hash className="w-3.5 h-3.5" />
            Grupos
            {totalGroupUnread > 0 && (
              <span className="w-4 h-4 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalGroupUnread > 9 ? '9+' : totalGroupUnread}
              </span>
            )}
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            </div>
          ) : activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 h-48 px-6 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                {activeTab === 'direct'
                  ? <MessageSquare className="w-6 h-6 text-slate-400" />
                  : <Hash className="w-6 h-6 text-slate-400" />
                }
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {activeTab === 'direct' ? 'Sin conversaciones' : 'Sin grupos'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {activeTab === 'direct'
                    ? 'Toca el + para iniciar un chat'
                    : canCreateGroup ? 'Crea un canal con el ícono de grupos' : 'Aún no estás en ningún grupo'
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {activeList.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => { setActiveConv(conv); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${activeConv?.id === conv.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-800'}`}
                >
                  {conv.type === 'direct' ? (
                    <Avatar profile={conv.other_user} size="md" />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${conv.type === 'classroom' ? 'bg-violet-600' : 'bg-slate-700'}`}>
                      {conv.type === 'classroom'
                        ? <Hash className="w-4 h-4 text-white" />
                        : <Users className="w-4 h-4 text-white" />
                      }
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{convDisplayName(conv)}</span>
                      <span className={`text-[10px] shrink-0 ${activeConv?.id === conv.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {timeAgo(conv.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {conv.type === 'direct' && conv.other_user && (
                        <span className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-md ${activeConv?.id === conv.id ? 'text-slate-300' : (ROLE_BADGE[conv.other_user.role] ?? 'bg-slate-100 text-slate-600')}`}>
                          {ROLE_LABELS[conv.other_user.role]}
                        </span>
                      )}
                      {conv.type !== 'direct' && (
                        <span className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-md ${activeConv?.id === conv.id ? 'text-slate-300' : conv.type === 'classroom' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                          {conv.type === 'classroom' ? 'Canal de aula' : 'Grupo'}
                        </span>
                      )}
                      <span className={`text-xs truncate ${activeConv?.id === conv.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {conv.last_message || 'Sin mensajes'}
                      </span>
                      {(conv.unread ?? 0) > 0 && activeConv?.id !== conv.id && (
                        <span className={`shrink-0 w-5 h-5 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${conv.type === 'classroom' || conv.type === 'group' ? 'bg-violet-500' : 'bg-emerald-500'}`}>
                          {conv.unread! > 9 ? '9+' : conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current user footer */}
        {me && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50">
            <Avatar profile={me as unknown as Profile} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{me.full_name}</p>
              <p className="text-[10px] text-slate-400">{ROLE_LABELS[role ?? ''] ?? role}</p>
            </div>
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          </div>
        )}
      </aside>

      {/* ── MAIN CHAT AREA ───────────────────────────────────────────────── */}
      <main className={`${!sidebarOpen || activeConv ? 'flex' : 'hidden lg:flex'} flex-1 flex flex-col min-w-0`}>
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 lg:px-6 py-3.5 bg-white border-b border-slate-100 shrink-0">
              {selectionMode ? (
                <>
                  <button onClick={exitSelectionMode} className="p-1.5 rounded-lg hover:bg-slate-100">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                  <span className="flex-1 text-sm font-semibold text-slate-700">
                    {selectedMsgs.size} seleccionado(s)
                  </span>
                  {selectedMsgs.size > 0 && (
                    <button
                      onClick={deleteSelected}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar ({selectedMsgs.size})
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 mr-1" onClick={() => setSidebarOpen(true)}>
                    <ChevronLeft className="w-5 h-5 text-slate-500" />
                  </button>
                  {activeConv.type === 'direct' ? (
                    <Avatar profile={activeConv.other_user} size="md" />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeConv.type === 'classroom' ? 'bg-violet-600' : 'bg-slate-800'}`}>
                      {activeConv.type === 'classroom' ? <Hash className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{convDisplayName(activeConv)}</p>
                    {activeConv.type === 'direct' && activeConv.other_user && (
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${ROLE_BADGE[activeConv.other_user.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {ROLE_LABELS[activeConv.other_user.role]}
                      </span>
                    )}
                    {activeConv.type === 'classroom' && <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 bg-violet-100 text-violet-700">Canal de aula</span>}
                    {activeConv.type === 'group' && <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 bg-slate-100 text-slate-600">Grupo</span>}
                  </div>
                  {messages.length > 0 && (
                    <button
                      onClick={() => setSelectionMode(true)}
                      title="Seleccionar mensajes"
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-6" onClick={() => setTappedMsg(null)}>
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600">Inicia la conversación</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeConv.type === 'direct'
                        ? `Di hola a ${convDisplayName(activeConv)} 👋`
                        : `Sé el primero en escribir en ${convDisplayName(activeConv)} 👋`
                      }
                    </p>
                  </div>
                </div>
              ) : (
                messageGroups.map(group => (
                  <div key={group.date}>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-xs text-slate-400 font-medium px-2">{group.date}</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    <div className="space-y-3">
                      {group.messages.map((msg, i) => {
                        const isOwn = msg.sender_id === me?.id
                        const showInfo = activeConv.type !== 'direct'
                          ? !isOwn
                          : (i === 0 || group.messages[i - 1].sender_id !== msg.sender_id)
                        const isSelected = selectedMsgs.has(msg.id)
                        const isEditing = editingMsgId === msg.id
                        const isHovered = hoveredMsg === msg.id

                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-2.5 items-start transition-colors rounded-xl px-1 ${isOwn ? 'flex-row-reverse' : ''} ${isSelected ? 'bg-slate-100' : ''}`}
                            onMouseEnter={() => !selectionMode && setHoveredMsg(msg.id)}
                            onMouseLeave={() => setHoveredMsg(null)}
                            onClick={() => selectionMode && canDeleteMsg(msg) && toggleSelect(msg.id)}
                          >
                            {/* Checkbox de selección */}
                            {selectionMode && canDeleteMsg(msg) && (
                              <div className={`shrink-0 flex items-center self-center ${isOwn ? 'order-last ml-1' : 'mr-1'}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                              </div>
                            )}

                            {/* Avatar */}
                            {(activeConv.type !== 'direct' ? !isOwn : showInfo) ? (
                              <Avatar profile={isOwn ? me as unknown as Profile : (msg.sender ?? null)} size="sm" />
                            ) : (
                              <div className="w-8 shrink-0" />
                            )}

                            {/* Bubble + actions */}
                            <div className={`max-w-[85%] lg:max-w-[72%] flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                              {showInfo && !isOwn && (
                                <div className="flex items-center gap-1.5 px-1">
                                  <span className="text-[11px] font-semibold text-slate-500">{msg.sender?.full_name ?? 'Usuario'}</span>
                                  {activeConv.type !== 'direct' && msg.sender?.role === 'docente' && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Docente</span>
                                  )}
                                  {activeConv.type !== 'direct' && (msg.sender?.role === 'master' || msg.sender?.role === 'direccion') && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Dirección</span>
                                  )}
                                </div>
                              )}

                              {/* Inline edit mode */}
                              {isEditing ? (
                                <div className="flex flex-col gap-2 w-full min-w-[200px]">
                                  <textarea
                                    ref={editInputRef}
                                    value={editBody}
                                    onChange={e => setEditBody(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id) }
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                    className="w-full px-3 py-2 text-sm bg-white border-2 border-slate-900 rounded-xl outline-none resize-none leading-relaxed"
                                    rows={2}
                                  />
                                  <div className="flex gap-1.5 justify-end">
                                    <button onClick={cancelEdit} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">Cancelar</button>
                                    <button onClick={() => saveEdit(msg.id)} className="px-2.5 py-1 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-700">Guardar</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative group/bubble">
                                  <div
                                    className={`text-sm leading-relaxed shadow-sm overflow-hidden ${isOwn ? 'bg-slate-900 text-white rounded-2xl rounded-tr-sm' : 'bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-100'} ${msg.attachment_url ? 'p-0' : 'px-4 py-2.5'}`}
                                    onClick={() => !selectionMode && (isOwn || canDeleteMsg(msg)) && setTappedMsg(prev => prev === msg.id ? null : msg.id)}
                                  >
                                    {/* Imagen adjunta */}
                                    {msg.attachment_url && msg.attachment_type === 'image' && (
                                      <div className="relative cursor-pointer" onClick={e => { e.stopPropagation(); setLightboxUrl(msg.attachment_url!) }}>
                                        <img
                                          src={msg.attachment_url}
                                          alt={msg.attachment_name ?? 'imagen'}
                                          className="max-w-[240px] w-full rounded-2xl object-cover block"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20 rounded-2xl">
                                          <ZoomIn className="w-6 h-6 text-white" />
                                        </div>
                                      </div>
                                    )}
                                    {/* Documento adjunto */}
                                    {msg.attachment_url && msg.attachment_type === 'document' && (
                                      <a
                                        href={msg.attachment_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={msg.attachment_name ?? true}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl hover:opacity-80 transition-opacity ${isOwn ? 'bg-white/10' : 'bg-slate-50'}`}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-blue-100'}`}>
                                          <FileText className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-blue-600'}`} />
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold truncate max-w-[160px]">{msg.attachment_name ?? 'Documento'}</p>
                                          <p className="text-[10px] opacity-60">{formatBytes(msg.attachment_size)}</p>
                                        </div>
                                        <Download className="w-4 h-4 shrink-0 opacity-60" />
                                      </a>
                                    )}
                                    {/* Texto del mensaje */}
                                    {msg.body && (
                                      <p className={`${msg.attachment_url ? 'px-4 py-2 text-sm' : ''}`}>{msg.body}</p>
                                    )}
                                  </div>

                                  {/* Action buttons: al lado en desktop (hover), abajo en móvil (tap) */}
                                  {(isHovered || tappedMsg === msg.id) && !selectionMode && (
                                    <>
                                      {/* Desktop: absolute al lado del bubble */}
                                      <div className={`hidden lg:flex absolute top-0 items-center gap-0.5 ${isOwn ? 'right-full mr-2' : 'left-full ml-2'}`}>
                                        {isOwn && (
                                          <button onClick={() => { startEdit(msg); setTappedMsg(null) }}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow border border-slate-100 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors" title="Editar">
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {canDeleteMsg(msg) && (
                                          <button onClick={() => { deleteMessage(msg.id); setTappedMsg(null) }}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow border border-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors" title="Eliminar">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {canDeleteMsg(msg) && (
                                          <button onClick={() => { setSelectionMode(true); toggleSelect(msg.id); setTappedMsg(null) }}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow border border-slate-100 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors" title="Seleccionar">
                                            <Square className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      {/* Móvil: botones inline debajo del bubble */}
                                      <div className={`lg:hidden flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                        {isOwn && (
                                          <button onClick={() => { startEdit(msg); setTappedMsg(null) }}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white shadow border border-slate-100 text-slate-500 text-xs">
                                            <Pencil className="w-3 h-3" /> Editar
                                          </button>
                                        )}
                                        {canDeleteMsg(msg) && (
                                          <button onClick={() => { deleteMessage(msg.id); setTappedMsg(null) }}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white shadow border border-slate-100 text-red-500 text-xs">
                                            <Trash2 className="w-3 h-3" /> Borrar
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 px-1">
                                <span className="text-[10px] text-slate-400">
                                  {new Date(msg.created_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {msg.is_edited && <span className="text-[10px] text-slate-400 italic">editado</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Message input */}
            <div className="bg-white border-t border-slate-100 px-4 lg:px-6 py-3">

              {/* Preview del adjunto seleccionado */}
              {attachment && (
                <div className="mb-2 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  {attachment.type === 'image' ? (
                    <img src={attachment.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{attachment.file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatBytes(attachment.file.size)}</p>
                  </div>
                  <button onClick={removeAttachment} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2 bg-slate-50 rounded-2xl px-3 py-3 border border-slate-200 focus-within:border-slate-400 transition-colors">
                {/* Botón adjuntar */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={sending}
                  title="Adjuntar imagen o documento"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                  onChange={handleFileSelect}
                />
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={attachment ? 'Añade un mensaje opcional…' : (activeConv.type === 'direct' ? 'Escribe un mensaje…' : `Escribe en ${convDisplayName(activeConv)}…`)}
                  rows={1}
                  disabled={sending}
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 resize-none outline-none max-h-32 leading-relaxed"
                  style={{ minHeight: '22px' }}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!body.trim() && !attachment) || sending || uploadingFile}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${(body.trim() || attachment) && !sending && !uploadingFile ? 'bg-slate-900 text-white hover:bg-slate-700 shadow-sm' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  {sending || uploadingFile
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </div>
              <p className="text-[10px] text-slate-300 mt-1.5 pl-1">Enter para enviar · Shift+Enter nueva línea · 📎 Adjuntar imagen o documento</p>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center">
              <MessageSquare className="w-9 h-9 text-slate-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-700">Red de comunicación interna</h2>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Selecciona una conversación o inicia un chat nuevo con un docente, estudiante o padre de familia.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveTab('direct'); setShowNewChat(true) }}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nuevo chat
              </button>
              {canCreateGroup && (
                <button
                  onClick={() => { setActiveTab('groups'); setShowNewGroup(true) }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Crear grupo
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL: Nueva conversación directa ───────────────────────────── */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Nueva conversación</h3>
                <p className="text-xs text-slate-400 mt-0.5">Elige con quién quieres hablar</p>
              </div>
              <button onClick={() => { setShowNewChat(false); setSearchUsers('') }} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-slate-50">
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  value={searchUsers}
                  onChange={e => setSearchUsers(e.target.value)}
                  placeholder="Buscar por nombre o rol…"
                  className="flex-1 bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {loadingUsers ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : Object.keys(groupedUsers).length === 0 && assignedTeacherGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 h-24 text-slate-400">
                  <UserCircle2 className="w-8 h-8" />
                  <p className="text-sm">No se encontraron usuarios</p>
                </div>
              ) : (
                <>
                  {/* Docentes asignados — siempre primeros y destacados */}
                  {assignedTeacherGroups.map(group => (
                    <div key={group.groupName}>
                      <div className="flex items-center gap-2 px-4 py-2 bg-violet-50">
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">{group.groupName}</span>
                        <div className="flex-1 h-px bg-violet-200" />
                        <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-semibold">Fijado</span>
                      </div>
                      {group.users.map((user: Profile) => (
                        <button key={user.id} onClick={() => startDM(user)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors text-left border-l-2 border-violet-300">
                          <Avatar profile={user} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{user.full_name}</p>
                            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">Docente asignado</span>
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-violet-500">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                  {/* Lista general */}
                  {Object.entries(groupedUsers).map(([groupLabel, users]) => (
                    <div key={groupLabel}>
                      <div className="flex items-center gap-2 px-4 py-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{groupLabel}s</span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                      {users.map((user: Profile) => (
                        <button key={user.id} onClick={() => startDM(user)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
                          <Avatar profile={user} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{user.full_name}</p>
                            <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md ${ROLE_BADGE[user.role] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ROLE_LABELS[user.role]}
                            </span>
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Crear grupo ───────────────────────────────────────────── */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Crear canal o grupo</h3>
                <p className="text-xs text-slate-400 mt-0.5">Para anuncios o comunicados de grado</p>
              </div>
              <button onClick={() => setShowNewGroup(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Group name input */}
            <div className="px-5 py-4 border-b border-slate-50">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Nombre del canal</label>
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder='Ej: "1° Básico A — Anuncios"'
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400 text-slate-800 placeholder:text-slate-400"
                autoFocus
              />
            </div>

            {/* Selected members */}
            {selectedGroupUsers.length > 0 && (
              <div className="px-5 py-3 border-b border-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{selectedGroupUsers.length} participante(s)</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroupUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-1">
                      <span className="text-xs font-medium text-slate-700 max-w-[100px] truncate">{u.full_name}</span>
                      <button onClick={() => setSelectedGroupUsers(prev => prev.filter(x => x.id !== u.id))} className="text-slate-400 hover:text-slate-600 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search users */}
            <div className="px-4 py-3 border-b border-slate-50">
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  value={searchGroupUsers}
                  onChange={e => setSearchGroupUsers(e.target.value)}
                  placeholder="Agregar participantes…"
                  className="flex-1 bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* User list for selection */}
            <div className="flex-1 overflow-y-auto py-2">
              {loadingAllUsers ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : (
                Object.entries(groupedGroupUsers).map(([groupLabel, users]) => (
                  <div key={groupLabel}>
                    <div className="flex items-center gap-2 px-4 py-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{groupLabel}s</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    {users.map((user: Profile) => {
                      const isSelected = selectedGroupUsers.some(u => u.id === user.id)
                      return (
                        <button
                          key={user.id}
                          onClick={() => setSelectedGroupUsers(prev =>
                            isSelected ? prev.filter(u => u.id !== user.id) : [...prev, user]
                          )}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        >
                          <Avatar profile={user} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{user.full_name}</p>
                            <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md ${ROLE_BADGE[user.role] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ROLE_LABELS[user.role]}
                            </span>
                          </div>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${isSelected ? 'bg-slate-900 border-slate-900' : 'border-slate-200'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Create button */}
            <div className="px-5 py-4 border-t border-slate-100">
              <button
                onClick={createGroup}
                disabled={!groupName.trim() || selectedGroupUsers.length === 0 || creatingGroup}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${groupName.trim() && selectedGroupUsers.length > 0 && !creatingGroup ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                {creatingGroup
                  ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creando…</span>
                  : `Crear canal ${selectedGroupUsers.length > 0 ? `(${selectedGroupUsers.length + 1} participantes)` : ''}`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirmación de eliminación ───────────────────────────── */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Eliminar mensaje{pendingDelete.ids.length > 1 ? 's' : ''}</h3>
                <p className="text-xs text-slate-500 mt-1">{pendingDelete.label}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX: ver imagen a pantalla completa ─────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Vista completa"
            className="max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
