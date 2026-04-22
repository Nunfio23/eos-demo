'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ROLE_DASHBOARD } from '@/lib/utils'

export default function HomePage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login')
      } else if (profile) {
        router.replace(ROLE_DASHBOARD[profile.role])
      } else {
        // Sesión válida pero perfil no cargó (timeout) — ir al dashboard y reintentar
        router.replace('/dashboard/master')
      }
    }
  }, [user, profile, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-eos-500 to-eos-700 flex items-center justify-center">
          <span className="text-2xl font-bold text-white font-display">T</span>
        </div>
        <div className="w-8 h-1 bg-eos-500 rounded mx-auto animate-pulse" />
      </div>
    </div>
  )
}
