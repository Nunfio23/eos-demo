'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import MisterEOSWidget from '@/components/MisterEOSWidget'
import BottomNav from '@/components/mobile/BottomNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-eos-500 to-eos-700 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold font-display text-lg">T</span>
          </div>
          <p className="text-slate-500 text-sm">Cargando E-OS...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
          <div className="flex-1 p-3 md:p-6 pb-20 md:pb-6">
            <div className="w-full max-w-7xl mx-auto animate-fade-in">
              {children}
            </div>
          </div>
          <Footer />
        </main>
        <BottomNav />
      </div>
      {/* Mister EOS: only on desktop — on mobile accessed via "Más" menu */}
      <div className="hidden md:block">
        <MisterEOSWidget />
      </div>
    </div>
  )
}
