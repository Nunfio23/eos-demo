'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { ROLE_LABELS, ROLE_COLORS, formatDate } from '@/lib/utils'
import { apiUrl } from '@/lib/api-url'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import type { Profile, UserRole } from '@/types/database'
import toast from 'react-hot-toast'
import { UserPlus, Pencil, CheckCircle, XCircle, Copy, Eye, EyeOff, KeyRound, Trash2, Printer } from 'lucide-react'
import BackButton from '@/components/ui/BackButton'

function printCredentialLetter(username: string, password: string, fullName?: string) {
  const date = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
  const origin = window.location.origin
  const logoUrl = `${origin}/eos-logo.png`
  const bgUrl   = `${origin}/eos-bg.jpeg`
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Credenciales — ${username}</title>
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #1e293b; background: #fff; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }

    /* ── OUTER WRAPPER ── */
    .sheet {
      width: 216mm; min-height: 279mm;
      position: relative; overflow: hidden;
      background: #fff;
    }

    /* ── BACKGROUND WATERMARK ── */
    .bg-wm {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      object-fit: cover; object-position: center;
      opacity: 0.06; pointer-events: none; z-index: 0;
    }

    /* ── TOP COLOR BAND ── */
    .top-band {
      position: relative; z-index: 1;
      background: linear-gradient(135deg, #1e3a5f 0%, #16294a 60%, #c0392b 100%);
      padding: 22px 32px 18px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .top-band img.logo { height: 56px; filter: brightness(0) invert(1); }
    .top-band-right { text-align: right; }
    .top-band-title {
      font-size: 15pt; font-weight: 800; color: #fff;
      letter-spacing: 1px; text-transform: uppercase; line-height: 1.1;
    }
    .top-band-sub { font-size: 8.5pt; color: rgba(255,255,255,0.75); margin-top: 4px; }

    /* ── RED ACCENT LINE ── */
    .accent-line { height: 4px; background: linear-gradient(90deg, #c0392b, #e74c3c, #1e3a5f); position: relative; z-index: 1; }

    /* ── BODY ── */
    .body { position: relative; z-index: 1; padding: 28px 36px 0; }

    .date-row { text-align: right; font-size: 9.5pt; color: #64748b; margin-bottom: 22px; }

    .salutation { font-size: 11.5pt; margin-bottom: 10px; color: #1e293b; }
    .salutation strong { color: #1e3a5f; }

    .body-text { font-size: 10.5pt; line-height: 1.75; color: #475569; margin-bottom: 22px; }

    /* ── CREDENTIAL CARD ── */
    .creds-card {
      background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
      border: 1.5px solid #1e3a5f;
      border-radius: 12px;
      padding: 0;
      margin-bottom: 22px;
      overflow: hidden;
    }
    .creds-card-header {
      background: #1e3a5f;
      padding: 10px 20px;
      display: flex; align-items: center; gap: 10px;
    }
    .creds-card-header-icon {
      width: 22px; height: 22px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11pt; color: #fff;
    }
    .creds-card-header h3 {
      font-size: 9.5pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1.5px;
      color: #fff;
    }
    .creds-card-body { padding: 18px 20px; display: flex; gap: 16px; }
    .cred-field {
      flex: 1; background: #fff;
      border: 1px solid #c7d2e8;
      border-radius: 8px; padding: 12px 16px;
    }
    .cred-field-label {
      font-size: 8pt; text-transform: uppercase;
      letter-spacing: 1px; color: #64748b; margin-bottom: 6px;
    }
    .cred-field-value {
      font-family: 'Courier New', monospace;
      font-size: 14pt; font-weight: 700;
      color: #1e3a5f; letter-spacing: 1.5px;
    }

    /* ── URL BLOCK ── */
    .url-block {
      background: #fff8f0; border: 1.5px solid #f59e0b;
      border-radius: 8px; padding: 11px 16px;
      margin-bottom: 18px;
      display: flex; align-items: center; gap: 10px;
    }
    .url-icon { font-size: 14pt; }
    .url-text { font-size: 10pt; color: #374151; }
    .url-text a { color: #c0392b; font-weight: 700; text-decoration: none; font-family: 'Courier New', monospace; }

    /* ── SECURITY NOTE ── */
    .note {
      border-left: 3px solid #c0392b;
      background: #fff5f5; padding: 10px 14px;
      border-radius: 0 6px 6px 0;
      font-size: 9.5pt; color: #64748b; line-height: 1.65;
      margin-bottom: 28px;
    }

    /* ── SIGNATURE ── */
    .signature { padding: 0 36px; }
    .sig-greeting { font-size: 10.5pt; color: #475569; margin-bottom: 18px; }
    .sig-divider { width: 80px; height: 2px; background: #c0392b; margin-bottom: 6px; }
    .sig-name { font-size: 11pt; font-weight: 700; color: #1e3a5f; }
    .sig-role { font-size: 9pt; color: #64748b; margin-top: 2px; }

    /* ── BOTTOM BAND ── */
    .bottom-band {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(135deg, #1e3a5f 0%, #16294a 70%, #c0392b 100%);
      padding: 10px 32px;
      display: flex; align-items: center; justify-content: space-between;
      z-index: 1;
    }
    .bottom-band p { font-size: 8pt; color: rgba(255,255,255,0.7); }
    .bottom-band .dot { color: rgba(255,255,255,0.4); margin: 0 6px; }
  </style>
</head>
<body>
<div class="sheet">
  <img src="${bgUrl}" alt="" class="bg-wm" />

  <!-- TOP BAND -->
  <div class="top-band">
    <img src="${logoUrl}" alt="Escuela Cristiana E-OS" class="logo" />
    <div class="top-band-right">
      <div class="top-band-title">Credenciales de Acceso</div>
      <div class="top-band-sub">Escuela Cristiana E-OS · E-OS</div>
    </div>
  </div>
  <div class="accent-line"></div>

  <!-- BODY -->
  <div class="body">
    <div class="date-row">${date}</div>

    <p class="salutation">Estimado/a <strong>${fullName ?? username}</strong>,</p>
    <p class="body-text">
      A continuación se detallan sus credenciales de acceso al sistema educativo institucional <strong>E-OS</strong>.
      Por favor, guarde esta información en un lugar seguro y no la comparta con terceros.
    </p>

    <!-- CREDENTIAL CARD -->
    <div class="creds-card">
      <div class="creds-card-header">
        <div class="creds-card-header-icon">&#9679;</div>
        <h3>Datos de acceso al sistema</h3>
      </div>
      <div class="creds-card-body">
        <div class="cred-field">
          <div class="cred-field-label">Usuario</div>
          <div class="cred-field-value">${username}</div>
        </div>
        <div class="cred-field">
          <div class="cred-field-label">Contraseña</div>
          <div class="cred-field-value">${password}</div>
        </div>
      </div>
    </div>

    <!-- URL -->
    <div class="url-block">
      <span class="url-icon">&#9654;</span>
      <span class="url-text">Ingrese al sistema en: <a>https://eos-school.app</a></span>
    </div>

    <!-- NOTE -->
    <div class="note">
      <strong>Aviso de seguridad:</strong> Se recomienda cambiar la contraseña al ingresar por primera vez.<br>
      Si tiene problemas para acceder, comuníquese con la administración del colegio.
    </div>
  </div>

  <!-- SIGNATURE -->
  <div class="signature">
    <p class="sig-greeting">Atentamente,</p>
    <div class="sig-divider"></div>
    <p class="sig-name">Administración del Sistema</p>
    <p class="sig-role">Escuela Cristiana E-OS</p>
  </div>

  <!-- BOTTOM BAND -->
  <div class="bottom-band">
    <p>Escuela Cristiana E-OS</p>
    <p>E-OS<span class="dot">·</span>eos-school.app</p>
  </div>
</div>
<script>
  window.onload = () => {
    const imgs = document.images
    if (!imgs.length) { window.print(); return }
    let n = 0
    const tryPrint = () => { if (++n >= imgs.length) window.print() }
    Array.from(imgs).forEach(img => {
      if (img.complete) tryPrint()
      else { img.onload = tryPrint; img.onerror = tryPrint }
    })
  }
</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=950')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

const ALL_ROLES: UserRole[] = [
  'master', 'direccion', 'administracion', 'docente', 'alumno',
  'padre', 'contabilidad', 'biblioteca', 'tienda', 'marketing', 'mantenimiento'
]
// Roles disponibles para crear: master y direccion pueden crear docentes
const getCreateRoles = (canAssignDocente: boolean): UserRole[] =>
  canAssignDocente ? ALL_ROLES : ALL_ROLES.filter(r => r !== 'docente')

// Muestra solo el usuario (sin @eos-school.app)
function displayEmail(email: string) {
  return email.endsWith('@eos-school.app') ? email.replace('@eos-school.app', '') : email
}

export default function UsuariosPage() {
  const { profile, session } = useAuth()
  const isMaster = profile?.role === 'master'
  const canAssignDocente = isMaster || profile?.role === 'direccion'
  const canCreateUser = isMaster || profile?.role === 'direccion'
  const createRoles = getCreateRoles(canAssignDocente)

  const handleRequestPasswordReset = async (u: Profile) => {
    try {
      const db = supabase as any
      // Buscar todos los usuarios master y dirección para notificarlos
      const { data: admins } = await db
        .from('profiles')
        .select('id')
        .in('role', ['master', 'direccion'])
        .eq('is_active', true)
      if (!admins?.length) { toast.error('No se encontró un administrador activo'); return }
      const notifs = admins.map((a: { id: string }) => ({
        user_id: a.id,
        title: 'Solicitud de restablecimiento de contraseña',
        body: `${profile?.full_name} solicita restablecer la contraseña de ${u.full_name} (${u.email}).`,
        type: 'general',
      }))
      const { error } = await db.from('notifications').insert(notifs)
      if (error) throw error
      toast.success('Solicitud enviada al Super Admin ✓')
    } catch {
      toast.error('Error al enviar la solicitud')
    }
  }
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Profile | null>(null)
  const [form, setForm] = useState({
    username: '', full_name: '', role: 'alumno' as UserRole, phone: '', password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  // Credenciales creadas — mostrar al admin tras crear/resetear usuario
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string; action?: 'create' | 'reset' } | null>(null)
  // Reset password modal
  const [resetModal, setResetModal] = useState<Profile | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  // Print letter modal
  const [printModal, setPrintModal] = useState<Profile | null>(null)
  const [printPassword, setPrintPassword] = useState('')
  const [showPrintPassword, setShowPrintPassword] = useState(false)
  const [printPasswordGenerated, setPrintPasswordGenerated] = useState(false)
  const [printResetting, setPrintResetting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadUsers().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [loadUsers])

  const openCreate = () => {
    setForm({ username: '', full_name: '', role: 'alumno', phone: '', password: '' })
    setShowPassword(false)
    setModal('create')
  }

  const openEdit = (user: Profile) => {
    setSelected(user)
    setForm({ username: displayEmail(user.email), full_name: user.full_name, role: user.role, phone: user.phone ?? '', password: '' })
    setShowPassword(false)
    setModal('edit')
  }

  const handleSave = async () => {
    if (modal === 'create') {
      if (!form.username || !form.full_name) {
        toast.error('Usuario y nombre son requeridos')
        return
      }
      if (!form.password) {
        toast.error('La contraseña es requerida')
        return
      }
      if (form.password.length < 6) {
        toast.error('La contraseña debe tener al menos 6 caracteres')
        return
      }
      if (!/^[a-z0-9._-]{3,30}$/.test(form.username)) {
        toast.error('Usuario solo puede tener letras minúsculas, números, puntos y guiones (3–30 caracteres)')
        return
      }

      setSaving(true)
      try {
        const token = session?.access_token
        const res = await fetch(apiUrl('/api/create-user'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            username:   form.username,
            full_name:  form.full_name,
            role:       form.role,
            password:   form.password,
            phone:      form.phone || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok || data?.error) {
          toast.error(data?.error || 'Error al crear usuario')
          return
        }
        setModal(null)
        setCreatedCreds({ username: form.username, password: form.password, action: 'create' })
        loadUsers()
      } catch {
        toast.error('Error de conexión')
      } finally {
        setSaving(false)
      }
    } else if (selected) {
      if (!form.full_name) {
        toast.error('El nombre es requerido')
        return
      }
      if (form.username && !/^[a-z0-9._-]{3,30}$/.test(form.username)) {
        toast.error('Usuario solo puede tener letras minúsculas, números, puntos y guiones (3–30 caracteres)')
        return
      }
      setSaving(true)
      try {
        const usernameChanged = form.username && form.username !== displayEmail(selected.email)
        const token = session?.access_token

        // Si cambió el username usamos la API admin, sino update directo
        if (usernameChanged) {
          const res = await fetch(apiUrl('/api/update-user'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userId: selected.id,
              username: form.username,
              full_name: form.full_name,
              role: form.role,
              phone: form.phone,
            }),
          })
          const data = await res.json()
          if (!res.ok || data?.error) { toast.error(data?.error || 'Error al actualizar'); return }
        } else {
          const { error } = await (supabase as any).from('profiles').update({
            full_name: form.full_name,
            role: form.role,
            phone: form.phone || null,
          }).eq('id', selected.id)
          if (error) throw error
        }

        toast.success('Usuario actualizado')
        setModal(null)
        loadUsers()
      } catch (err: unknown) {
        toast.error((err as Error).message ?? 'Error al guardar')
      } finally {
        setSaving(false)
      }
    }
  }

  // Genera una contraseña memorable: palabra en español + 3 dígitos (6–9 chars)
  const generateMemorablePassword = (): string => {
    const words = [
      'Tigre','Playa','Cielo','Nieve','Brisa','Palma','Selva','Llano',
      'Monte','Claro','Fuego','Piedra','Nubes','Velas','Arena','Prado',
      'Coral','Limon','Mango','Rocio','Sauce','Techo','Verde','Solar',
    ]
    const word = words[Math.floor(Math.random() * words.length)]
    const digits = String(Math.floor(Math.random() * 900) + 100) // 100–999
    return word + digits
  }

  const openReset = (user: Profile) => {
    setResetModal(user)
    setResetPassword('')
    setShowResetPassword(false)
  }

  const handleReset = async () => {
    if (!resetModal) return
    if (!resetPassword) { toast.error('Ingresa la nueva contraseña'); return }
    if (resetPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    setResetting(true)
    try {
      const token = session?.access_token
      const res = await fetch(apiUrl('/api/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: resetModal.id, newPassword: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) { toast.error(data?.error || 'Error al restablecer'); return }
      const username = displayEmail(resetModal.email)
      setResetModal(null)
      setCreatedCreds({ username, password: resetPassword, action: 'reset' })
    } catch {
      toast.error('Error de conexión')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async (user: Profile) => {
    if (!confirm(`¿Eliminar permanentemente a "${user.full_name}"?\n\nEsta acción NO se puede deshacer. Se borrarán todos sus datos.`)) return
    try {
      const token = session?.access_token
      const res = await fetch(apiUrl('/api/delete-user'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) { toast.error(data?.error || 'Error al eliminar'); return }
      toast.success('Usuario eliminado')
      loadUsers()
    } catch {
      toast.error('Error de conexión')
    }
  }

  const toggleActive = async (user: Profile) => {
    if (!session?.access_token) { toast.error('Sesión expirada'); return }
    const activate = !user.is_active
    try {
      const res = await fetch(apiUrl('/api/toggle-active'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id, activate }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { toast.error(data.error || `Error ${res.status}`); return }
      toast.success(activate ? 'Usuario activado' : 'Usuario desactivado')
      loadUsers()
    } catch (e) {
      toast.error('Error de conexión: ' + String(e))
    }
  }

  const columns = [
    {
      key: 'full_name',
      label: 'Nombre',
      render: (u: Profile) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-eos-500 to-violet-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">
              {u.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{u.full_name}</p>
            <p className="text-xs text-slate-400 font-mono">{displayEmail(u.email)}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Rol',
      render: (u: Profile) => (
        <span className={`badge ${ROLE_COLORS[u.role]}`}>
          {ROLE_LABELS[u.role]}
        </span>
      )
    },
    {
      key: 'is_active',
      label: 'Estado',
      render: (u: Profile) => (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${u.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
          {u.is_active
            ? <><CheckCircle className="w-3.5 h-3.5" /> Activo</>
            : <><XCircle className="w-3.5 h-3.5" /> Inactivo</>
          }
        </div>
      )
    },
    {
      key: 'phone',
      label: 'Teléfono',
      render: (u: Profile) => u.phone ?? '—'
    },
    {
      key: 'created_at',
      label: 'Registro',
      render: (u: Profile) => formatDate(u.created_at)
    },
    {
      key: 'actions',
      label: 'Acciones',
      render: (u: Profile) => {
        // Administración: solo imprimir + solicitar reset de contraseña al super admin
        if (profile?.role === 'administracion') return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPrintModal(u); setPrintPassword(''); setShowPrintPassword(false) }}
              className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              title="Imprimir carta de credenciales"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleRequestPasswordReset(u)}
              className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
              title="Solicitar restablecimiento de contraseña al Super Admin"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>
        )
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(u)}
              className="p-1.5 text-slate-400 hover:text-eos-600 hover:bg-eos-50 rounded-lg transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => openReset(u)}
              className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
              title="Restablecer contraseña"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setPrintModal(u); setPrintPassword(''); setShowPrintPassword(false) }}
              className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              title="Imprimir carta de credenciales"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleActive(u)}
              className={`p-1.5 rounded-lg transition-colors ${
                u.is_active
                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                  : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
              }`}
              title={u.is_active ? 'Desactivar' : 'Activar'}
            >
              {u.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
            </button>
            {isMaster && u.id !== profile?.id && (
              <button
                onClick={() => handleDelete(u)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar usuario"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      }
    },
  ]

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Gestión de Usuarios</h1>
          <p className="page-subtitle">{users.length} usuarios registrados en el sistema</p>
        </div>
      </div>

      <DataTable
        data={users as unknown as Record<string, unknown>[]}
        columns={columns as any}
        loading={loading}
        onRefresh={loadUsers}
        exportFilename="usuarios"
        actions={
          canCreateUser ? (
            <button onClick={openCreate} className="btn-primary">
              <UserPlus className="w-4 h-4" />
              Nuevo Usuario
            </button>
          ) : undefined
        }
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input
              className="input"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Ej: Juan Carlos Pérez"
            />
          </div>

          <div>
            <label className="label">Usuario *</label>
            <input
              className="input font-mono"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
              placeholder="ej: jperez2024"
            />
            {modal === 'create' && (
              <p className="text-xs text-slate-400 mt-1">
                Solo letras minúsculas, números, puntos y guiones. El estudiante usará este nombre para entrar al sistema.
              </p>
            )}
            {modal === 'edit' && (
              <p className="text-xs text-amber-500 mt-1">
                Cambiar el usuario actualiza el acceso al sistema. El usuario debe usar el nuevo nombre para iniciar sesión.
              </p>
            )}
          </div>

          {modal === 'create' && (
            <div>
              <label className="label">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="label">Rol *</label>
            <select
              className="input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
            >
              {(modal === 'create' ? createRoles : ALL_ROLES).map(role => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
            {modal === 'create' && !canAssignDocente && (
              <p className="text-xs text-slate-400 mt-1">
                Los docentes se registran desde <strong>Equipo de Trabajo</strong>.
              </p>
            )}
          </div>

          <div>
            <label className="label">Teléfono</label>
            <input
              className="input"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+506 8000-0000"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : modal === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal restablecer contraseña */}
      <Modal
        isOpen={resetModal !== null}
        onClose={() => setResetModal(null)}
        title={`Restablecer contraseña — ${resetModal?.full_name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Ingresa una nueva contraseña para <strong>{resetModal?.full_name}</strong>.
            El usuario podrá iniciar sesión con esta contraseña de inmediato.
          </p>
          <div>
            <label className="label">Nueva contraseña *</label>
            <div className="relative">
              <input
                type={showResetPassword ? 'text' : 'password'}
                className="input pr-10"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setResetModal(null)} className="btn-secondary">Cancelar</button>
            <button onClick={handleReset} disabled={resetting} className="btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500">
              <KeyRound className="w-4 h-4" />
              {resetting ? 'Restableciendo...' : 'Restablecer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal imprimir carta usuario existente */}
      <Modal
        isOpen={printModal !== null}
        onClose={() => { setPrintModal(null); setPrintPasswordGenerated(false) }}
        title={`Imprimir carta — ${printModal?.full_name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Ingresa la contraseña de <strong>{printModal?.full_name}</strong> para incluirla en la carta.
          </p>

          <div>
            <label className="label">Contraseña *</label>
            <div className="relative">
              <input
                type={showPrintPassword ? 'text' : 'password'}
                className="input pr-10"
                value={printPassword}
                onChange={e => { setPrintPassword(e.target.value); setPrintPasswordGenerated(false) }}
                placeholder="Contraseña del usuario"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPrintPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPrintPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Generar contraseña */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
            <p className="text-xs text-slate-500">
              ¿No recuerdas la contraseña? Genera una nueva — se actualizará automáticamente al imprimir.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const pwd = generateMemorablePassword()
                  setPrintPassword(pwd)
                  setPrintPasswordGenerated(true)
                  setShowPrintPassword(true)
                }}
                className="btn-secondary text-xs py-1.5 gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" /> Generar contraseña
              </button>
              {printPasswordGenerated && printPassword && (
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(printPassword); toast.success('Copiada') }}
                  className="flex items-center gap-1 text-xs text-eos-600 hover:text-eos-800 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </button>
              )}
            </div>
            {printPasswordGenerated && (
              <p className="text-xs text-amber-600">
                Al imprimir se restablecera la contrasena del usuario a la generada.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setPrintModal(null); setPrintPasswordGenerated(false) }} className="btn-secondary">Cancelar</button>
            <button
              disabled={printResetting}
              onClick={async () => {
                if (!printPassword) { toast.error('Ingresa o genera una contraseña'); return }
                if (printPasswordGenerated) {
                  // Resetear primero, luego imprimir
                  setPrintResetting(true)
                  try {
                    const token = session?.access_token
                    const res = await fetch(apiUrl('/api/reset-password'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ userId: printModal!.id, newPassword: printPassword }),
                    })
                    const data = await res.json()
                    if (!res.ok || data?.error) { toast.error(data?.error || 'Error al restablecer'); return }
                  } catch {
                    toast.error('Error de conexión'); return
                  } finally {
                    setPrintResetting(false)
                  }
                }
                printCredentialLetter(displayEmail(printModal!.email), printPassword, printModal!.full_name)
                setPrintModal(null)
                setPrintPasswordGenerated(false)
              }}
              className="btn-primary gap-2 disabled:opacity-50"
            >
              {printResetting
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Printer className="w-4 h-4" />}
              {printResetting ? 'Actualizando...' : 'Imprimir carta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de credenciales creadas / restablecidas */}
      <Modal
        isOpen={createdCreds !== null}
        onClose={() => setCreatedCreds(null)}
        title={createdCreds?.action === 'reset' ? '✓ Contraseña restablecida' : '✓ Usuario creado exitosamente'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {createdCreds?.action === 'reset'
              ? 'La contraseña fue cambiada. Comparte las credenciales con el usuario.'
              : 'Guarda o comparte estas credenciales con el usuario.'
            } La contraseña <strong>no se puede recuperar</strong> después de cerrar esta ventana.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Usuario</p>
              <div className="flex items-center gap-2">
                <p className="font-mono font-semibold text-slate-900">{createdCreds?.username}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdCreds?.username ?? ''); toast.success('Copiado') }}
                  className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Contraseña</p>
              <div className="flex items-center gap-2">
                <p className="font-mono font-semibold text-slate-900">{createdCreds?.password}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdCreds?.password ?? ''); toast.success('Copiado') }}
                  className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                const text = `Usuario: ${createdCreds?.username}\nContraseña: ${createdCreds?.password}\nSistema: eos-school.app`
                navigator.clipboard.writeText(text)
                toast.success('Credenciales copiadas')
              }}
              className="btn-secondary flex-1 justify-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copiar todo
            </button>
            <button
              onClick={() => printCredentialLetter(
                createdCreds?.username ?? '',
                createdCreds?.password ?? '',
                users.find(u => displayEmail(u.email) === createdCreds?.username)?.full_name
              )}
              className="btn-secondary flex-1 justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir carta
            </button>
            <button onClick={() => setCreatedCreds(null)} className="btn-primary flex-1 justify-center">
              Listo
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
