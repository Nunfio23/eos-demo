'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { loadPermissionsFromDB } from '@/lib/permissions'
import type { Profile, UserRole } from '@/types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: UserRole | null
  blockedModules: string[]
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) {
      if (!data.is_active) {
        // Usuario desactivado — cerrar sesión
        await supabase.auth.signOut()
        return
      }
      setProfile(data)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  useEffect(() => {
    // onAuthStateChange dispara INITIAL_SESSION inmediatamente con la sesión de las cookies.
    // Usamos eso como fuente de verdad para desbloquear el UI rápido.
    // fetchProfile carga en background — el UI no espera.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id) // background, sin await
          loadPermissionsFromDB(supabase) // cargar permisos dinámicos en background
        } else {
          setProfile(null)
        }
        setLoading(false) // desbloquear UI inmediatamente
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    // Limpiar tokens residuales localmente (sin llamada de red) antes de autenticar.
    // Evita que una sesión expirada del browser interfiera con el login tras reiniciar la laptop.
    await supabase.auth.signOut({ scope: 'local' })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile,
      role: profile?.role ?? null,
      blockedModules: profile?.blocked_modules ?? [],
      loading, signIn, signOut, refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
