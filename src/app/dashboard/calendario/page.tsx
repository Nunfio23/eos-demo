'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Plus, X,
  Edit2, Trash2, Download, Settings2, ArrowLeft,
} from 'lucide-react'

// ── Category system (matches PDF legend) ──────────────────────────────────────
const CATEGORIES = [
  { id: 'educativa',      label: 'Actividades Educativas',       color: '#10b981', hex: 'bg-emerald-500' },
  { id: 'complementaria', label: 'Actividades Complementarias',  color: '#8b5cf6', hex: 'bg-violet-500'  },
  { id: 'evaluacion',     label: 'Evaluaciones',                 color: '#f59e0b', hex: 'bg-amber-400'   },
  { id: 'importante',     label: 'Importantes / Asueto',         color: '#ef4444', hex: 'bg-red-500'     },
  { id: 'reunion',        label: 'Reunión de Padres',            color: '#06b6d4', hex: 'bg-cyan-500'    },
  { id: 'campamento',     label: 'Campamento / Salida',          color: '#f97316', hex: 'bg-orange-500'  },
  { id: 'pago',           label: 'Pago Mensualidad',             color: '#fbbf24', hex: 'bg-yellow-400'  },
]
function getCat(color: string) {
  return CATEGORIES.find(c => c.color === color) ?? CATEGORIES[0]
}

// ── Official 2026 seed — fechas del PDF oficial del colegio ───────────────────
const SEED_2026: Array<{ title: string; start: string; end: string; color: string }> = [
  // ENERO (Jan 1 = Jueves)
  { title: 'Inicio de labores administrativas', start: '2026-01-05', end: '2026-01-05', color: '#10b981' }, // Lunes 5
  { title: 'Inicio de labores docentes',        start: '2026-01-15', end: '2026-01-15', color: '#10b981' }, // Jueves 15
  { title: 'Capacitación docente',              start: '2026-01-16', end: '2026-01-23', color: '#f59e0b' }, // 16 al 23
  { title: 'Preparación primer día de clases',  start: '2026-01-24', end: '2026-01-24', color: '#ef4444' }, // Sábado 24
  { title: 'Inicio de clases 2026',             start: '2026-01-27', end: '2026-01-27', color: '#10b981' }, // Martes 27
  { title: 'Semana de inducción',               start: '2026-01-27', end: '2026-01-30', color: '#8b5cf6' }, // 27 al 30
  // FEBRERO (Feb 1 = Domingo)
  { title: '📋 MINED: Prueba Conociendo Mis Logros', start: '2026-02-09', end: '2026-02-20', color: '#dc2626' }, // 9–20 Feb — MINED obligatorio
  { title: 'Pago de mensualidad',              start: '2026-02-02', end: '2026-02-02', color: '#fbbf24' }, // Lunes 2
  { title: '1ra Reunión de Padres',            start: '2026-02-07', end: '2026-02-07', color: '#06b6d4' }, // Sábado 7
  { title: 'Celebración Día de la Amistad',   start: '2026-02-13', end: '2026-02-13', color: '#10b981' }, // Viernes 13
  { title: '3° Aniversario Oficial Tesla',    start: '2026-02-15', end: '2026-02-15', color: '#10b981' }, // Domingo 15
  { title: 'Celebración Aniversario Tesla',   start: '2026-02-16', end: '2026-02-16', color: '#10b981' }, // Lunes 16
  { title: 'Semana de Laboratorios',          start: '2026-02-23', end: '2026-02-26', color: '#8b5cf6' }, // 23 al 26
  { title: 'Concurso de Matemática',          start: '2026-02-27', end: '2026-02-27', color: '#f97316' }, // Viernes 27
  // MARZO (Mar 1 = Domingo)
  { title: 'Pago de mensualidad',             start: '2026-03-01', end: '2026-03-01', color: '#fbbf24' }, // Domingo 1
  { title: 'Semana de exámenes',              start: '2026-03-02', end: '2026-03-06', color: '#f59e0b' }, // 2 al 6
  { title: 'Entrega de notas',                start: '2026-03-13', end: '2026-03-13', color: '#f59e0b' }, // Viernes 13
  { title: 'Día del Agua',                    start: '2026-03-22', end: '2026-03-22', color: '#10b981' }, // Domingo 22
  { title: 'Celebración Día del Agua',        start: '2026-03-23', end: '2026-03-23', color: '#10b981' }, // Lunes 23
  { title: 'Salida educativa Ruinas de San Andrés', start: '2026-03-27', end: '2026-03-27', color: '#f97316' }, // Viernes 27
  { title: 'Vacaciones Semana Santa',         start: '2026-03-29', end: '2026-04-06', color: '#ef4444' }, // 29 Mar al 6 Abr
  // ABRIL (Abr 1 = Miércoles)
  { title: 'Pago de Mensualidad',             start: '2026-04-01', end: '2026-04-01', color: '#fbbf24' }, // Miércoles 1
  { title: 'Retorno a clases',                start: '2026-04-07', end: '2026-04-07', color: '#10b981' }, // Martes 7
  { title: 'Exámenes I, II y III Ciclo',      start: '2026-04-07', end: '2026-04-10', color: '#f59e0b' }, // 7 al 10
  { title: '2da Reunión de Padres',           start: '2026-04-11', end: '2026-04-11', color: '#06b6d4' }, // Sábado 11
  { title: 'Exámenes Bachillerato',           start: '2026-04-13', end: '2026-04-17', color: '#f59e0b' }, // 13 al 17
  { title: 'Entrega de notas',                start: '2026-04-18', end: '2026-04-18', color: '#f59e0b' }, // Sábado 18
  { title: 'Día del Libro — Salida BINAES',  start: '2026-04-23', end: '2026-04-23', color: '#f97316' }, // Jueves 23
  { title: '📋 MINED: Registro 1er Período Secundaria (SIGES)', start: '2026-04-23', end: '2026-04-24', color: '#dc2626' }, // 23–24 Abr — MINED
  { title: 'Exámenes Trimestrales',           start: '2026-04-27', end: '2026-04-30', color: '#f59e0b' }, // 27 al 30
  // MAYO (May 1 = Viernes)
  { title: 'Asueto Día del Trabajo',          start: '2026-05-01', end: '2026-05-01', color: '#ef4444' }, // Viernes 1
  { title: 'Pago de mensualidad',             start: '2026-05-01', end: '2026-05-01', color: '#fbbf24' }, // Viernes 1
  { title: 'Semana de exámenes',              start: '2026-05-04', end: '2026-05-08', color: '#f59e0b' }, // 4 al 8
  { title: 'Celebración Día de la Madre',    start: '2026-05-08', end: '2026-05-08', color: '#10b981' }, // Viernes 8
  { title: 'Asueto Día de las Madres',        start: '2026-05-11', end: '2026-05-11', color: '#ef4444' }, // Lunes 11
  { title: 'Entrega de notas',                start: '2026-05-15', end: '2026-05-15', color: '#f59e0b' }, // Viernes 15
  { title: 'Concurso de Teatro',              start: '2026-05-14', end: '2026-05-14', color: '#8b5cf6' }, // Jueves 14
  { title: 'TESLA STAR CUP',                 start: '2026-05-22', end: '2026-05-22', color: '#f97316' }, // Viernes 22
  { title: 'Día libre (intramuros)',          start: '2026-05-25', end: '2026-05-25', color: '#ef4444' }, // Lunes 25
  { title: '📋 MINED: Registro 1er Trimestre Primaria/Parvularia (SIGES)', start: '2026-05-07', end: '2026-05-08', color: '#dc2626' }, // 7–8 May — MINED
  { title: '📋 MINED: Prueba AVANZO Cal. Norte (Bilingüe)', start: '2026-05-28', end: '2026-05-29', color: '#dc2626' }, // 28–29 May — MINED
  { title: 'Semana de Laboratorios',          start: '2026-05-26', end: '2026-05-29', color: '#8b5cf6' }, // 26 al 29
  // JUNIO (Jun 1 = Lunes)
  { title: 'Semana de exámenes',              start: '2026-06-01', end: '2026-06-05', color: '#f59e0b' }, // 1 al 5
  { title: 'Pago de mensualidad',             start: '2026-06-01', end: '2026-06-01', color: '#fbbf24' }, // Lunes 1
  { title: '3ra Reunión de Padres',           start: '2026-06-06', end: '2026-06-06', color: '#06b6d4' }, // Sábado 6
  { title: 'Entrega de notas',                start: '2026-06-06', end: '2026-06-06', color: '#f59e0b' }, // Sábado 6
  { title: 'Desfile de Reciclaje',            start: '2026-06-12', end: '2026-06-12', color: '#10b981' }, // Viernes 12
  { title: 'Asueto Día del Padre',            start: '2026-06-16', end: '2026-06-16', color: '#ef4444' }, // Martes 16
  { title: 'Celebración Día del Maestro y el Padre', start: '2026-06-19', end: '2026-06-19', color: '#10b981' }, // Viernes 19
  { title: 'Asueto Día del Maestro',          start: '2026-06-22', end: '2026-06-22', color: '#ef4444' }, // Lunes 22
  { title: 'Exámenes II Periodo Bachillerato',start: '2026-06-23', end: '2026-06-25', color: '#f59e0b' }, // 23 al 25
  { title: 'Spelling Bee Contest',            start: '2026-06-26', end: '2026-06-26', color: '#8b5cf6' }, // Viernes 26
  { title: 'Exámenes II Periodo Bachillerato',start: '2026-06-29', end: '2026-06-29', color: '#f59e0b' }, // Lunes 29
  // JULIO (Jul 1 = Miércoles)
  { title: '📋 MINED: Registro 2do Período Secundaria (SIGES)', start: '2026-07-01', end: '2026-07-03', color: '#dc2626' }, // 1–3 Jul — MINED
  { title: 'Exámenes I, II y III Ciclo',      start: '2026-07-01', end: '2026-07-02', color: '#f59e0b' }, // 1 al 2
  { title: 'USA Independence Day',            start: '2026-07-04', end: '2026-07-04', color: '#10b981' }, // Sábado 4
  { title: 'Entrega de notas',                start: '2026-07-10', end: '2026-07-10', color: '#f59e0b' }, // Viernes 10
  { title: 'Salida Educativa Parvularia a 6° Grado', start: '2026-07-17', end: '2026-07-17', color: '#f97316' }, // Viernes 17
  { title: 'Semana de Laboratorios',          start: '2026-07-20', end: '2026-07-23', color: '#8b5cf6' }, // 20 al 23
  { title: 'Exámenes II Trimestre',           start: '2026-07-24', end: '2026-07-30', color: '#f59e0b' }, // 24 al 30
  { title: 'Segundo Campamento',              start: '2026-07-31', end: '2026-08-01', color: '#f97316' }, // 31 Jul - 1 Ago
  // AGOSTO (Ago 1 = Sábado)
  { title: 'Vacaciones Agostinas',            start: '2026-08-01', end: '2026-08-08', color: '#ef4444' }, // 1 al 8
  { title: 'Entrega de notas II Trimestre',  start: '2026-08-10', end: '2026-08-10', color: '#f59e0b' }, // Lunes 10
  { title: '📋 MINED: Registro 2do Trimestre Primaria/Parvularia (SIGES)', start: '2026-08-13', end: '2026-08-14', color: '#dc2626' }, // 13–14 Ago — MINED
  { title: 'Expo Arte',                       start: '2026-08-14', end: '2026-08-14', color: '#10b981' }, // Viernes 14
  { title: '4ta Reunión de Padres',           start: '2026-08-15', end: '2026-08-15', color: '#06b6d4' }, // Sábado 15
  { title: 'Salida Educativa Saburo Hirao',  start: '2026-08-21', end: '2026-08-21', color: '#f97316' }, // Viernes 21
  { title: 'Semana de Laboratorios',          start: '2026-08-24', end: '2026-08-27', color: '#8b5cf6' }, // 24 al 27
  { title: 'Engineering / Science Fair',      start: '2026-08-28', end: '2026-08-28', color: '#10b981' }, // Viernes 28
  { title: 'Semana de exámenes',              start: '2026-08-31', end: '2026-09-04', color: '#f59e0b' }, // 31 Ago - 4 Sep
  // SEPTIEMBRE (Sep 1 = Martes)
  { title: 'Inicio Mes Cívico',               start: '2026-09-01', end: '2026-09-01', color: '#10b981' }, // Martes 1
  { title: 'Entrega de notas',                start: '2026-09-05', end: '2026-09-05', color: '#f59e0b' }, // Sábado 5
  { title: '4ta Reunión de Padres',           start: '2026-09-05', end: '2026-09-05', color: '#06b6d4' }, // Sábado 5
  { title: '📋 MINED: Registro 3er Período Secundaria (SIGES)', start: '2026-09-10', end: '2026-09-11', color: '#dc2626' }, // 10–11 Sep — MINED
  { title: 'Semana Cívica',                   start: '2026-09-08', end: '2026-09-14', color: '#10b981' }, // 8 al 14
  { title: 'Asueto Día de la Independencia', start: '2026-09-15', end: '2026-09-15', color: '#ef4444' }, // Martes 15
  { title: 'Día de la Biblia',                start: '2026-09-25', end: '2026-09-25', color: '#10b981' }, // Viernes 25
  { title: 'Semana de Laboratorios',          start: '2026-09-28', end: '2026-10-02', color: '#8b5cf6' }, // 28 Sep - 2 Oct
  // OCTUBRE (Oct 1 = Jueves)
  { title: '5ta Reunión de Padres',           start: '2026-10-03', end: '2026-10-03', color: '#06b6d4' }, // Sábado 3
  { title: 'Entrega de notas',                start: '2026-10-03', end: '2026-10-03', color: '#f59e0b' }, // Sábado 3
  { title: '1ra Vigilia',                     start: '2026-10-10', end: '2026-10-10', color: '#10b981' }, // Sábado 10
  { title: 'XPO — TESLA',                    start: '2026-10-14', end: '2026-10-16', color: '#f97316' }, // 14 al 16
  { title: 'Semana de Laboratorios',          start: '2026-10-19', end: '2026-10-23', color: '#8b5cf6' }, // 19 al 23
  { title: 'Exámenes finales',                start: '2026-10-26', end: '2026-10-30', color: '#f59e0b' }, // 26 al 30
  { title: '📋 MINED: Prueba AVANZO (Ordinaria)', start: '2026-10-28', end: '2026-10-29', color: '#dc2626' }, // 28–29 Oct — MINED
  // NOVIEMBRE (Nov 1 = Domingo)
  { title: 'Asueto',                          start: '2026-11-02', end: '2026-11-02', color: '#ef4444' }, // Lunes 2
  { title: '📋 MINED: Prueba AVANZO (Extraordinaria)', start: '2026-11-14', end: '2026-11-15', color: '#dc2626' }, // 14–15 Nov — MINED
  { title: 'Exámenes finales',                start: '2026-11-09', end: '2026-11-13', color: '#f59e0b' }, // 9 al 13
  { title: '📋 MINED: Registro 3er Trimestre Primaria/Parvularia (SIGES)', start: '2026-11-09', end: '2026-11-10', color: '#dc2626' }, // 9–10 Nov — MINED
  { title: '📋 MINED: Registro 4to Período Secundaria (SIGES)', start: '2026-11-16', end: '2026-11-17', color: '#dc2626' }, // 16–17 Nov — MINED
  { title: '📋 MINED: Matrícula 2027 (SIGES)', start: '2026-11-16', end: '2026-11-30', color: '#dc2626' }, // desde 16 Nov — MINED
  { title: 'Curso de recuperación',           start: '2026-11-16', end: '2026-11-27', color: '#8b5cf6' }, // 16 al 27
  { title: 'Curso de recuperación',           start: '2026-11-30', end: '2026-11-30', color: '#8b5cf6' }, // Lunes 30
  // DICIEMBRE (Dic 1 = Martes)
  { title: 'Curso de recuperación',           start: '2026-12-01', end: '2026-12-03', color: '#8b5cf6' }, // 1 al 3
  { title: 'Summer Camp',                     start: '2026-12-01', end: '2026-12-11', color: '#f97316' }, // 1 al 11
  { title: 'Clausura Parvularia — 3°',       start: '2026-12-04', end: '2026-12-04', color: '#10b981' }, // Viernes 4
  { title: 'Clausura 4° — Bachillerato',     start: '2026-12-04', end: '2026-12-04', color: '#10b981' }, // Viernes 4
  { title: 'Graduación PROMO',                start: '2026-12-11', end: '2026-12-11', color: '#10b981' }, // Viernes 11
  { title: 'Entrega de resultados finales',   start: '2026-12-11', end: '2026-12-11', color: '#f59e0b' }, // Viernes 11
]

// ── Types ──────────────────────────────────────────────────────────────────────
type AudienceType = 'all' | 'teachers' | 'admin' | 'parents' | 'students'

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  all_day: boolean
  audience: AudienceType
  grade_level: string | null
  section: string | null
  color: string
  location: string | null
  created_by: string
}

const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_EN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_LABEL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const emptyForm = {
  title: '', description: '', start_date: '', end_date: '',
  audience: 'all' as AudienceType, grade_level: '', color: '#10b981', location: '',
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CalendarioPage() {
  const router   = useRouter()
  const { profile } = useAuth()
  const isMaster = profile?.role === 'master'
  const canEdit  = !!profile?.role && ['master','direccion','administracion'].includes(profile.role)

  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents]   = useState<CalendarEvent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]       = useState(emptyForm)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [clickDay, setClickDay] = useState<string | null>(null)
  const [viewEvent, setViewEvent] = useState<CalendarEvent | null>(null)

  const loadMonth = useCallback(async () => {
    const from = `${year}-${String(month+1).padStart(2,'0')}-01`
    const lastDay = new Date(year, month+1, 0).getDate()
    const to   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    // Load events that overlap with this month (start <= month_end AND end >= month_start)
    const { data } = await (supabase as any)
      .from('calendar_events')
      .select('*')
      .lte('start_date', to + 'T23:59:59')
      .gte('end_date',   from + 'T00:00:00')
      .order('start_date')
    setEvents((data ?? []) as CalendarEvent[])
  }, [year, month])

  useEffect(() => { loadMonth() }, [loadMonth])

  // Build calendar grid
  const firstDOW    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  // [{ day, isCurrentMonth }]
  const cells: Array<{ day: number; cur: boolean }> = []
  for (let i = firstDOW - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, cur: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, cur: true })
  while (cells.length % 7 !== 0) { cells.push({ day: cells.length - daysInMonth - firstDOW + 1, cur: false }) }

  const todayStr = today.toISOString().split('T')[0]

  const eventsOnCell = (day: number, cur: boolean) => {
    if (!cur) return []
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => {
      const s = e.start_date.slice(0,10)
      const en = (e.end_date ?? e.start_date).slice(0,10)
      return dateStr >= s && dateStr <= en
    })
  }

  // Key events for sidebar (distinct events this month sorted by start date)
  const keyEvents = events.filter((e, i, arr) =>
    arr.findIndex(x => x.id === e.id) === i
  ).slice(0, 8)

  const openNew = (date?: string) => {
    setEditId(null)
    const d = date ?? todayStr
    setForm({ ...emptyForm, start_date: d, end_date: d })
    setShowModal(true)
  }

  const openEdit = (ev: CalendarEvent) => {
    setEditId(ev.id)
    setForm({
      title:       ev.title,
      description: ev.description ?? '',
      start_date:  ev.start_date.slice(0,10),
      end_date:    (ev.end_date ?? ev.start_date).slice(0,10),
      audience:    ev.audience,
      grade_level: ev.grade_level ?? '',
      color:       ev.color,
      location:    ev.location ?? '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_date) { toast.error('Título y fecha son obligatorios'); return }
    setSaving(true)
    const payload = {
      title:       form.title.trim(),
      description: form.description || null,
      start_date:  form.start_date + 'T00:00:00',
      end_date:    (form.end_date || form.start_date) + 'T23:59:59',
      all_day:     true,
      audience:    form.audience,
      grade_level: form.grade_level || null,
      section:     null,
      color:       form.color,
      location:    form.location || null,
      created_by:  profile!.id,
    }
    const db = supabase as any
    const { error } = editId
      ? await db.from('calendar_events').update(payload).eq('id', editId)
      : await db.from('calendar_events').insert(payload)
    setSaving(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success(editId ? 'Evento actualizado' : 'Evento creado')
    setShowModal(false)
    loadMonth()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
    await (supabase as any).from('calendar_events').delete().eq('id', id)
    toast.success('Eliminado')
    loadMonth()
  }

  const importCalendar = async () => {
    if (!confirm(`Esto BORRARÁ todos los eventos existentes de 2026 y cargará ${SEED_2026.length} eventos del Calendario Oficial. ¿Continuar?`)) return
    setImporting(true)
    const db = supabase as any
    // 1. Eliminar todos los eventos de 2026
    const { error: delErr } = await db
      .from('calendar_events')
      .delete()
      .gte('start_date', '2026-01-01')
      .lte('start_date', '2026-12-31')
    if (delErr) { toast.error('Error al limpiar: ' + delErr.message); setImporting(false); return }
    // 2. Insertar el seed oficial
    const rows = SEED_2026.map(e => ({
      title: e.title, description: null,
      start_date: e.start + 'T00:00:00',
      end_date:   e.end   + 'T23:59:59',
      all_day: true, audience: 'all',
      grade_level: null, section: null,
      color: e.color, location: null, created_by: profile!.id,
    }))
    const { error } = await db.from('calendar_events').insert(rows)
    setImporting(false)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success(`✅ ${SEED_2026.length} eventos del calendario oficial cargados`)
    loadMonth()
  }

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0) } else setMonth(m => m+1) }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Break out of dashboard p-6 with negative margin, set dark BG
    <div className="-mx-6 -mt-4 -mb-6 min-h-[calc(100vh-64px)]"
      style={{ background: 'linear-gradient(135deg,#0d1b3e 0%,#0a1628 60%,#0d1b3e 100%)' }}>
      <div className="flex h-full min-h-[calc(100vh-64px)]">

        {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════ */}
        <div className="w-64 shrink-0 flex flex-col p-6 gap-5">

          {/* Back button */}
          <button onClick={() => router.back()} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white/10 self-start">
            <ArrowLeft className="w-4 h-4" /> Regresar
          </button>

          {/* Logo + school name */}
          <div className="flex items-center gap-3">
            <Image
              src="/logo-eos-official.png"
              alt="Logo E-OS"
              width={52}
              height={52}
              className="rounded-full"
            />
            <div>
              <div className="text-white font-black text-sm leading-tight">E-OS</div>
              <div className="text-blue-300 text-[11px] leading-tight">Christian School</div>
            </div>
          </div>

          {/* Monthly Content Calendar label + month */}
          <div>
            <div className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">Monthly</div>
            <div className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">Content</div>
            <div className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-3">Calendar</div>
            <div className="flex items-center gap-2">
              {/* Lightning bolt EOS icon */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M16 3L6 16h9l-3 9 12-14h-9l3-8z" fill="#ef4444" stroke="#ef4444" strokeWidth="0.5" strokeLinejoin="round"/>
              </svg>
              <span className="text-white font-black text-4xl leading-none tracking-tight">
                {MONTHS_EN[month]}
              </span>
            </div>
            <div className="text-blue-200 text-sm font-semibold mt-0.5">{MONTHS_ES[month]} {year}</div>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 text-center text-white/60 text-xs font-medium">
              {year}
            </div>
            <button onClick={nextMonth}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Content Type — key events */}
          <div>
            <div className="text-white font-black text-base mb-2">Content Type</div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 space-y-2 max-h-48 overflow-y-auto">
              {keyEvents.length === 0 && (
                <p className="text-white/40 text-[11px]">Sin eventos este mes</p>
              )}
              {keyEvents.map(ev => {
                const start = new Date(ev.start_date + (ev.start_date.length === 10 ? 'T12:00' : ''))
                const dayNum = start.getDate()
                return (
                  <div key={ev.id} className="flex gap-2 items-start">
                    <span className="text-white/50 text-[10px] shrink-0 w-14 pt-0.5">
                      {DAYS_LABEL[start.getDay()]} {dayNum}
                    </span>
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: ev.color }} />
                      <span className="text-white/80 text-[10px] leading-tight">{ev.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Platform — legend */}
          <div>
            <div className="text-white font-black text-base mb-2">Platform</div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 space-y-2">
              {CATEGORIES.map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 shrink-0" style={{ color: c.color }} />
                  <span className="text-white/70 text-[10px] leading-tight">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 mt-auto">
            {canEdit && (
              <button onClick={() => openNew()}
                className="w-full flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold py-2.5 rounded-xl transition-colors border border-white/20">
                <Plus className="w-3.5 h-3.5" /> Nuevo Evento
              </button>
            )}
            {isMaster && (
              <button onClick={importCalendar} disabled={importing}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />
                {importing ? 'Importando...' : 'Importar Cal. 2026'}
              </button>
            )}
          </div>
        </div>

        {/* ══ CALENDAR GRID ═════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col p-4 pl-0 min-w-0">

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2 px-1">
            {DAYS_LABEL.map(d => (
              <div key={d} className="text-center text-white font-black text-sm py-2 tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="flex-1 grid grid-cols-7 gap-2 px-1">
            {cells.map((cell, idx) => {
              const dateStr = cell.cur
                ? `${year}-${String(month+1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`
                : null
              const dayEvs  = eventsOnCell(cell.day, cell.cur)
              const isToday = dateStr === todayStr

              return (
                <div key={idx}
                  onClick={() => { if (cell.cur && canEdit) openNew(dateStr ?? undefined) }}
                  className={`bg-white rounded-2xl p-2 flex flex-col overflow-hidden transition-shadow
                    ${cell.cur ? 'shadow cursor-pointer hover:shadow-md' : 'opacity-25'}
                    ${isToday ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ minHeight: '90px' }}>

                  {/* Day number */}
                  <div className={`text-base font-black mb-1 leading-none
                    ${isToday ? 'text-blue-600' : cell.cur ? 'text-gray-800' : 'text-gray-400'}`}>
                    {cell.day}
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                    {dayEvs.slice(0, 3).map(ev => (
                      <div key={ev.id}
                        onClick={e => { e.stopPropagation(); canEdit ? openEdit(ev) : setViewEvent(ev) }}
                        className="px-1.5 py-0.5 rounded-lg text-white text-[9px] font-bold leading-tight cursor-pointer hover:opacity-80 truncate"
                        style={{ backgroundColor: ev.color }}
                        title={ev.title}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvs.length > 3 && (
                      <div className="text-[9px] text-gray-400 font-semibold pl-1">
                        +{dayEvs.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══ MODAL ═════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-black text-gray-900 text-base">{editId ? 'Editar Evento' : 'Nuevo Evento'}</h2>
              {editId && canEdit && (
                <button onClick={() => { handleDelete(editId!); setShowModal(false) }}
                  className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Título *</label>
                <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                  value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Nombre del evento" autoFocus />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Descripción</label>
                <textarea className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50 min-h-[60px] resize-none"
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detalles opcionales..." />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Lugar</label>
                <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                  value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  placeholder="Ej: Auditorio, Cancha..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Inicio *</label>
                  <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                    value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Fin</label>
                  <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                    value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wide">Categoría</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.id} onClick={() => setForm(p => ({ ...p, color: c.color }))}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-left
                        ${form.color === c.color ? 'border-current bg-gray-50' : 'border-gray-100 text-gray-600 hover:bg-gray-50'}`}
                      style={form.color === c.color ? { color: c.color, borderColor: c.color } : {}}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Audiencia</label>
                  <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                    value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value as AudienceType }))}>
                    <option value="all">Todos</option>
                    <option value="teachers">Docentes</option>
                    <option value="admin">Administrativo</option>
                    <option value="parents">Padres</option>
                    <option value="students">Estudiantes</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wide">Grado</label>
                  <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                    value={form.grade_level} onChange={e => setForm(p => ({ ...p, grade_level: e.target.value }))}
                    placeholder="Todos / 7° / P4..." />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)}
                className="text-sm text-gray-600 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm text-white px-6 py-2.5 rounded-xl font-black disabled:opacity-50 transition-colors"
                style={{ backgroundColor: form.color }}>
                {saving ? 'Guardando...' : editId ? 'Guardar' : 'Crear evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ VIEW MODAL (solo lectura para usuarios no-admin) ════════════════════ */}
      {viewEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViewEvent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            {/* Header con color del evento */}
            <div className="rounded-t-2xl px-5 py-4 flex items-center justify-between"
              style={{ backgroundColor: viewEvent.color }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white font-black text-sm truncate">{viewEvent.title}</span>
              </div>
              <button onClick={() => setViewEvent(null)}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors shrink-0">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {/* Fecha */}
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide w-20 shrink-0 pt-0.5">Fecha</span>
                <span className="text-sm text-slate-700">
                  {(() => {
                    const s = viewEvent.start_date.slice(0, 10)
                    const e = (viewEvent.end_date ?? viewEvent.start_date).slice(0, 10)
                    const fmtLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
                    return s === e ? fmtLong(s) : `${fmtShort(s)} — ${fmtShort(e)}`
                  })()}
                </span>
              </div>

              {/* Categoría */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide w-20 shrink-0">Tipo</span>
                <span className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                  style={{ backgroundColor: viewEvent.color }}>
                  {getCat(viewEvent.color).label}
                </span>
              </div>

              {/* Lugar */}
              {viewEvent.location && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide w-20 shrink-0 pt-0.5">Lugar</span>
                  <span className="text-sm text-slate-700">{viewEvent.location}</span>
                </div>
              )}

              {/* Descripción */}
              {viewEvent.description && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide w-20 shrink-0 pt-0.5">Detalle</span>
                  <span className="text-sm text-slate-700 whitespace-pre-wrap">{viewEvent.description}</span>
                </div>
              )}

              {!viewEvent.description && !viewEvent.location && (
                <p className="text-xs text-slate-400 text-center py-2">Sin detalles adicionales</p>
              )}
            </div>

            {canEdit && (
              <div className="px-5 pb-4 flex justify-end">
                <button onClick={() => { setViewEvent(null); openEdit(viewEvent) }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
