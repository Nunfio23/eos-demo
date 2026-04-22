'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Camera, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface PhotoUploadProps {
  currentUrl: string | null | undefined
  onUpload: (url: string) => void
  folder?: string       // subcarpeta dentro del bucket: 'staff' | 'students' | etc.
  size?: 'sm' | 'md' | 'lg'
  shape?: 'circle' | 'square'
}

const SIZES = {
  sm: 'w-14 h-14',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
}

const ICON_SIZES = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-8 h-8' }

export default function PhotoUpload({
  currentUrl,
  onUpload,
  folder = 'uploads',
  size = 'md',
  shape = 'circle',
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl'

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5 MB')
      return
    }

    setUploading(true)
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('photos')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      toast.error('Error al subir la foto: ' + upErr.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('photos').getPublicUrl(path)
    onUpload(data.publicUrl)
    setUploading(false)
    toast.success('Foto actualizada')
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onClick={() => !uploading && inputRef.current?.click()}
      className={`
        ${SIZES[size]} ${radius}
        relative overflow-hidden shrink-0
        bg-slate-100 border-2 border-dashed border-slate-300
        flex items-center justify-center
        cursor-pointer group
        hover:border-eos-400 transition-colors
      `}
      title="Clic para cambiar foto"
    >
      {uploading ? (
        <Loader2 className={`${ICON_SIZES[size]} text-slate-400 animate-spin`} />
      ) : currentUrl ? (
        <>
          <img
            src={currentUrl}
            alt="Foto"
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
            <Camera className={`${ICON_SIZES[size]} text-white`} />
            <span className="text-white text-[10px] font-medium">Cambiar</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 text-slate-400 group-hover:text-eos-500 transition-colors">
          <Camera className={ICON_SIZES[size]} />
          <span className="text-[10px] font-medium">Foto</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
