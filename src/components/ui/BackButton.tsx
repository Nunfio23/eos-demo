'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-100 self-start"
    >
      <ArrowLeft className="w-4 h-4" />
      Regresar
    </button>
  )
}
