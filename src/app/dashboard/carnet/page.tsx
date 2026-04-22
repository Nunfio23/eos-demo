'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useBranding } from '@/lib/branding-context'
import { supabase } from '@/lib/supabase'
import {
  CreditCard, ArrowLeft, Download, User, ImagePlus,
  RefreshCw, Eye, Search, Wand2, Printer, Users, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toPng } from 'html-to-image'

/* ─── grade → cycle ─────────────────────────────────────────────── */
function getCycle(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('day care'))   return 'Day Care'
  if (n.includes('parvularia')) return 'Parvularia'
  if (['primer grado','segundo grado','tercer grado'].some(g => n.includes(g))) return 'Elementary'
  if (['cuarto grado','quinto grado','sexto grado'].some(g => n.includes(g)))   return 'Elementary'
  if (['séptimo','septimo','octavo','noveno'].some(g => n.includes(g)))         return 'Middle School'
  if (['décimo','decimo','onceavo','onceno','doceavo'].some(g => n.includes(g))) return 'High School'
  if (n.includes('año')) return 'High School'
  return ''
}

/* ─── grade sort order ───────────────────────────────────────────── */
const GRADE_ORDER: Record<string, number> = {
  'day care': 0,
  'parvularia 4': 1, 'parvularia 5': 2, 'parvularia 6': 3,
  'primer grado': 4, 'segundo grado': 5, 'tercer grado': 6,
  'cuarto grado': 7, 'quinto grado': 8, 'sexto grado': 9,
  'séptimo grado': 10, 'septimo grado': 10,
  'octavo grado': 11, 'noveno grado': 12,
  'décimo grado': 13, 'decimo grado': 13,
  'onceavo grado': 14, 'onceno grado': 14,
  'doceavo grado': 15,
}
function gradeSort(a: string, b: string): number {
  const ai = GRADE_ORDER[a.toLowerCase()] ?? 99
  const bi = GRADE_ORDER[b.toLowerCase()] ?? 99
  return ai !== bi ? ai - bi : a.localeCompare(b)
}

/* ─── types ─────────────────────────────────────────────────────── */
type PersonType = 'student' | 'staff'

interface PersonOption {
  id: string
  name: string
  type: PersonType
  photoUrl: string | null
  nie?: string | null
  nip?: string | null
  gradeName?: string
  cycleName?: string
  roleLabel: string   // e.g. 'ESTUDIANTE', 'DOCENTE', 'DIRECTOR'
}

interface CardState {
  photo: string | null
  fullName: string
  nie: string
  nip: string
  grade: string
  cycle: string
  roleLabel: string
  year: string
  isStudent: boolean
}

/* ─── helpers ───────────────────────────────────────────────────── */
// Normaliza nombre: minúsculas, sin acentos, espacios simples
function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(' ')
  if (parts.length <= 2) return [name.trim(), '']
  const mid = Math.ceil(parts.length / 2)
  return [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')]
}

async function toDataUrl(url: string): Promise<string> {
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result as string)
      r.readAsDataURL(blob)
    })
  } catch { return url }
}

/* ─── SVG patterns ──────────────────────────────────────────────── */
const XS_W = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E%3Cline x1='8' y1='8' x2='22' y2='22' stroke='rgba(255,255,255,0.22)' stroke-width='2.5' stroke-linecap='round'/%3E%3Cline x1='22' y1='8' x2='8' y2='22' stroke='rgba(255,255,255,0.22)' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E")`
const XS_D = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E%3Cline x1='8' y1='8' x2='22' y2='22' stroke='rgba(255,255,255,0.09)' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='22' y1='8' x2='8' y2='22' stroke='rgba(255,255,255,0.09)' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")`

/* ─── FrontHeader ───────────────────────────────────────────────── */
function FrontHeader({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div style={{ position: 'relative', height: 168, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: '#0e0e0e', backgroundImage: XS_D, backgroundSize: '30px 30px' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#1a2ecc', backgroundImage: XS_W, backgroundSize: '30px 30px', clipPath: 'polygon(0 0, 58% 0, 44% 100%, 0 100%)' }} />
      <div style={{ position: 'absolute', right: 16, top: 0, bottom: 0, display: 'flex', gap: 5, alignItems: 'stretch' }}>
        {[8, 14, 22].map((w, i) => (
          <div key={i} style={{ width: w, background: `rgba(255,255,255,${[0.06,0.1,0.16][i]})`, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14 }}>
        <div style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(255,255,255,0.9)', background: 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                   : <span style={{ color: '#1a2ecc', fontWeight: 900, fontSize: 22 }}>N</span>}
        </div>
        <div>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 22, lineHeight: 1.1, margin: 0 }}>E-OS</p>
          <p style={{ color: '#93c5fd', fontWeight: 400, fontSize: 12, margin: 0, marginTop: 4 }}>Christian School</p>
        </div>
      </div>
    </div>
  )
}

/* ─── BackHeader ────────────────────────────────────────────────── */
function BackHeader({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div style={{ position: 'relative', height: 100, overflow: 'hidden', flexShrink: 0 }}>
      {/* Uniform dark navy — full width, no diagonal split */}
      <div style={{ position: 'absolute', inset: 0, background: '#1a2570', backgroundImage: XS_W, backgroundSize: '30px 30px' }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(255,255,255,0.9)', background: 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                   : <span style={{ color: '#1a2570', fontWeight: 900, fontSize: 22 }}>N</span>}
        </div>
        <div>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 20, lineHeight: 1.1, margin: 0 }}>E-OS</p>
          <p style={{ color: '#93c5fd', fontWeight: 400, fontSize: 11, margin: 0, marginTop: 3 }}>Christian School</p>
        </div>
      </div>
    </div>
  )
}

/* ─── Decorations ───────────────────────────────────────────────── */
function GradCap({ size = 140, opacity = 0.22 }: { size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ opacity, display: 'block' }}>
      <polygon points="60,10 110,35 60,60 10,35" fill="#f472b6" />
      <polygon points="60,60 110,35 110,70 60,95 10,70 10,35" fill="#ec4899" opacity="0.7" />
      <rect x="100" y="35" width="6" height="32" fill="#f472b6" rx="2" />
      <circle cx="103" cy="70" r="6" fill="#f472b6" />
      <line x1="60" y1="60" x2="60" y2="95" stroke="#ec4899" strokeWidth="4" />
    </svg>
  )
}

function LightningBolt({ size = 80, opacity = 0.12 }: { size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 50 90" width={size} height={size * 1.8} style={{ opacity, display: 'block' }}>
      <polygon points="32,0 4,50 22,50 18,90 46,40 28,40" fill="#94a3b8" />
    </svg>
  )
}

function SealSVG() {
  const S = 210, cx = S / 2, cy = S / 2, R = 95
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={175} height={175} style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={R}    fill="none" stroke="#1a2ecc" strokeWidth="2.2" />
      <circle cx={cx} cy={cy} r={R-14} fill="none" stroke="#1a2ecc" strokeWidth="0.7" />
      <defs>
        <path id="tp" d={`M ${cx-R+8},${cy} A ${R-8},${R-8} 0 0,1 ${cx+R-8},${cy}`} />
        <path id="bp" d={`M ${cx-R+8},${cy} A ${R-8},${R-8} 0 0,0 ${cx+R-8},${cy}`} />
      </defs>
      <text fill="#1a2ecc" fontSize="8.5" fontWeight="700" fontFamily="Arial,sans-serif" letterSpacing="0.4">
        <textPath href="#tp" startOffset="4%">Ministerio de Educacion, Ciencia y Tecnología</textPath>
      </text>
      <text fill="#1a2ecc" fontSize="8.5" fontFamily="Arial,sans-serif" letterSpacing="0.3">
        <textPath href="#bp" startOffset="23%">San Salvador Centro</textPath>
      </text>
      <text x={cx} y={cy-32} textAnchor="middle" fill="#1a2ecc" fontSize="7.5" fontWeight="800" fontFamily="Arial,sans-serif">ESCUELA CRISTIANA</text>
      <text x={cx} y={cy-22} textAnchor="middle" fill="#1a2ecc" fontSize="7.5" fontWeight="800" fontFamily="Arial,sans-serif">NIKOLA TESLA</text>
      <path d={`M${cx-14},${cy-12} L${cx+14},${cy-12} L${cx+14},${cy+7} Q${cx},${cy+21} ${cx-14},${cy+7} Z`} fill="none" stroke="#1a2ecc" strokeWidth="1.6" />
      <line x1={cx-14} y1={cy-3} x2={cx+14} y2={cy-3} stroke="#1a2ecc" strokeWidth="0.8" />
      <line x1={cx} y1={cy-12} x2={cx} y2={cy+14} stroke="#1a2ecc" strokeWidth="0.8" />
      <text x={cx} y={cy+31} textAnchor="middle" fill="#1a2ecc" fontSize="8" fontWeight="700" fontFamily="Arial,sans-serif">DIRECCIÓN</text>
      <text x={cx} y={cy+42} textAnchor="middle" fill="#1a2ecc" fontSize="7.5" fontFamily="Arial,sans-serif">COD. 11076</text>
    </svg>
  )
}

/* ─── CardFront ─────────────────────────────────────────────────── */
// Card: 340 × 539px  (template ratio 595×943)
function CardFront({ card, n1, n2 }: {
  card: CardState; n1: string; n2: string; logoUrl?: string | null
}) {
  const idPill = card.isStudent
    ? `NIE: ${card.nie || '—'}`
    : card.nip ? `NIP: ${card.nip}` : null

  // Always 3 rows to align with the 3 template labels (Grado / Ciclo / Año)
  const rows: string[] = [card.grade, card.cycle, card.year]

  return (
    <div style={{ width: 340, height: 539, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── Template background ── */}
      <img
        src="/carnet-frente.png"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        crossOrigin="anonymous"
      />

      {/* ── Student photo — fills the cyan-border placeholder ── */}
      <div style={{
        position: 'absolute',
        left: 88, top: 86,
        width: 163, height: 178,
        borderRadius: 14, overflow: 'hidden',
        background: '#dde5ef',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}>
        {card.photo
          ? <img src={card.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="#94a3b8" strokeWidth="1.5"><circle cx="12" cy="8" r="4.5" /><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
        }
      </div>

      {/* ── Name ── */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 270,
        textAlign: 'center',
        padding: '0 24px',
        zIndex: 2,
      }}>
        <p style={{ fontSize: 17, fontWeight: 900, color: '#0a0a0a', lineHeight: 1.2, margin: 0, letterSpacing: '-0.2px' }}>
          {n1}{n2 && <><br />{n2}</>}
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '2px', textTransform: 'uppercase', margin: `${n2 ? 30 : 50}px 0 0` }}>
          {card.roleLabel || 'ESTUDIANTE'}
        </p>
      </div>

      {/* ── NIE / NIP text on the black pill ── */}
      {idPill && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: 375,
          display: 'flex', justifyContent: 'center',
          zIndex: 2,
        }}>
          <span style={{ color: '#fff', fontFamily: "'Courier New',monospace", fontWeight: 700, fontSize: 14, letterSpacing: '0.5px' }}>
            {idPill}
          </span>
        </div>
      )}

      {/* ── Grado / Ciclo / Año values — tight spacing to match template labels ── */}
      <div style={{ position: 'absolute', left: 122, top: 403, zIndex: 2 }}>
        {rows.map((value, i) => (
          <p key={i} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.6, height: 22.5 }}>
            {value || ''}
          </p>
        ))}
      </div>

    </div>
  )
}

/* ─── CardFrontBulk ─────────────────────────────────────────────── */
// Copia independiente de CardFront para la vista "Imprimir por Sección".
// Modifica los valores aquí sin afectar el carnet individual.
function CardFrontBulk({ card, n1, n2 }: {
  card: CardState; n1: string; n2: string
}) {
  const idPill = card.isStudent
    ? `NIE: ${card.nie || '—'}`
    : card.nip ? `NIP: ${card.nip}` : null

  const rows: string[] = [card.grade, card.cycle, card.year]

  return (
    <div style={{ width: 340, height: 539, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── Template background ── */}
      <img
        src="/carnet-frente.png"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        crossOrigin="anonymous"
      />

      {/* ── Foto ── cambia left/top para mover horizontal/vertical */}
      <div style={{
        position: 'absolute',
        left: 88, top: 86,
        width: 163, height: 178,
        borderRadius: 14, overflow: 'hidden',
        background: '#dde5ef',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}>
        {card.photo
          ? <img src={card.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="#94a3b8" strokeWidth="1.5"><circle cx="12" cy="8" r="4.5" /><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
        }
      </div>

      {/* ── Nombre ── cambia top para subir/bajar */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 275,
        textAlign: 'center',
        padding: '0 24px',
        zIndex: 2,
      }}>
        <p style={{ fontSize: 17, fontWeight: 900, color: '#0a0a0a', lineHeight: 1.2, margin: 0, letterSpacing: '-0.2px' }}>
          {n1}{n2 && <><br />{n2}</>}
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '2px', textTransform: 'uppercase', margin: `${n2 ? 20 : 40}px 0 0` }}>
          {card.roleLabel || 'ESTUDIANTE'}
        </p>
      </div>

      {/* ── NIE / NIP pill ── cambia top para subir/bajar */}
      {idPill && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: 375,
          display: 'flex', justifyContent: 'center',
          zIndex: 2,
        }}>
          <span style={{ color: '#fff', fontFamily: "'Courier New',monospace", fontWeight: 700, fontSize: 14, letterSpacing: '0.5px' }}>
            {idPill}
          </span>
        </div>
      )}

      {/* ── Grado / Ciclo / Año ── cambia left y top */}
      <div style={{ position: 'absolute', left: 122, top: 402, zIndex: 2 }}>
        {rows.map((value, i) => (
          <p key={i} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.6, height: 22.5 }}>
            {value || ''}
          </p>
        ))}
      </div>

    </div>
  )
}

/* ─── CardBack ──────────────────────────────────────────────────── */
function CardBack({ card }: { card: CardState; logoUrl: string | null }) {
  const backImg = card.isStudent ? '/carnet-posterior.png' : '/carnet-posterior-docente.png'
  return (
    <div style={{ width: 340, height: 539, position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}>
      <img
        src={backImg}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

/* ─── MAIN PAGE ─────────────────────────────────────────────────── */
export default function CarnetPage() {
  const router        = useRouter()
  const { profile }   = useAuth()
  const { logoUrl }   = useBranding()

  // DB people
  const [people,  setPeople]  = useState<PersonOption[]>([])
  const [dbReady, setDbReady] = useState(false)

  // type tab: 'student' | 'staff'
  const [activeTab, setActiveTab] = useState<PersonType>('student')

  // search/select
  const [search,       setSearch]       = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected,     setSelected]     = useState<PersonOption | null>(null)

  // card
  const [card,        setCard]        = useState<CardState>({ photo: null, fullName: '', nie: '', nip: '', grade: '', cycle: '', roleLabel: 'ESTUDIANTE', year: String(new Date().getFullYear()), isStudent: true })
  const [photoOver,   setPhotoOver]   = useState<string | null>(null)
  const [generated,   setGenerated]   = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [logoData,    setLogoData]    = useState<string | null>(null)

  const frontRef      = useRef<HTMLDivElement>(null)
  const backRef       = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef   = useRef<HTMLDivElement>(null)

  // ── Bulk print state ────────────────────────────────────────────
  const [mode, setMode] = useState<'individual' | 'bulk'>('individual')
  const [bulkGrades, setBulkGrades] = useState<{id: string; name: string}[]>([])
  const [bulkSections, setBulkSections] = useState<{id: string; name: string}[]>([])
  const [bulkGradeId, setBulkGradeId] = useState('')
  const [bulkSectionId, setBulkSectionId] = useState('')
  const [bulkStudents, setBulkStudents] = useState<Array<{card: CardState; n1: string; n2: string}>>([])
  const [bulkPage, setBulkPage] = useState(0)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkPrinting, setBulkPrinting] = useState(false)
  const BULK_PER_PAGE = 6

  // Load logo
  useEffect(() => { if (logoUrl) toDataUrl(logoUrl).then(setLogoData) }, [logoUrl])

  // Click outside dropdown
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Load all people from DB
  useEffect(() => {
    async function load() {
      const list: PersonOption[] = []

      // ── Students ──────────────────────────────────────────────
      const { data: students } = await (supabase as any)
        .from('students')
        .select('id, nie, user_id, grade_level, section, profile:profiles!students_user_id_fkey(full_name, avatar_url)')
        .eq('is_active', true)
        .limit(500)

      // Load enrollments → sections → grades via separate queries (more reliable)
      const studentIds = (students ?? []).map((s: any) => s.id)
      let gradeByStudent: Record<string, string> = {}
      if (studentIds.length > 0) {
        // Get current school year first, fallback to any
        const { data: syData } = await (supabase as any)
          .from('school_years').select('id').eq('is_current', true).maybeSingle()

        let enrData: any[] = []
        if (syData) {
          const { data } = await (supabase as any)
            .from('enrollments').select('student_id, section_id')
            .eq('school_year_id', syData.id).in('student_id', studentIds).limit(1000)
          enrData = data ?? []
        }
        if (enrData.length === 0) {
          const { data } = await (supabase as any)
            .from('enrollments').select('student_id, section_id')
            .in('student_id', studentIds).limit(1000)
          enrData = data ?? []
        }

        // Get sections + grades
        const sectionIds = Array.from(new Set(enrData.map((e: any) => e.section_id))) as string[]
        if (sectionIds.length > 0) {
          const { data: secData } = await (supabase as any)
            .from('sections').select('id, name, grade_id').in('id', sectionIds)
          const gradeIds = Array.from(new Set((secData ?? []).map((s: any) => s.grade_id))) as string[]
          const { data: gradeData } = gradeIds.length > 0
            ? await (supabase as any).from('grades').select('id, name').in('id', gradeIds)
            : { data: [] }

          const secMap   = new Map((secData   ?? []).map((s: any) => [s.id, s]))
          const gradeMap = new Map((gradeData ?? []).map((g: any) => [g.id, g]))

          for (const e of enrData) {
            if (gradeByStudent[e.student_id]) continue
            const sec   = secMap.get(e.section_id) as any
            const grade = sec ? gradeMap.get(sec.grade_id) as any : null
            if (grade?.name) gradeByStudent[e.student_id] = grade.name
          }
        }
      }

      if (students) {
        for (const s of students) {
          const p     = (s.profile as any) ?? {}
          const gName = gradeByStudent[s.id] ?? s.grade_level ?? ''
          list.push({
            id:        s.id,
            name:      p.full_name ?? 'Sin nombre',
            type:      'student',
            photoUrl:  p.avatar_url ?? null,
            nie:       s.nie ?? '',
            gradeName: gName,
            cycleName: getCycle(gName),
            roleLabel: 'ESTUDIANTE',
          })
        }
      }

      // ── Staff NIP maps — sin filtro is_active para no perder registros con NULL ──
      // (el filtro .neq('is_active',false) excluye filas con is_active IS NULL en SQL)
      const { data: staffAll } = await (supabase as any)
        .from('staff')
        .select('id, full_name, nip, user_id')

      const staffNipByUserId = new Map<string, string>()
      const staffNipByName   = new Map<string, string>()
      if (staffAll) {
        for (const s of staffAll) {
          const sName = ((s as any).full_name ?? '').trim()
          if (s.user_id && s.nip) staffNipByUserId.set(s.user_id, s.nip)
          if (sName && s.nip) {
            staffNipByName.set(normName(sName), s.nip)
            const words = normName(sName).split(' ')
            if (words.length >= 2) staffNipByName.set(words.slice(0, 2).join(' '), s.nip)
          }
        }
      }

      // ── Staff activo → lista de personas (con foto vía profiles) ────────────
      const { data: staff } = await (supabase as any)
        .from('staff')
        .select('id, full_name, position, nip, user_id, profile:profiles(full_name, avatar_url)')
        .neq('is_active', false)

      if (staff) {
        for (const s of staff) {
          const directName  = ((s as any).full_name ?? '').trim()
          const p = (s.profile as any) ?? {}
          list.push({
            id:        `staff-${s.id}`,
            name:      directName || p.full_name || 'Sin nombre',
            type:      'staff',
            photoUrl:  p.avatar_url ?? null,
            nip:       (s as any).nip ?? '',
            roleLabel: ((s.position as string) ?? 'PERSONAL').toUpperCase(),
          })
        }
      }

      // ── Teachers (docentes) ────────────────────────────────────
      const { data: teachers } = await (supabase as any)
        .from('teachers')
        .select('id, nip, user_id, profile:profiles(full_name, avatar_url)')
        .neq('is_active', false)

      // Load homeroom sections + grades for teachers
      const { data: homeroomSections } = await (supabase as any)
        .from('sections')
        .select('id, grade_id, homeroom_teacher_id')
        .not('homeroom_teacher_id', 'is', null)
      // Load ALL grades with sort_order (needed for range computation)
      const { data: allGrades } = await (supabase as any)
        .from('grades').select('id, name, sort_order').order('sort_order')
      const allGradeById = new Map<string, { name: string; sort_order: number }>(
        (allGrades ?? []).map((g: any) => [g.id as string, { name: g.name as string, sort_order: g.sort_order as number }])
      )
      const homeroomGradeIds = Array.from(new Set((homeroomSections ?? []).map((s: any) => s.grade_id as string))).filter(Boolean)
      const gradeNameMap = new Map<string, string>()
      for (const gid of homeroomGradeIds) {
        const g = allGradeById.get(gid as string)
        if (g) gradeNameMap.set(gid as string, g.name)
      }
      const homeroomByTeacher = new Map<string, string>()
      for (const s of (homeroomSections ?? [])) {
        const gradeName = gradeNameMap.get(s.grade_id) ?? ''
        if (gradeName) homeroomByTeacher.set(s.homeroom_teacher_id, gradeName)
      }

      // For teachers WITHOUT homeroom → compute grade range from their assignments
      const noHomeroomIds = (teachers ?? [])
        .filter((t: any) => !homeroomByTeacher.has(t.id))
        .map((t: any) => t.id as string)
      const teacherRangeGrade = new Map<string, string>()
      const teacherRangeCycle = new Map<string, string>()
      if (noHomeroomIds.length > 0) {
        // Try is_current first, fallback to is_active (same pattern as assignments page)
        let syId: string | null = null
        const { data: syCurr } = await (supabase as any)
          .from('school_years').select('id').eq('is_current', true).maybeSingle()
        if (syCurr) { syId = syCurr.id } else {
          const { data: syAct } = await (supabase as any)
            .from('school_years').select('id').eq('is_active', true).limit(1)
          syId = (syAct as any[])?.[0]?.id ?? null
        }
        if (syId) {
          // Step 1: get grade_subject_id for each assignment
          const { data: rangeAssign } = await (supabase as any)
            .from('teacher_assignments')
            .select('teacher_id, grade_subject_id')
            .in('teacher_id', noHomeroomIds)
            .eq('school_year_id', syId)
          if (rangeAssign && rangeAssign.length > 0) {
            // Step 2: map grade_subject_id → grade_id
            const gsIds = (rangeAssign as any[]).map((ta: any) => ta.grade_subject_id as string)
            const { data: gsData } = await (supabase as any)
              .from('grade_subjects').select('id, grade_id').in('id', gsIds)
            const gsGradeMap = new Map<string, string>(
              (gsData ?? []).map((gs: any) => [gs.id as string, gs.grade_id as string])
            )
            // Per-teacher: track min/max grade by sort_order
            const perTeacher = new Map<string, { minOrder: number; minName: string; maxOrder: number; maxName: string }>()
            for (const ta of (rangeAssign as any[])) {
              const gradeId = gsGradeMap.get(ta.grade_subject_id as string)
              if (!gradeId) continue
              const grade = allGradeById.get(gradeId)
              if (!grade) continue
              const tid = ta.teacher_id as string
              const cur = perTeacher.get(tid)
              if (!cur) {
                perTeacher.set(tid, { minOrder: grade.sort_order, minName: grade.name, maxOrder: grade.sort_order, maxName: grade.name })
              } else {
                if (grade.sort_order < cur.minOrder) { cur.minOrder = grade.sort_order; cur.minName = grade.name }
                if (grade.sort_order > cur.maxOrder) { cur.maxOrder = grade.sort_order; cur.maxName = grade.name }
              }
            }
            for (const [tid, r] of Array.from(perTeacher.entries())) {
              const gradeLabel = r.minName === r.maxName ? r.minName : `${r.minName} – ${r.maxName}`
              const cycleFrom  = getCycle(r.minName)
              const cycleTo    = getCycle(r.maxName)
              const cycleLabel = cycleFrom === cycleTo ? cycleFrom : `${cycleFrom} – ${cycleTo}`
              teacherRangeGrade.set(tid, gradeLabel)
              teacherRangeCycle.set(tid, cycleLabel)
            }
          }
        }
      }

      if (teachers) {
        for (const t of teachers) {
          const p = (t.profile as any) ?? {}
          const gName = homeroomByTeacher.get(t.id) ?? teacherRangeGrade.get(t.id) ?? ''
          const cName = homeroomByTeacher.has(t.id)
            ? (gName ? getCycle(gName) : '')
            : (teacherRangeCycle.get(t.id) ?? (gName ? getCycle(gName) : ''))
          // NIP: teacher's own → staff by user_id → staff by normalized full name
          //      → staff by first 2 words (handles "Carlos Denilson" vs "Carlos Denilson Avilés Clavel")
          const tName = (p.full_name ?? '').trim()
          const tNorm = normName(tName)
          const tShort = tNorm.split(' ').slice(0, 2).join(' ')
          const nip = (t as any).nip
            || staffNipByUserId.get((t as any).user_id)
            || staffNipByName.get(tNorm)
            || staffNipByName.get(tShort)
            || ''
          list.push({
            id:        `teacher-${t.id}`,
            name:      p.full_name ?? 'Sin nombre',
            type:      'staff',
            photoUrl:  p.avatar_url ?? null,
            nip,
            gradeName: gName,
            cycleName: cName,
            roleLabel: 'DOCENTE',
          })
        }
      }

      // Deduplicate by name+type — merge to keep NIP and prefer DOCENTE role
      const merged = new Map<string, PersonOption>()
      for (const p of list) {
        const key = `${p.type}-${p.name}`
        if (!merged.has(key)) {
          merged.set(key, { ...p })
        } else {
          const ex = merged.get(key)!
          if (!ex.nip && p.nip)             ex.nip       = p.nip
          if (p.roleLabel === 'DOCENTE')    ex.roleLabel = 'DOCENTE'
          if (!ex.gradeName && p.gradeName) ex.gradeName = p.gradeName
          if (!ex.cycleName && p.cycleName) ex.cycleName = p.cycleName
        }
      }
      const deduped = Array.from(merged.values())

      setPeople(deduped.sort((a, b) => a.name.localeCompare(b.name)))
      setDbReady(true)
    }
    load()
  }, [])

  // Load grades when switching to bulk mode (sorted in school order)
  useEffect(() => {
    if (mode !== 'bulk' || bulkGrades.length > 0) return
    ;(supabase as any).from('grades').select('id, name')
      .then(({ data }: any) => {
        const sorted = (data ?? []).slice().sort((a: any, b: any) => gradeSort(a.name, b.name))
        setBulkGrades(sorted)
      })
  }, [mode, bulkGrades.length])

  // Load sections when grade changes
  useEffect(() => {
    if (!bulkGradeId) return
    setBulkSections([])
    setBulkSectionId('')
    setBulkStudents([])
    ;(supabase as any).from('sections').select('id, name').eq('grade_id', bulkGradeId).order('name')
      .then(({ data }: any) => setBulkSections(data ?? []))
  }, [bulkGradeId])

  const filtered = useMemo(() => {
    const byTab = people.filter(p => p.type === activeTab)
    const q = search.trim().toLowerCase()
    if (!q) return byTab
    return byTab.filter(p => p.name.toLowerCase().includes(q))
  }, [people, search, activeTab])

  const handleSelect = useCallback(async (person: PersonOption) => {
    setSelected(person)
    setSearch(person.name)
    setShowDropdown(false)
    setPhotoOver(null)
    setGenerated(false)

    let photo: string | null = null
    if (person.photoUrl) photo = await toDataUrl(person.photoUrl)

    setCard({
      photo,
      fullName:  person.name,
      nie:       person.nie ?? '',
      nip:       person.nip ?? '',
      grade:     person.gradeName ?? '',
      cycle:     person.cycleName ?? '',
      roleLabel: person.roleLabel,
      year:      String(new Date().getFullYear()),
      isStudent: person.type === 'student',
    })
  }, [])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onloadend = () => {
      const data = r.result as string
      setPhotoOver(data)
      setCard(p => ({ ...p, photo: data }))
    }
    r.readAsDataURL(file)
  }

  const handleGenerate = () => {
    if (!selected) { alert('Selecciona un estudiante o miembro del personal'); return }
    setGenerated(true)
  }

  // ── Export: capture the live HTML card using html-to-image ───────
  const handleDownload = async () => {
    if (!frontRef.current || !backRef.current) return
    setDownloading(true)
    try {
      const opt = { pixelRatio: 2, cacheBust: true, fetchRequestInit: { cache: 'no-cache' } } as const
      const frontSrc = await toPng(frontRef.current, opt)
      const backSrc  = await toPng(backRef.current, opt)
      const loadImg  = (src: string) => new Promise<HTMLImageElement>(res => {
        const i = new Image(); i.onload = () => res(i); i.src = src
      })
      const [fi, bi] = await Promise.all([loadImg(frontSrc), loadImg(backSrc)])
      // Same layout as bulk download: front | back side by side, 1 row
      const CW = 680, CH = 1078, PAD = 18
      const cv = document.createElement('canvas')
      cv.width  = 2 * CW + 3 * PAD
      cv.height = CH + 2 * PAD
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.drawImage(fi, PAD,          PAD, CW, CH)
      ctx.drawImage(bi, PAD * 2 + CW, PAD, CW, CH)
      const a   = document.createElement('a')
      a.download = `carnet-${card.nie || card.nip || card.fullName.split(' ')[0] || 'id'}.png`
      a.href     = cv.toDataURL('image/png', 1.0)
      a.click()
    } finally { setDownloading(false) }
  }

  const [printing, setPrinting] = useState(false)
  const handlePrintSingle = async () => {
    if (!frontRef.current || !backRef.current) return
    setPrinting(true)
    try {
      const opt = { pixelRatio: 2, cacheBust: true, fetchRequestInit: { cache: 'no-cache' } } as const
      const frontSrc = await toPng(frontRef.current, opt)
      const backSrc  = await toPng(backRef.current, opt)
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{margin:8mm}*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{background:white}
      .grid{display:grid;grid-template-columns:repeat(2,55mm);gap:4mm;justify-content:center}
      .carnet{width:55mm;height:85mm;break-inside:avoid;overflow:hidden;border-radius:2.5mm}
      .carnet img{width:100%;height:100%;display:block;object-fit:fill}
      </style></head><body><div class="grid">
      <div class="carnet"><img src="${frontSrc}" /></div>
      <div class="carnet"><img src="${backSrc}" /></div>
      </div>
      <script>window.addEventListener('load',()=>{setTimeout(()=>{window.print()},300)})</script>
      </body></html>`
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
    } finally { setPrinting(false) }
  }

  const loadBulkStudents = async () => {
    if (!bulkSectionId) return
    setBulkLoading(true)
    setBulkStudents([])
    try {
      const { data: sy } = await (supabase as any).from('school_years').select('id').eq('is_current', true).maybeSingle()
      let enrQ = (supabase as any).from('enrollments').select('student_id').eq('section_id', bulkSectionId)
      if (sy) enrQ = enrQ.eq('school_year_id', sy.id)
      const { data: enrs } = await enrQ
      if (!enrs || enrs.length === 0) { setBulkLoading(false); return }
      const ids = enrs.map((e: any) => e.student_id)
      // Use explicit FK for profiles join (same pattern as main students query)
      const { data: students } = await (supabase as any)
        .from('students')
        .select('id, nie, profile:profiles!students_user_id_fkey(full_name, avatar_url)')
        .in('id', ids)
      // Get grade name via separate queries (nested join unreliable)
      const { data: sec } = await (supabase as any)
        .from('sections').select('id, name, grade_id').eq('id', bulkSectionId).maybeSingle()
      let gradeName = ''
      if (sec?.grade_id) {
        const { data: gr } = await (supabase as any)
          .from('grades').select('name').eq('id', sec.grade_id).maybeSingle()
        gradeName = gr?.name ?? ''
      }
      const result: Array<{card: CardState; n1: string; n2: string}> = []
      for (const s of (students ?? [])) {
        const p = (s.profile as any) ?? {}
        let photo: string | null = null
        if (p.avatar_url) { try { photo = await toDataUrl(p.avatar_url) } catch {} }
        const fullName = p.full_name ?? 'Sin nombre'
        const [sn1, sn2] = splitName(fullName)
        result.push({
          card: { photo, fullName, nie: s.nie ?? '', nip: '', grade: gradeName, cycle: getCycle(gradeName), roleLabel: 'ESTUDIANTE', year: String(new Date().getFullYear()), isStudent: true },
          n1: sn1, n2: sn2,
        })
      }
      result.sort((a, b) => a.card.fullName.localeCompare(b.card.fullName))
      setBulkStudents(result)
      setBulkPage(0)
    } finally { setBulkLoading(false) }
  }

  // Captura frente y reverso de todos los estudiantes (función compartida)
  // Layout resultado: [{front, back}, ...] — el reverso es igual para todos
  const captureAllBulkCards = async (): Promise<Array<{front: string; back: string}>> => {
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;z-index:-1'
    document.body.appendChild(container)
    const roots: ReturnType<typeof createRoot>[] = []

    // Renderizar todos los frentes
    const frontWrappers: HTMLDivElement[] = []
    for (const { card: c, n1: ln1, n2: ln2 } of bulkStudents) {
      const w = document.createElement('div')
      w.style.cssText = 'display:inline-block;line-height:0'
      container.appendChild(w)
      frontWrappers.push(w)
      const r = createRoot(w); r.render(<CardFrontBulk card={c} n1={ln1} n2={ln2} />); roots.push(r)
    }

    // Renderizar el reverso una sola vez (es igual para todos)
    const backWrapper = document.createElement('div')
    backWrapper.style.cssText = 'display:inline-block;line-height:0'
    container.appendChild(backWrapper)
    const backRoot = createRoot(backWrapper)
    backRoot.render(<CardBack card={bulkStudents[0].card} logoUrl={null} />)
    roots.push(backRoot)

    await new Promise(resolve => setTimeout(resolve, 800))

    const opt = { pixelRatio: 2, cacheBust: true, fetchRequestInit: { cache: 'no-cache' } } as const
    const fronts = await Promise.all(frontWrappers.map(w => toPng(w.firstChild as HTMLElement, opt)))
    const backSrc = await toPng(backWrapper.firstChild as HTMLElement, opt)

    roots.forEach(r => r.unmount())
    document.body.removeChild(container)
    return fronts.map(front => ({ front, back: backSrc }))
  }

  // Imprime frente+reverso — cada fila: [Frente | Reverso] del mismo alumno
  const handlePrintAll = async () => {
    if (bulkStudents.length === 0) return
    setBulkPrinting(true)
    try {
      const pairs = await captureAllBulkCards()
      // Cada fila tiene frente a la izquierda y reverso a la derecha
      const cardsHtml = pairs.map(({ front, back }) =>
        `<div class="carnet"><img src="${front}" /></div><div class="carnet"><img src="${back}" /></div>`
      ).join('')
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{margin:8mm}*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{background:white}
      .grid{display:grid;grid-template-columns:repeat(2,55mm);gap:4mm;justify-content:center;row-gap:3mm}
      .carnet{width:55mm;height:85mm;break-inside:avoid;overflow:hidden;border-radius:2.5mm}
      .carnet img{width:100%;height:100%;display:block;object-fit:fill}
      </style></head><body><div class="grid">${cardsHtml}</div>
      <script>window.addEventListener('load',()=>{setTimeout(()=>{window.print()},300)})</script>
      </body></html>`
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
    } finally {
      setBulkPrinting(false)
    }
  }

  // Descarga páginas PNG para imprenta — 3 alumnos por página
  // Cada fila: [Frente | Reverso] del mismo alumno
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const handleDownloadPages = async () => {
    if (bulkStudents.length === 0) return
    setBulkDownloading(true)
    try {
      const pairs = await captureAllBulkCards()
      const loadImg = (src: string) => new Promise<HTMLImageElement>(res => {
        const i = new Image(); i.onload = () => res(i); i.src = src
      })
      // Cargar todas las imágenes
      const loaded = await Promise.all(pairs.map(async ({ front, back }) => ({
        front: await loadImg(front),
        back:  await loadImg(back),
      })))
      // Canvas: 2 columnas (frente+reverso), 3 filas por página
      const CW = 680, CH = 1078, PAD = 18, ROWS = 3
      const canvasW = 2 * CW + 3 * PAD
      const canvasH = ROWS * CH + (ROWS + 1) * PAD
      const totalPages = Math.ceil(loaded.length / ROWS)
      const gradeName = bulkStudents[0]?.card.grade || 'seccion'
      const gradeSlug = gradeName.replace(/\s+/g, '-').toLowerCase()
      for (let p = 0; p < totalPages; p++) {
        const cv = document.createElement('canvas')
        cv.width = canvasW; cv.height = canvasH
        const ctx = cv.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvasW, canvasH)
        loaded.slice(p * ROWS, (p + 1) * ROWS).forEach(({ front, back }, row) => {
          const y = PAD + row * (CH + PAD)
          ctx.drawImage(front, PAD,          y, CW, CH)
          ctx.drawImage(back,  PAD * 2 + CW, y, CW, CH)
        })
        const a = document.createElement('a')
        a.download = `carnets-${gradeSlug}-pag${p + 1}.png`
        a.href = cv.toDataURL('image/png', 1.0)
        a.click()
        await new Promise(r => setTimeout(r, 400))
      }
    } finally {
      setBulkDownloading(false)
    }
  }

  const effectiveLogo = logoData || logoUrl
  const [n1, n2]      = splitName(card.fullName)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4" /> Regresar
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="page-title">Carnet Estudiantil</h1>
            <p className="page-subtitle">Generador de identificaciones digitales</p>
          </div>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit">
        <button onClick={() => setMode('individual')} className={`px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors ${mode === 'individual' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
          <CreditCard className="w-4 h-4" /> Individual
        </button>
        <button onClick={() => setMode('bulk')} className={`px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors ${mode === 'bulk' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
          <Printer className="w-4 h-4" /> Imprimir por Sección
        </button>
      </div>

      {mode === 'individual' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── FORM ── */}
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <Wand2 className="w-4 h-4 text-sky-600" /> Seleccionar persona
          </h2>

          {/* Type tabs */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {([
              { type: 'student' as PersonType, label: '🎓 Estudiantes', count: people.filter(p => p.type === 'student').length },
              { type: 'staff'   as PersonType, label: '👤 Personal',    count: people.filter(p => p.type === 'staff').length   },
            ] as const).map(tab => (
              <button
                key={tab.type}
                onClick={() => { setActiveTab(tab.type); setSearch(''); setSelected(null); setGenerated(false) }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                  activeTab === tab.type
                    ? 'bg-sky-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab.label}
                {dbReady && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.type ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Person search / dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                className="input w-full pl-9"
                placeholder={dbReady ? `Buscar ${activeTab === 'student' ? 'estudiante' : 'personal'}...` : 'Cargando...'}
                value={search}
                disabled={!dbReady}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelected(null); setGenerated(false) }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>

            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                {filtered.map(person => (
                  <button
                    key={person.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-sky-50 transition-colors flex items-center gap-3"
                    onMouseDown={() => handleSelect(person)}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {person.photoUrl
                        ? <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-white text-xs font-bold">{person.name.charAt(0)}</span>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{person.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {person.type === 'student'
                          ? [person.nie && `NIE ${person.nie}`, person.gradeName].filter(Boolean).join(' · ')
                          : person.roleLabel
                        }
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && search.trim() && filtered.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-center text-sm text-slate-400">
                No se encontraron resultados para &ldquo;{search}&rdquo;
              </div>
            )}
          </div>

          {/* Selected person panel */}
          {selected && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">

              {/* Avatar + summary */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shrink-0">
                  {card.photo
                    ? <img src={card.photo} alt="" className="w-full h-full object-cover" />
                    : <User className="w-6 h-6 text-white" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{selected.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.type === 'student'
                      ? `${selected.gradeName || 'Sin grado asignado'}${selected.nie ? ` · NIE ${selected.nie}` : ''}`
                      : selected.roleLabel
                    }
                  </p>
                  {!card.photo && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">Sin foto en el perfil</p>
                  )}
                </div>
              </div>

              {/* Photo upload */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">
                  {card.photo ? 'Foto del perfil · puedes reemplazarla' : 'Sube la foto para el carnet'}
                </p>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-600 transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  {photoOver ? 'Cambiar foto' : (card.photo ? 'Usar otra foto' : 'Subir foto')}
                </button>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
              </div>

              {/* Year */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Año del carnet</label>
                <input
                  type="number" min={2020} max={2100}
                  className="input text-sm py-2 w-28"
                  value={card.year}
                  onChange={e => setCard(p => ({ ...p, year: e.target.value }))}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!selected}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-4 h-4" /> Generar Carnet
          </button>
        </div>

        {/* ── PREVIEW ── */}
        <div>
          {!generated ? (
            <div className="card p-12 flex flex-col items-center justify-center text-center gap-4 min-h-[400px]">
              <CreditCard className="w-16 h-16 text-slate-200" />
              <div>
                <p className="text-slate-500 font-medium">Vista previa del carnet</p>
                <p className="text-slate-400 text-sm mt-1">Busca y selecciona una persona, luego haz clic en &ldquo;Generar Carnet&rdquo;</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600">Vista previa · Frente y Reverso</p>
                <div className="flex gap-2">
                  <button onClick={() => setGenerated(false)} className="btn-secondary text-sm">
                    <RefreshCw className="w-4 h-4" /> Cambiar
                  </button>
                  <button onClick={handlePrintSingle} disabled={printing || downloading} className="btn-secondary text-sm">
                    <Printer className="w-4 h-4" />
                    {printing ? 'Preparando...' : 'Imprimir'}
                  </button>
                  <button onClick={handleDownload} disabled={downloading || printing} className="btn-primary text-sm">
                    <Download className="w-4 h-4" />
                    {downloading ? 'Exportando...' : 'Descargar PNG'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center gap-6 overflow-x-auto pb-4">
                <div>
                  <p className="text-xs text-slate-400 text-center mb-2 font-medium uppercase tracking-wider">Frente</p>
                  <div ref={frontRef} style={{ display: 'inline-block', lineHeight: 0 }}>
                    <CardFront card={card} n1={n1} n2={n2} logoUrl={effectiveLogo} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 text-center mb-2 font-medium uppercase tracking-wider">Reverso</p>
                  <div ref={backRef} style={{ display: 'inline-block', lineHeight: 0 }}>
                    <CardBack card={card} logoUrl={effectiveLogo} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
      )}

      {mode === 'bulk' && (
        <div className="space-y-6">
          {/* Section selector */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-sky-600" /> Seleccionar Sección
            </h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Grado</label>
                <select className="input text-sm" value={bulkGradeId} onChange={e => setBulkGradeId(e.target.value)}>
                  <option value="">Seleccionar grado...</option>
                  {bulkGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Sección</label>
                <select className="input text-sm" value={bulkSectionId} onChange={e => setBulkSectionId(e.target.value)} disabled={!bulkGradeId}>
                  <option value="">Seleccionar sección...</option>
                  {bulkSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={loadBulkStudents} disabled={!bulkSectionId || bulkLoading} className="btn-primary disabled:opacity-40">
                {bulkLoading ? 'Cargando...' : 'Cargar Estudiantes'}
              </button>
              {bulkStudents.length > 0 && (
                <>
                  <button onClick={handlePrintAll} disabled={bulkPrinting || bulkDownloading} className="btn-secondary">
                    <Printer className="w-4 h-4" /> {bulkPrinting ? 'Preparando...' : `Imprimir Todo (${bulkStudents.length})`}
                  </button>
                  <button onClick={handleDownloadPages} disabled={bulkDownloading || bulkPrinting} className="btn-primary">
                    <Download className="w-4 h-4" /> {bulkDownloading ? 'Generando...' : 'Descargar Páginas PNG'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Preview grid */}
          {bulkStudents.length > 0 && (() => {
            const totalPages = Math.ceil(bulkStudents.length / BULK_PER_PAGE)
            const pageStudents = bulkStudents.slice(bulkPage * BULK_PER_PAGE, (bulkPage + 1) * BULK_PER_PAGE)
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600 font-medium">{bulkStudents.length} estudiantes · Página {bulkPage + 1} de {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBulkPage(p => Math.max(0, p - 1))} disabled={bulkPage === 0} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setBulkPage(p => Math.min(totalPages - 1, p + 1))} disabled={bulkPage >= totalPages - 1} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {pageStudents.map((s, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center', height: 296, marginBottom: -10 }}>
                        <CardFrontBulk card={s.card} n1={s.n1} n2={s.n2} />
                      </div>
                      <p className="text-xs text-slate-500 text-center font-medium">{s.card.fullName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {bulkStudents.length === 0 && !bulkLoading && bulkSectionId && (
            <div className="card p-10 text-center text-slate-400 text-sm">No se encontraron estudiantes en esta sección.</div>
          )}
        </div>
      )}

    </div>
  )
}
