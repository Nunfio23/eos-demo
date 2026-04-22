'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useBranding, useBrandStyle } from '@/lib/branding-context'
import { ROLE_DASHBOARD } from '@/lib/utils'
import { Eye, EyeOff, Shield, BookOpen, Users, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signIn, user, profile } = useAuth()
  const { schoolName, tagline } = useBranding()
  const brandStyle = useBrandStyle()
  const router = useRouter()

  useEffect(() => {
    if (user && profile) {
      router.replace(ROLE_DASHBOARD[profile.role])
    }
  }, [user, profile, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Completa todos los campos')
      return
    }

    // Si tiene @ es un email completo (cuenta master), si no, construir email sintético
    const email = username.includes('@') ? username : `${username}@eos-school.app`

    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      toast.error('Credenciales incorrectas. Verifica tu usuario y contraseña.')
    } else {
      toast.success('¡Bienvenido de vuelta!')
    }
  }

  return (
    <div className="min-h-screen login-bg flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles — azul sin morado */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" style={{background: 'rgba(15,45,191,0.12)'}} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-3xl translate-x-1/3 translate-y-1/3" style={{background: 'rgba(30,144,255,0.10)'}} />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <span className="text-white font-bold text-xl font-display">Sistema E-OS</span>
        </div>

        {/* Main text */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="font-display text-5xl font-bold text-white leading-tight">
              Bienvenido al<br />
              <span className="gradient-text">
                sistema escolar
              </span>
            </h1>
            <p className="text-slate-400 mt-4 text-lg leading-relaxed">
              {tagline || `${schoolName} — Gestiona estudiantes, docentes, finanzas y más desde un solo lugar.`}
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Shield, text: 'Seguro y confiable', sub: 'Datos protegidos' },
              { icon: Users, text: 'Multirol', sub: '11 tipos de usuario' },
              { icon: BookOpen, text: 'Académico', sub: 'Control completo' },
              { icon: Zap, text: 'Tiempo real', sub: 'Datos en vivo' },
            ].map(({ icon: Icon, text, sub }) => (
              <div key={text} className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background: 'rgba(30,144,255,0.2)'}}>
                  <Icon className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{text}</p>
                  <p className="text-slate-500 text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-slate-600 text-sm relative z-10" suppressHydrationWarning>
          © {new Date().getFullYear()} {schoolName}. Todos los derechos reservados.
        </p>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <span className="text-white font-bold text-xl font-display">Sistema E-OS</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white font-display">Iniciar Sesión</h2>
              <p className="text-slate-400 mt-1 text-sm">Accede a tu espacio en E-OS</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Usuario
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().trim())}
                  placeholder="ej: jperez2024"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-sm"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-sm"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary-gradient w-full py-3 px-6 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Ingresando...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Ingresar al Sistema</span>
                  </>
                )}
              </button>
            </form>

            {/* Info notice */}
            <div className="mt-6 p-4 rounded-xl border" style={{background: 'rgba(15,45,191,0.15)', borderColor: 'rgba(30,144,255,0.2)'}}>
              <p className="text-xs text-slate-400 text-center">
                <span className="text-blue-300 font-medium">Cuenta master:</span>{' '}
                Escribe tu correo electrónico completo
              </p>
            </div>
          </div>

          <p className="text-center text-slate-600 text-xs mt-6">
            {schoolName} · Sistema Educativo E-OS
          </p>
        </div>
      </div>
    </div>
  )
}
