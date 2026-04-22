'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Branding {
  schoolName:     string
  tagline:        string
  logoUrl:        string | null
  primaryColor:   string
  secondaryColor: string   // segundo color para gradiente; vacío = sin gradiente
  email:          string
  phone:          string
  address:        string
  loading:        boolean
  refresh:        () => void
}

const DEFAULT: Branding = {
  schoolName:     'Colegio E-OS Demo',
  tagline:        'Fe, Ciencia y Excelencia',
  logoUrl:        null,
  primaryColor:   '#6366f1',
  secondaryColor: '',
  email:          '',
  phone:          '',
  address:        '',
  loading:        true,
  refresh:        () => {},
}

const BrandingContext = createContext<Branding>(DEFAULT)

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Omit<Branding, 'loading' | 'refresh'>>({
    schoolName:     DEFAULT.schoolName,
    tagline:        DEFAULT.tagline,
    logoUrl:        DEFAULT.logoUrl,
    primaryColor:   DEFAULT.primaryColor,
    secondaryColor: DEFAULT.secondaryColor,
    email:          DEFAULT.email,
    phone:          DEFAULT.phone,
    address:        DEFAULT.address,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('school_settings')
      .select('key, value')

    if (data && data.length > 0) {
      const map: Record<string, string> = {}
      data.forEach((r: { key: string; value: string | null }) => { map[r.key] = r.value ?? '' })
      setBranding({
        schoolName:     map.school_name     || DEFAULT.schoolName,
        tagline:        map.school_tagline  || DEFAULT.tagline,
        logoUrl:        map.logo_url        || null,
        primaryColor:   map.primary_color   || DEFAULT.primaryColor,
        secondaryColor: map.secondary_color || '',
        email:          map.school_email    || '',
        phone:          map.school_phone    || '',
        address:        map.school_address  || '',
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Inyecta variables CSS globales
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--brand-primary', branding.primaryColor)
    if (branding.secondaryColor) {
      root.style.setProperty('--brand-secondary', branding.secondaryColor)
      root.style.setProperty(
        '--brand-gradient',
        `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`
      )
    } else {
      root.style.removeProperty('--brand-secondary')
      root.style.setProperty('--brand-gradient', branding.primaryColor)
    }
  }, [branding.primaryColor, branding.secondaryColor])

  return (
    <BrandingContext.Provider value={{ ...branding, loading, refresh: load }}>
      {children}
    </BrandingContext.Provider>
  )
}

export const useBranding = () => useContext(BrandingContext)

/** Hook: devuelve un objeto `style` con gradiente (si hay secondaryColor) o color sólido */
export function useBrandStyle() {
  const { primaryColor, secondaryColor } = useBranding()
  if (secondaryColor) {
    return { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }
  }
  return { backgroundColor: primaryColor }
}
