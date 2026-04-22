'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { ROLE_LABELS } from '@/lib/utils'
import { KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

export default function PerfilPage() {
  const { profile } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent,     setShowCurrent]     = useState(false)
  const [showNew,         setShowNew]         = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [saving,          setSaving]          = useState(false)

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Completa todos los campos')
      return
    }
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setSaving(true)
    try {
      // Re-autenticar con contraseña actual para verificar identidad
      const email = profile?.email ?? ''
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInError) {
        toast.error('La contraseña actual es incorrecta')
        return
      }

      // Cambiar contraseña
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        toast.error('Error al cambiar la contraseña')
        return
      }

      toast.success('Contraseña actualizada correctamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <BackButton />

      <div>
        <h1 className="page-title">Mi Perfil</h1>
        <p className="page-subtitle">Información de tu cuenta</p>
      </div>

      {/* Info de usuario */}
      {profile && (
        <div className="card p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-xl font-bold"
            style={{ background: 'linear-gradient(135deg, #0f2dbf, #1e90ff)' }}>
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-lg">{profile.full_name}</p>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <span className="inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-eos-100 text-eos-700">
              {ROLE_LABELS[profile.role]}
            </span>
          </div>
        </div>
      )}

      {/* Cambiar contraseña */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-eos-50 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-eos-600" />
          </div>
          <h2 className="font-semibold text-slate-900">Cambiar contraseña</h2>
        </div>

        {/* Contraseña actual */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Contraseña actual
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Tu contraseña actual"
              className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
            />
            <button type="button" onClick={() => setShowCurrent(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Nueva contraseña */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
            />
            <button type="button" onClick={() => setShowNew(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirmar contraseña */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Confirmar nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500"
              onKeyDown={e => { if (e.key === 'Enter') handleChangePassword() }}
            />
            <button type="button" onClick={() => setShowConfirm(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1.5 text-xs text-red-500">Las contraseñas no coinciden</p>
          )}
        </div>

        <button
          onClick={handleChangePassword}
          disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <ShieldCheck className="w-4 h-4" />}
          Actualizar contraseña
        </button>
      </div>
    </div>
  )
}
