'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ROLE_DASHBOARD } from '@/lib/utils'

export default function DashboardPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && profile) {
      router.replace(ROLE_DASHBOARD[profile.role])
    }
  }, [profile, loading, router])
  return null
}
