'use client'

import { cn } from '@/lib/utils'

interface StudentAvatarProps {
  url?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Gradient color variant — defaults to blue */
  variant?: 'blue' | 'amber' | 'slate' | 'orange' | 'red' | 'emerald' | 'violet'
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-16 h-16 text-base',
}

const GRADIENT_CLASSES: Record<string, string> = {
  blue:    'bg-gradient-to-br from-blue-400 to-indigo-500',
  amber:   'bg-gradient-to-br from-amber-400 to-amber-600',
  slate:   'bg-gradient-to-br from-slate-400 to-slate-600',
  orange:  'bg-gradient-to-br from-orange-400 to-orange-600',
  red:     'bg-gradient-to-br from-red-400 to-red-600',
  emerald: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
  violet:  'bg-gradient-to-br from-violet-400 to-violet-600',
}

export default function StudentAvatar({
  url,
  name,
  size = 'md',
  className,
  variant = 'blue',
}: StudentAvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center shrink-0 overflow-hidden',
        SIZE_CLASSES[size],
        !url && GRADIENT_CLASSES[variant],
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <span className="text-white font-bold leading-none">{initials}</span>
      )}
    </div>
  )
}
