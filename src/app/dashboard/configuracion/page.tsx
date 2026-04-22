'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useBranding } from '@/lib/branding-context'
import { Settings, Save, School, Palette, Mail, Phone, MapPin, Tag, Image, Link2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

// ─── Detecta y convierte links de Google Drive a URL directa de imagen ───────
function convertDriveUrl(url: string): { converted: string; wasDrive: boolean } {
  const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match) {
    return {
      converted: `https://lh3.googleusercontent.com/d/${match[1]}`,
      wasDrive: true,
    }
  }
  return { converted: url, wasDrive: false }
}

export default function ConfiguracionPage() {
  const { profile } = useAuth()
  const { refresh: refreshBranding } = useBranding()
  const canEdit = profile?.role && ['master', 'direccion'].includes(profile.role)

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [driveConverted, setDriveConverted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)
    loadSettings().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    const { data } = await supabase.from('school_settings').select('key, value')
    const map: Record<string, string> = {}
    ;(data ?? []).forEach((s: { key: string; value: string | null }) => { map[s.key] = s.value ?? '' })
    setSettings(map)
    setOriginal(map)
    setLoading(false)
  }

  const ALL_KEYS = [
    'school_name', 'school_tagline', 'school_email', 'school_phone',
    'school_address', 'logo_url', 'primary_color', 'secondary_color',
  ]

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)
    const updates = ALL_KEYS.map(key => ({
      key,
      value: settings[key] ?? '',
      updated_by: profile!.id,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('school_settings').upsert(updates, { onConflict: 'key' })
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Configuración guardada')
    setOriginal({ ...settings })
    setDriveConverted(false)
    refreshBranding()
  }

  const handleLogoChange = (raw: string) => {
    const { converted, wasDrive } = convertDriveUrl(raw)
    if (wasDrive) {
      setDriveConverted(true)
      toast.success('Link de Google Drive convertido automáticamente', { icon: '🔗' })
    } else {
      setDriveConverted(false)
    }
    setSettings(p => ({ ...p, logo_url: converted }))
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original)

  // Gradient preview style
  const primaryColor   = settings.primary_color   || '#6366f1'
  const secondaryColor = settings.secondary_color || ''
  const gradientStyle  = secondaryColor
    ? { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }
    : { backgroundColor: primaryColor }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Ajustes globales del sistema escolar</p>
        </div>
        {canEdit && (
          <button onClick={handleSave} disabled={saving || !isDirty}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Save className="w-4 h-4" />}
            Guardar cambios
          </button>
        )}
      </div>

      {/* ─── Identidad ─── */}
      <div className="card p-6 space-y-5">
        <SectionHeader icon={<School className="w-4 h-4 text-eos-600" />} title="Identidad del Colegio" />

        <div className="grid grid-cols-2 gap-4">
          {/* Nombre */}
          <FieldWrapper label="Nombre del Colegio" icon={<School />} col={2}>
            <input value={settings.school_name ?? ''} disabled={!canEdit}
              onChange={e => setSettings(p => ({ ...p, school_name: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
          </FieldWrapper>

          {/* Lema */}
          <FieldWrapper label="Lema / Tagline" icon={<Tag />} col={2}>
            <input value={settings.school_tagline ?? ''} disabled={!canEdit}
              onChange={e => setSettings(p => ({ ...p, school_tagline: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
          </FieldWrapper>

          {/* Email */}
          <FieldWrapper label="Email institucional" icon={<Mail />} col={1}>
            <input type="email" value={settings.school_email ?? ''} disabled={!canEdit}
              onChange={e => setSettings(p => ({ ...p, school_email: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
          </FieldWrapper>

          {/* Teléfono */}
          <FieldWrapper label="Teléfono" icon={<Phone />} col={1}>
            <input value={settings.school_phone ?? ''} disabled={!canEdit}
              onChange={e => setSettings(p => ({ ...p, school_phone: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
          </FieldWrapper>

          {/* Dirección */}
          <FieldWrapper label="Dirección" icon={<MapPin />} col={2}>
            <input value={settings.school_address ?? ''} disabled={!canEdit}
              onChange={e => setSettings(p => ({ ...p, school_address: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
          </FieldWrapper>
        </div>
      </div>

      {/* ─── Logo ─── */}
      <div className="card p-6 space-y-4">
        <SectionHeader icon={<Image className="w-4 h-4 text-eos-600" />} title="Logo" />

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            URL del logo
            <span className="text-slate-400 font-normal">— pega el link de Google Drive, Cloudinary, Supabase Storage…</span>
          </label>
          <div className="relative">
            <input
              value={settings.logo_url ?? ''}
              disabled={!canEdit}
              onChange={e => handleLogoChange(e.target.value)}
              placeholder="https://... o pega un link de Google Drive"
              className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50"
            />
            {driveConverted && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          {driveConverted && (
            <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Link de Google Drive convertido a URL directa de imagen
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-400">
            Si usas Google Drive: comparte el archivo como "Cualquier persona con el enlace" y pega el link aquí — se convierte automáticamente.
          </p>
        </div>

        {/* Preview logo */}
        {settings.logo_url && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <img src={settings.logo_url} alt="Logo preview"
              className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-200 p-1"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div>
              <p className="text-xs font-medium text-slate-700">Vista previa del logo</p>
              <p className="text-xs text-slate-400 break-all mt-0.5 max-w-sm truncate">{settings.logo_url}</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Colores / Gradiente ─── */}
      <div className="card p-6 space-y-5">
        <SectionHeader icon={<Palette className="w-4 h-4 text-eos-600" />} title="Colores del Colegio" />

        <div className="grid grid-cols-2 gap-6">
          {/* Color primario */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Color primario</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} disabled={!canEdit}
                onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer disabled:opacity-50 p-0.5" />
              <input type="text" value={primaryColor} disabled={!canEdit}
                onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50" />
            </div>
          </div>

          {/* Color secundario */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Color secundario <span className="text-slate-400 font-normal">(gradiente)</span>
            </label>
            <div className="flex items-center gap-3">
              <input type="color" value={secondaryColor || primaryColor} disabled={!canEdit}
                onChange={e => setSettings(p => ({ ...p, secondary_color: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer disabled:opacity-50 p-0.5" />
              <input type="text" value={secondaryColor} disabled={!canEdit}
                onChange={e => setSettings(p => ({ ...p, secondary_color: e.target.value }))}
                placeholder="Vacío = sin gradiente"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-eos-500 disabled:bg-slate-50 placeholder:text-slate-400" />
            </div>
            {secondaryColor && (
              <button onClick={() => setSettings(p => ({ ...p, secondary_color: '' }))}
                className="mt-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors">
                × Quitar gradiente
              </button>
            )}
          </div>
        </div>

        {/* Gradient preview strip */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">Vista previa del color / gradiente</p>
          <div className="flex items-center gap-4">
            {/* Strip */}
            <div className="h-12 flex-1 rounded-xl shadow-inner" style={gradientStyle} />
            {/* Logo fallback preview */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0"
              style={gradientStyle}>
              {(settings.school_name ?? 'N')[0]}
            </div>
            {/* Button preview */}
            <div className="px-4 py-2 rounded-xl text-white text-sm font-medium shadow shrink-0"
              style={gradientStyle}>
              Botón
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {secondaryColor
              ? `Gradiente: ${primaryColor} → ${secondaryColor}`
              : 'Color sólido. Agrega un color secundario para activar el gradiente.'}
          </p>
        </div>
      </div>

      {/* ─── Vista previa general ─── */}
      {(settings.school_name || settings.logo_url) && (
        <div className="card p-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Vista previa general</p>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo"
                className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 p-1"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                style={gradientStyle}>
                {(settings.school_name ?? 'N')[0]}
              </div>
            )}
            <div>
              <p className="font-bold text-slate-900">{settings.school_name || 'Nombre del Colegio'}</p>
              {settings.school_tagline && <p className="text-sm text-slate-500 italic">{settings.school_tagline}</p>}
              {(settings.school_email || settings.school_phone) && (
                <p className="text-xs text-slate-400 mt-1">{[settings.school_email, settings.school_phone].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-slate-400 text-center">Solo Master y Dirección pueden modificar la configuración.</p>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-eos-50 flex items-center justify-center">{icon}</div>
      <h2 className="font-semibold text-slate-900">{title}</h2>
    </div>
  )
}

function FieldWrapper({ label, icon, col, children }: {
  label: string; icon: React.ReactNode; col: 1 | 2; children: React.ReactNode
}) {
  return (
    <div className={col === 2 ? 'col-span-2' : 'col-span-1'}>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
