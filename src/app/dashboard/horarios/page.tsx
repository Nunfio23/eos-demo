'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { Zap, Save, Wand2, AlertTriangle, ChevronDown, X, Bot, Send, ChevronRight } from 'lucide-react'
import { apiUrl } from '@/lib/api-url'

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const DAY_KEYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

const EOS_INFO: Record<string, { label: string; color: string; short: string }> = {
  lunes:     { label: 'Tecnología', color: '#0ea5e9', short: 'T' },
  martes:    { label: 'Ingeniería', color: '#f97316', short: 'E' },
  miercoles: { label: 'Ciencia',    color: '#10b981', short: 'S' },
  jueves:    { label: 'Lenguaje',   color: '#8b5cf6', short: 'L' },
  viernes:   { label: 'Arte',       color: '#ec4899', short: 'A' },
}

const PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#14b8a6','#84cc16','#f97316','#a855f7',
  '#0ea5e9','#ec4899','#22c55e','#64748b','#e11d48',
]

type LevelGroup = 'parvularia' | 'elementary' | 'secondary'

interface SlotTemplate {
  start: string; end: string
  type: 'devotional' | 'class' | 'recess' | 'lunch'
  label?: string; color?: string
}

// ── Schedule config per level (editable by user) ───────────────────────────────
interface LevelScheduleConfig {
  entry: string        // '08:00'
  blockDuration: number // minutes per class block (30 or 45)
  recess1Start: string // '09:45'
  recess1End: string   // '10:00'
  recess2: boolean
  recess2Start: string // '11:30'
  recess2End: string   // '11:45'
  hasSnack: boolean    // refrigerio (parvularia)
  snackStart: string
  snackEnd: string
  hasHandWash: boolean // lavado de manos (parvularia)
  handWashStart: string
  handWashEnd: string
  hasLunch: boolean
  lunchStart: string   // '12:30'
  lunchEnd: string     // '13:00'
  exitFull: string     // '15:15' (Lun-Jue)
  exitHalf: string     // '12:30' (Vie)
}
type ScheduleConfig = Record<LevelGroup, LevelScheduleConfig>

const DEFAULT_SCHED_CONFIG: ScheduleConfig = {
  parvularia: { entry:'08:00', blockDuration:30, recess1Start:'10:00', recess1End:'10:15', recess2:false, recess2Start:'', recess2End:'', hasSnack:true, snackStart:'09:15', snackEnd:'09:45', hasHandWash:true, handWashStart:'09:00', handWashEnd:'09:15', hasLunch:false, lunchStart:'', lunchEnd:'', exitFull:'12:15', exitHalf:'12:00' },
  elementary:  { entry:'08:00', blockDuration:45, recess1Start:'09:45', recess1End:'10:00', recess2:true,  recess2Start:'11:30', recess2End:'11:45', hasSnack:false, snackStart:'', snackEnd:'', hasHandWash:false, handWashStart:'', handWashEnd:'', hasLunch:true,  lunchStart:'12:30', lunchEnd:'13:00', exitFull:'15:15', exitHalf:'12:30' },
  secondary:   { entry:'08:00', blockDuration:45, recess1Start:'09:45', recess1End:'10:00', recess2:true,  recess2Start:'11:30', recess2End:'11:45', hasSnack:false, snackStart:'', snackEnd:'', hasHandWash:false, handWashStart:'', handWashEnd:'', hasLunch:true,  lunchStart:'12:30', lunchEnd:'13:00', exitFull:'15:15', exitHalf:'12:30' },
}

function timeToMins(t: string): number { const [h,m] = t.split(':').map(Number); return h*60+m }
function minsToTime(m: number): string { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` }

function buildTemplate(cfg: LevelScheduleConfig, isHalf: boolean): SlotTemplate[] {
  const BLOCK = cfg.blockDuration ?? 45
  const slots: SlotTemplate[] = []
  const entryM = timeToMins(cfg.entry)
  const devEnd = entryM + 15
  slots.push({ start: minsToTime(entryM), end: minsToTime(devEnd), type: 'devotional', label: 'Devocional', color: '#f59e0b' })
  const exitM = timeToMins(isHalf ? cfg.exitHalf : cfg.exitFull)
  type Brk = { start:number; end:number; type:'recess'|'lunch'; label:string; color:string }
  const breaks: Brk[] = []
  if (cfg.recess1Start) breaks.push({ start: timeToMins(cfg.recess1Start), end: timeToMins(cfg.recess1End), type:'recess', label:'Recreo', color:'#10b981' })
  if (cfg.recess2 && cfg.recess2Start && timeToMins(cfg.recess2Start) < exitM)
    breaks.push({ start: timeToMins(cfg.recess2Start), end: timeToMins(cfg.recess2End), type:'recess', label:'Recreo', color:'#10b981' })
  if (cfg.hasHandWash && cfg.handWashStart && timeToMins(cfg.handWashStart) < exitM)
    breaks.push({ start: timeToMins(cfg.handWashStart), end: timeToMins(cfg.handWashEnd), type:'recess', label:'Lavado de manos', color:'#06b6d4' })
  if (cfg.hasSnack && cfg.snackStart && timeToMins(cfg.snackStart) < exitM)
    breaks.push({ start: timeToMins(cfg.snackStart), end: timeToMins(cfg.snackEnd), type:'recess', label:'Refrigerio', color:'#f59e0b' })
  if (cfg.hasLunch && !isHalf && cfg.lunchStart)
    breaks.push({ start: timeToMins(cfg.lunchStart), end: timeToMins(cfg.lunchEnd), type:'lunch', label:'Almuerzo', color:'#06b6d4' })
  breaks.sort((a,b) => a.start - b.start)
  let cursor = devEnd; let bIdx = 0
  while (cursor < exitM) {
    if (bIdx < breaks.length && cursor >= breaks[bIdx].start) {
      const br = breaks[bIdx++]
      slots.push({ start: minsToTime(br.start), end: minsToTime(br.end), type: br.type, label: br.label, color: br.color })
      cursor = br.end; continue
    }
    const next = bIdx < breaks.length ? breaks[bIdx].start : exitM
    const blockEnd = Math.min(cursor + BLOCK, next)
    if (blockEnd <= cursor) { cursor = next; continue }
    slots.push({ start: minsToTime(cursor), end: minsToTime(blockEnd), type: 'class' })
    cursor = blockEnd
  }
  return slots
}

function buildTemplates(config: ScheduleConfig): Record<LevelGroup, { full: SlotTemplate[]; half: SlotTemplate[] }> {
  const lgs: LevelGroup[] = ['parvularia', 'elementary', 'secondary']
  const result = {} as Record<LevelGroup, { full: SlotTemplate[]; half: SlotTemplate[] }>
  lgs.forEach(lg => { result[lg] = { full: buildTemplate(config[lg], false), half: buildTemplate(config[lg], true) } })
  return result
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Level       { id: string; name: string; code: string; sort_order: number }
interface Grade       { id: string; name: string; code: string; level_id: string }
interface Section     { id: string; name: string; grade_id: string }
interface SchoolYear  { id: string; name: string; is_active: boolean }
interface SubjectCat  { id: string; name: string; code: string }
interface GradeSubject { grade_id: string; subject_catalog_id: string; weekly_hours: number }

interface GshVal      { hours: number; ext: boolean }
type GshMap = Record<string, Record<string, GshVal>>

interface Entry {
  section_id: string
  school_year_id: string
  day_of_week: string
  start_time: string
  end_time: string
  subject_catalog_id: string | null
  teacher_id: string | null
  color: string
  notes: string | null
}

interface AiMsg { role: 'user' | 'assistant'; content: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLG(gradeId: string, grades: Grade[], levels: Level[]): LevelGroup {
  const grade = grades.find(g => g.id === gradeId)
  const level = levels.find(l => l.id === grade?.level_id)
  if (!level) return 'elementary'
  const c = level.code.toUpperCase()
  if (c === 'PARV') return 'parvularia'
  if (c === 'MID' || c === 'HIGH') return 'secondary'
  return 'elementary'
}

type Templates = Record<LevelGroup, { full: SlotTemplate[]; half: SlotTemplate[] }>

function classSlots(lg: LevelGroup, day: string, tpls: Templates): SlotTemplate[] {
  const isHalf = day === 'viernes'
  return tpls[lg][isHalf ? 'half' : 'full'].filter(s => s.type === 'class')
}

function availableSlots(lg: LevelGroup, tpls: Templates): number {
  let n = 0
  DAY_KEYS.forEach(d => { n += classSlots(lg, d, tpls).length })
  return n
}

// ── Cross-grade group type ─────────────────────────────────────────────────────
interface CrossGradeGroup { id: string; subjectId: string; gradeIds: string[] }

// ── Internal scheduler job ─────────────────────────────────────────────────────
interface SchedJob {
  id: string
  subjectId: string
  gradeId: string
  sectionIds: string[]      // 1 for core, N for ext/cross-grade
  teacherId: string | null
  periodsLeft: number
  periodsTotal: number
  lg: LevelGroup
  label: string             // human-readable label for conflict messages
  sharedNote: string | null // note to attach to shared-class entries
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFACTORED GENERATOR — MRV + Scoring + Multi-pass + Teacher-conflict audit
// ═══════════════════════════════════════════════════════════════════════════════
function generate(
  grades: Grade[], sections: Section[], levels: Level[],
  gshMap: GshMap,
  teacherTA: Array<{ teacher_id: string; section_id: string; subject_catalog_id: string }>,
  colorMap: Record<string, string>,
  yearId: string,
  tpls: Templates,
  gradeMaxHours: Record<string, number>,
  crossGradeGroups: CrossGradeGroup[],
  subjectList: SubjectCat[]
): { entries: Entry[]; conflicts: string[] } {

  const all: Entry[] = []
  const conflicts: string[] = []
  const sname = (id: string) => subjectList.find(s => s.id === id)?.name ?? id

  // ── Global busy maps (shared across ALL grades — prevents teacher conflicts) ──
  const secBusy: Record<string, Set<string>> = {}   // secId → Set<"day_start">
  sections.forEach(s => { secBusy[s.id] = new Set() })
  const teachBusy = new Set<string>()               // "teacherId_day_start"

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Fixed non-class slots + TESLA (after school, not replacing a class)
  // ─────────────────────────────────────────────────────────────────────────────
  for (const grade of grades) {
    const grSecs = sections.filter(s => s.grade_id === grade.id)
    const lg = getLG(grade.id, grades, levels)
    for (const sec of grSecs) {
      for (const day of DAY_KEYS) {
        const isHalf = day === 'viernes'
        const tpl = tpls[lg][isHalf ? 'half' : 'full']
        const lastEnd = tpl[tpl.length - 1]?.end ?? '15:00'
        const eos = EOS_INFO[day]
        tpl.forEach(slot => {
          if (slot.type !== 'class') {
            all.push({ section_id: sec.id, school_year_id: yearId, day_of_week: day,
              start_time: slot.start, end_time: slot.end, subject_catalog_id: null,
              teacher_id: null, color: slot.color ?? '#94a3b8', notes: slot.label ?? null })
          }
        })
        // TESLA after school hours — does NOT mark any class slot as busy
        all.push({ section_id: sec.id, school_year_id: yearId, day_of_week: day,
          start_time: lastEnd, end_time: minsToTime(timeToMins(lastEnd) + 30),
          subject_catalog_id: null, teacher_id: null,
          color: eos.color, notes: `TESLA: ${eos.short} — ${eos.label}` })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Build the list of scheduler jobs
  // Order: cross-grade first (most constrained), then ext, then core per section
  // ─────────────────────────────────────────────────────────────────────────────
  const jobs: SchedJob[] = []
  const cgHandled: Record<string, Set<string>> = {} // gradeId → Set<subjectId>

  // 2a. Cross-grade shared groups
  for (const grp of crossGradeGroups) {
    const grpGrades = grades.filter(g => grp.gradeIds.includes(g.id))
    if (!grpGrades.length) continue
    const grpSecs = sections.filter(s => grp.gradeIds.includes(s.grade_id))
    if (!grpSecs.length) continue
    const hours = Math.max(...grpGrades.map(g => gshMap[g.id]?.[grp.subjectId]?.hours ?? 0))
    if (!hours) continue
    const ta = teacherTA.find(a => a.subject_catalog_id === grp.subjectId && grpSecs.some(s => s.id === a.section_id))
    jobs.push({
      id: `cg_${grp.id}`, subjectId: grp.subjectId,
      gradeId: grpGrades[0].id, sectionIds: grpSecs.map(s => s.id),
      teacherId: ta?.teacher_id ?? null,
      periodsLeft: hours, periodsTotal: hours,
      lg: getLG(grpGrades[0].id, grades, levels),
      label: `Unión ${grpGrades.map(g => g.name).join('+')}`,
      sharedNote: `Unión grados: ${grpGrades.map(g => g.name).join(' + ')}`
    })
    grp.gradeIds.forEach(gId => {
      if (!cgHandled[gId]) cgHandled[gId] = new Set()
      cgHandled[gId].add(grp.subjectId)
    })
  }

  // 2b. Per-grade jobs
  for (const grade of grades) {
    const grSecs = sections.filter(s => s.grade_id === grade.id)
    if (!grSecs.length) continue
    const lg = getLG(grade.id, grades, levels)
    const gsh = gshMap[grade.id] ?? {}
    const handled = cgHandled[grade.id] ?? new Set<string>()

    // Warn if configured hours exceed grade limit
    const activeSubjs = Object.entries(gsh).filter(([, v]) => v.hours > 0)
    const totalH = activeSubjs.reduce((s, [, v]) => s + v.hours, 0)
    const maxH = gradeMaxHours[grade.id] ?? availableSlots(lg, tpls)
    if (totalH > maxH) conflicts.push(`${grade.name}: ${totalH}h configuradas superan límite ${maxH}h/sem`)

    for (const [subjId, val] of activeSubjs) {
      if (handled.has(subjId)) continue
      if (val.ext) {
        // Extracurricular: one job covers all sections of this grade together
        const ta = teacherTA.find(a => a.subject_catalog_id === subjId && grSecs.some(s => s.id === a.section_id))
        jobs.push({
          id: `ext_${grade.id}_${subjId}`, subjectId: subjId,
          gradeId: grade.id, sectionIds: grSecs.map(s => s.id),
          teacherId: ta?.teacher_id ?? null,
          periodsLeft: val.hours, periodsTotal: val.hours, lg,
          label: `${grade.name} (ext)`,
          sharedNote: grSecs.length > 1 ? `Unión: ${grSecs.map(s => `Secc.${s.name}`).join(' + ')}` : null
        })
      } else {
        // Core: individual job per section
        for (const sec of grSecs) {
          const ta = teacherTA.find(a => a.subject_catalog_id === subjId && a.section_id === sec.id)
            ?? teacherTA.find(a => a.subject_catalog_id === subjId && grSecs.some(s => s.id === a.section_id))
          jobs.push({
            id: `core_${sec.id}_${subjId}`, subjectId: subjId,
            gradeId: grade.id, sectionIds: [sec.id],
            teacherId: ta?.teacher_id ?? null,
            periodsLeft: val.hours, periodsTotal: val.hours, lg,
            label: `${grade.name} Secc.${sec.name}`,
            sharedNote: null
          })
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Smart multi-pass placement with MRV + scoring
  // ─────────────────────────────────────────────────────────────────────────────

  /** Count placed class periods per day for a subject+sections combo */
  const placedByDay = (subjectId: string, secIds: string[]): Record<string, number> => {
    const m: Record<string, number> = {}
    all.forEach(e => {
      if (e.subject_catalog_id !== subjectId) return
      if (!secIds.includes(e.section_id)) return
      if (e.notes?.startsWith('TESLA:')) return
      m[e.day_of_week] = (m[e.day_of_week] ?? 0) + 1
    })
    return m
  }

  /** Total class entries (non-TESLA) for given sections on a day */
  const dayLoad = (secIds: string[], day: string): number =>
    all.filter(e => secIds.includes(e.section_id) && e.day_of_week === day
      && e.subject_catalog_id !== null && !e.notes?.startsWith('TESLA:')).length

  /** Score a candidate placement — higher is better */
  const scoreSlot = (job: SchedJob, day: string, slot: SlotTemplate): number => {
    let sc = 0
    const byDay = placedByDay(job.subjectId, job.sectionIds)

    // ── Distribution quality ──
    // Strong penalty for same-day repeat of same subject (want spread across week)
    sc -= (byDay[day] ?? 0) * 30
    // Penalty for overloaded days for these sections
    sc -= dayLoad(job.sectionIds, day) * 4
    // Bonus for the least-loaded day (balance the week)
    const loads = DAY_KEYS.map(d => dayLoad(job.sectionIds, d))
    if (dayLoad(job.sectionIds, day) === Math.min(...loads)) sc += 12

    // ── Time-of-day preference ──
    // Slight penalty for Fridays (shorter day = less room)
    if (day === 'viernes') sc -= 10
    // Slight preference for morning slots (better attention, fewer conflicts downstream)
    if (timeToMins(slot.start) < 660) sc += 4  // before 11:00

    // ── Teacher workday continuity ──
    // Bonus if teacher already has a class this day (consolidates their workday)
    if (job.teacherId) {
      const alreadyOnDay = all.some(e =>
        e.teacher_id === job.teacherId && e.day_of_week === day
        && e.subject_catalog_id !== null && !e.notes?.startsWith('TESLA:'))
      if (alreadyOnDay) sc += 6
    }

    return sc
  }

  /** How urgent is this job? Higher = schedule it before others (MRV heuristic) */
  const urgency = (job: SchedJob): number => {
    if (job.periodsLeft <= 0) return -Infinity
    let u = job.periodsLeft * 10

    // Shared/ext jobs are harder (must find slots free for multiple sections simultaneously)
    if (job.sectionIds.length > 1) u += 60

    // If teacher has many pending jobs, they're a bottleneck — schedule them first
    if (job.teacherId) {
      const teacherPending = jobs.filter(j => j.teacherId === job.teacherId && j.periodsLeft > 0).length
      u += teacherPending * 8
    }

    // Forward-checking: count remaining valid slots for this job
    // Fewer options = more urgent (classic MRV)
    let freeSlots = 0
    for (const day of DAY_KEYS) {
      for (const slot of classSlots(job.lg, day, tpls)) {
        const key = `${day}_${slot.start}`
        if (!job.sectionIds.every(sId => !secBusy[sId].has(key))) continue
        const tKey = job.teacherId ? `${job.teacherId}_${key}` : null
        if (tKey && teachBusy.has(tKey)) continue
        freeSlots++
      }
    }
    // Invert: fewer free slots → higher urgency
    u += Math.max(0, 50 - freeSlots) * 5

    return u
  }

  /** Try to place one period of a job. Returns true on success. */
  const placeOne = (job: SchedJob): boolean => {
    if (job.periodsLeft <= 0) return false
    const byDay = placedByDay(job.subjectId, job.sectionIds)
    // Soft max per day: distribute evenly, allow up to 2
    const softMax = Math.max(2, Math.ceil(job.periodsTotal / Math.max(1, DAY_KEYS.length)))

    let best: { day: string; slot: SlotTemplate; score: number } | null = null

    // Pass A: respect soft daily max — prefer even distribution
    for (const day of DAY_KEYS) {
      if ((byDay[day] ?? 0) >= softMax) continue
      for (const slot of classSlots(job.lg, day, tpls)) {
        const key = `${day}_${slot.start}`
        if (!job.sectionIds.every(sId => !secBusy[sId].has(key))) continue
        const tKey = job.teacherId ? `${job.teacherId}_${key}` : null
        if (tKey && teachBusy.has(tKey)) continue
        const sc = scoreSlot(job, day, slot)
        if (!best || sc > best.score) best = { day, slot, score: sc }
      }
    }

    // Pass B: relax daily cap — use any remaining free slot (with penalty)
    if (!best) {
      for (const day of DAY_KEYS) {
        for (const slot of classSlots(job.lg, day, tpls)) {
          const key = `${day}_${slot.start}`
          if (!job.sectionIds.every(sId => !secBusy[sId].has(key))) continue
          const tKey = job.teacherId ? `${job.teacherId}_${key}` : null
          if (tKey && teachBusy.has(tKey)) continue
          const sc = scoreSlot(job, day, slot) - 60  // heavy penalty for overloaded day
          if (!best || sc > best.score) best = { day, slot, score: sc }
        }
      }
    }

    // Pass C: last resort — ignore teacher conflict, place anyway with warning note
    // This guarantees every period gets a slot; admin can fix teacher conflict manually
    if (!best) {
      for (const day of DAY_KEYS) {
        for (const slot of classSlots(job.lg, day, tpls)) {
          const key = `${day}_${slot.start}`
          if (!job.sectionIds.every(sId => !secBusy[sId].has(key))) continue
          // Section is free — place even if teacher is busy (mark as conflict)
          const sc = scoreSlot(job, day, slot) - 150
          if (!best || sc > best.score) best = { day, slot, score: sc }
        }
      }
    }

    if (!best) return false

    const key = `${best.day}_${best.slot.start}`
    const tKey = job.teacherId ? `${job.teacherId}_${key}` : null
    const color = colorMap[job.subjectId] ?? PALETTE[0]
    // Detect if we're using Pass C (teacher is actually busy in this slot)
    const teacherConflict = tKey ? teachBusy.has(tKey) : false
    const noteOverride = teacherConflict ? '⚠ Choque de docente — revisar' : null

    job.sectionIds.forEach(secId => {
      all.push({
        section_id: secId, school_year_id: yearId,
        day_of_week: best!.day, start_time: best!.slot.start, end_time: best!.slot.end,
        subject_catalog_id: job.subjectId, teacher_id: job.teacherId, color,
        notes: noteOverride ?? job.sharedNote ?? (job.teacherId ? null : 'Sin docente asignado')
      })
      secBusy[secId].add(key)
    })
    // Only mark teacher busy if no conflict (don't double-block)
    if (tKey && !teacherConflict) teachBusy.add(tKey)
    job.periodsLeft--
    return true
  }

  // Multi-pass loop — re-sorts by urgency each pass (adaptive MRV)
  // Each pass places exactly one period per job that still has periods remaining.
  // This ensures all jobs compete fairly for slots rather than one job
  // monopolising the best slots before others get a turn.
  const MAX_PASSES = 40
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const remaining = jobs.filter(j => j.periodsLeft > 0)
    if (!remaining.length) break
    // MRV: most constrained job goes first
    remaining.sort((a, b) => urgency(b) - urgency(a))
    let progress = false
    for (const job of remaining) {
      if (placeOne(job)) progress = true
    }
    if (!progress) break  // Nothing could be placed — stop to avoid infinite loop
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 4 — Audit: unplaced periods + teacher conflict detection
  // ─────────────────────────────────────────────────────────────────────────────

  // 4a. Unplaced periods
  for (const job of jobs) {
    if (job.periodsLeft > 0) {
      conflicts.push(`${job.label} — "${sname(job.subjectId)}": faltan ${job.periodsLeft}/${job.periodsTotal} períodos`)
    }
  }

  // 4b. Teacher conflict audit — detect any slot where a teacher is in 2+ sections simultaneously
  // (should not happen with busyTeach, but validates integrity)
  const teachSlotIdx: Record<string, string[]> = {}
  all.forEach(e => {
    if (!e.teacher_id || !e.subject_catalog_id) return
    const k = `${e.teacher_id}|${e.day_of_week}|${e.start_time}`
    if (!teachSlotIdx[k]) teachSlotIdx[k] = []
    teachSlotIdx[k].push(e.section_id)
  })
  Object.entries(teachSlotIdx).forEach(([k, secIds]) => {
    if (secIds.length <= 1) return
    // Valid if it's a legit shared job (same teacher + same subject + same time for multiple sections)
    const [tid, day, start] = k.split('|')
    const isLegit = jobs.some(j =>
      j.teacherId === tid && j.sectionIds.length > 1
      && secIds.every(s => j.sectionIds.includes(s)))
    if (!isLegit) {
      conflicts.push(`⚠ Choque de docente en ${day} ${start}: mismo maestro asignado a ${secIds.length} secciones distintas`)
    }
  })

  return { entries: all, conflicts }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HorariosPage() {
  const { profile } = useAuth()
  const isMaster = profile?.role === 'master'
  const isAdmin  = !!profile?.role && ['master','direccion','administracion'].includes(profile.role)

  const [levels,       setLevels]       = useState<Level[]>([])
  const [grades,       setGrades]       = useState<Grade[]>([])
  const [sections,     setSections]     = useState<Section[]>([])
  const [schoolYears,  setSchoolYears]  = useState<SchoolYear[]>([])
  const [subjects,     setSubjects]     = useState<SubjectCat[]>([])
  const [gradeSubjects,setGradeSubjects]= useState<GradeSubject[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedYear, setSelectedYear] = useState('')

  const [gshMap,         setGshMap]         = useState<GshMap>({})
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set())
  const [savingCfg,      setSavingCfg]      = useState(false)

  const [entries,       setEntries]       = useState<Entry[]>([])
  const [hasGenerated,  setHasGenerated]  = useState(false)
  const [selectedDay,   setSelectedDay]   = useState(0)
  const [generating,    setGenerating]    = useState(false)
  const [generatingAI,  setGeneratingAI]  = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [conflicts,     setConflicts]     = useState<string[]>([])
  const [showSchedCfg,  setShowSchedCfg]  = useState(false)
  const [schedConfig,   setSchedConfig]   = useState<ScheduleConfig>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('eos_sched_config') : null
      if (saved) {
        const p = JSON.parse(saved)
        return {
          parvularia: { ...DEFAULT_SCHED_CONFIG.parvularia, ...(p.parvularia ?? {}) },
          elementary:  { ...DEFAULT_SCHED_CONFIG.elementary,  ...(p.elementary  ?? {}) },
          secondary:   { ...DEFAULT_SCHED_CONFIG.secondary,   ...(p.secondary   ?? {}) },
        }
      }
      return DEFAULT_SCHED_CONFIG
    } catch { return DEFAULT_SCHED_CONFIG }
  })
  const [schedDraft,    setSchedDraft]    = useState<ScheduleConfig>(schedConfig)

  const templates = useMemo(() => buildTemplates(schedConfig), [schedConfig])

  // Horas clase máximas por grado (configuradas por el usuario)
  const [gradeMaxHours, setGradeMaxHours] = useState<Record<string, number>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('eos_grade_max_hours') : null
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const setGradeMax = (gradeId: string, val: number) => {
    setGradeMaxHours(prev => {
      const next = { ...prev, [gradeId]: val }
      try { localStorage.setItem('eos_grade_max_hours', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const [showConflicts, setShowConflicts] = useState(false)

  const [editCell, setEditCell] = useState<{ secId: string; day: string; start: string; end: string } | null>(null)

  // ── Visual selection mode ─────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())

  const toggleCellSel = (secId: string, cellDay: string, start: string) => {
    const key = `${secId}|${cellDay}|${start}`
    setSelectedCells(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  const assignToSelected = (subjId: string | null) => {
    setEntries(prev => {
      const updated = [...prev]
      selectedCells.forEach(key => {
        const [secId, cellDay, start] = key.split('|')
        const idx = updated.findIndex(e => e.section_id === secId && e.day_of_week === cellDay && e.start_time === start)
        const sec = sections.find(s => s.id === secId)
        const lg = getLG(sec?.grade_id ?? '', grades, levels)
        const tpl = templates[lg][cellDay === 'viernes' ? 'half' : 'full']
        const slotEnd = tpl.find(t => t.start === start)?.end ?? start
        const ci = subjId ? subjects.findIndex(s => s.id === subjId) : -1
        const color = subjId ? (PALETTE[ci >= 0 ? ci % PALETTE.length : 0]) : ''
        if (idx < 0) {
          if (!subjId) return
          updated.push({ section_id: secId, school_year_id: selectedYear, day_of_week: cellDay,
            start_time: start, end_time: slotEnd, subject_catalog_id: subjId, teacher_id: null, color, notes: null })
        } else {
          if (!subjId) { updated.splice(idx, 1) } else { updated[idx] = { ...updated[idx], subject_catalog_id: subjId, color, notes: null } }
        }
      })
      return updated
    })
    setSelectedCells(new Set())
    setHasGenerated(true)
  }

  // ── Grade view state ──────────────────────────────────────────────────────
  const [selectedViewGradeId, setSelectedViewGradeId] = useState<string>('')
  const [selectedViewSecId, setSelectedViewSecId] = useState<string>('all')
  const [paintSubjectId, setPaintSubjectId] = useState<string | null>(null)

  // ── Cross-grade groups ────────────────────────────────────────────────────
  const [crossGradeGroups, setCrossGradeGroups] = useState<CrossGradeGroup[]>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('eos_cross_grade_groups') : null
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showCgPanel, setShowCgPanel] = useState(false)
  const [cgForm, setCgForm] = useState<{ subjectId: string; gradeIds: string[] }>({ subjectId: '', gradeIds: [] })

  const saveCg = (groups: CrossGradeGroup[]) => {
    setCrossGradeGroups(groups)
    try { localStorage.setItem('eos_cross_grade_groups', JSON.stringify(groups)) } catch {}
  }
  const addCgGroup = () => {
    if (!cgForm.subjectId || cgForm.gradeIds.length < 2) return
    const grp: CrossGradeGroup = { id: Date.now().toString(), subjectId: cgForm.subjectId, gradeIds: cgForm.gradeIds }
    saveCg([...crossGradeGroups, grp])
    setCgForm({ subjectId: '', gradeIds: [] })
  }
  const removeCgGroup = (id: string) => saveCg(crossGradeGroups.filter(g => g.id !== id))
  const toggleCgGrade = (gId: string) => {
    setCgForm(prev => ({
      ...prev,
      gradeIds: prev.gradeIds.includes(gId) ? prev.gradeIds.filter(x => x !== gId) : [...prev.gradeIds, gId]
    }))
  }

  // ── View tab: 'grid' | 'grado' | 'docentes' ──────────────────────────────
  const [mainTab, setMainTab] = useState<'grid' | 'grado' | 'docentes'>('grid')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('')

  // ── Teacher schedule (derived from teacherTA × entries) ───────────────────
  // teacherProfiles: loaded once teacher tab is opened
  const [teacherProfiles, setTeacherProfiles] = useState<{ id: string; full_name: string }[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(false)
  const [teacherTA, setTeacherTA] = useState<{ teacher_id: string; section_id: string; subject_catalog_id: string }[]>([])

  const loadTeacherProfiles = async () => {
    if (teacherProfiles.length > 0) return
    setLoadingTeachers(true)
    const db = supabase as any
    // teacherTA is already loaded by the auto useEffect — just build the profile list
    const teacherIds = teacherTA.map(a => a.teacher_id).filter((v, i, arr) => arr.indexOf(v) === i)
    if (teacherIds.length > 0) {
      const { data: profiles } = await db.from('profiles').select('id,full_name').in('id', teacherIds).order('full_name')
      setTeacherProfiles(profiles ?? [])
    } else {
      // Fallback: load from DB if teacherTA not populated yet
      const { data: taData } = await db
        .from('teacher_assignments')
        .select('teacher_id, section_id, grade_subject:grade_subjects(subject_catalog_id)')
        .eq('school_year_id', selectedYear)
        .eq('is_active', true)
      const ta = (taData ?? []).map((r: any) => ({
        teacher_id: r.teacher_id, section_id: r.section_id,
        subject_catalog_id: r.grade_subject?.subject_catalog_id ?? '',
      })).filter((a: any) => a.subject_catalog_id)
      if (ta.length > 0) setTeacherTA(ta)
      const ids = (taData ?? []).map((r: any) => r.teacher_id as string).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      if (ids.length) {
        const { data: profiles } = await db.from('profiles').select('id,full_name').in('id', ids).order('full_name')
        setTeacherProfiles(profiles ?? [])
      }
    }
    setLoadingTeachers(false)
  }

  // Derive teacher weekly schedule from entries + teacherTA in memory
  const teacherSchedule = useMemo(() => {
    if (!selectedTeacherId || !entries.length) return []
    // Find all (section_id, subject_catalog_id) pairs for this teacher
    const myPairs = teacherTA.filter(ta => ta.teacher_id === selectedTeacherId)
    if (!myPairs.length) return []

    const DAY_KEYS_ORDER = ['lunes','martes','miercoles','jueves','viernes']
    // Build slots: { day, start, end, subjectCode, subjectName, sections[] }
    type Slot = { day: string; start: string; end: string; subjectId: string; subjectCode: string; subjectName: string; sectionNames: string[]; color: string }
    const slotMap: Record<string, Slot> = {}

    for (const pair of myPairs) {
      const matchingEntries = entries.filter(e =>
        e.section_id === pair.section_id &&
        e.subject_catalog_id === pair.subject_catalog_id &&
        e.notes !== 'Sin docente' &&
        !e.notes?.startsWith('TESLA:')
      )
      const sec = sections.find(s => s.id === pair.section_id)
      const subj = subjects.find(s => s.id === pair.subject_catalog_id)
      if (!subj) continue

      for (const entry of matchingEntries) {
        const key = `${entry.day_of_week}|${entry.start_time}|${pair.subject_catalog_id}`
        if (slotMap[key]) {
          if (sec && !slotMap[key].sectionNames.includes(sec.name)) {
            slotMap[key].sectionNames.push(sec.name)
          }
        } else {
          slotMap[key] = {
            day: entry.day_of_week,
            start: entry.start_time,
            end: entry.end_time,
            subjectId: pair.subject_catalog_id,
            subjectCode: subj.code,
            subjectName: subj.name,
            sectionNames: sec ? [sec.name] : [],
            color: entry.color ?? '#6366f1',
          }
        }
      }
    }

    return Object.values(slotMap).sort((a, b) => {
      const di = DAY_KEYS_ORDER.indexOf(a.day) - DAY_KEYS_ORDER.indexOf(b.day)
      if (di !== 0) return di
      return a.start.localeCompare(b.start)
    })
  }, [selectedTeacherId, entries, teacherTA, sections, subjects])

  // Unique time slots for teacher grid
  const teacherTimeSlots = useMemo(() => {
    const allTimes = teacherSchedule.map(s => s.start)
    return allTimes.filter((v, i, a) => a.indexOf(v) === i).sort()
  }, [teacherSchedule])

  // Total hours per teacher
  const teacherTotalHours = useMemo(() => {
    const classSlotCount = teacherSchedule.length
    return classSlotCount
  }, [teacherSchedule])

  // AI Chat state ─────────────────────────────────────────────────────────
  const [showAi,    setShowAi]    = useState(false)
  const [aiMsgs,    setAiMsgs]    = useState<AiMsg[]>([])
  const [aiInput,   setAiInput]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiEndRef = useRef<HTMLDivElement>(null)

  // ── Load base data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return
    const t = setTimeout(() => setLoading(false), 15000)
    ;(async () => {
      const db = supabase as any
      const [lvR, grR, scR, syR, subR, gsR] = await Promise.all([
        supabase.from('levels').select('id,name,code,sort_order').order('sort_order'),
        supabase.from('grades').select('id,name,code,level_id,sort_order').order('sort_order'),
        supabase.from('sections').select('id,name,grade_id').order('name'),
        supabase.from('school_years').select('id,name,is_active').order('start_date', { ascending: false }),
        supabase.from('subject_catalog').select('id,name,code').order('name'),
        db.from('grade_subjects').select('grade_id,subject_catalog_id,weekly_hours'),
      ])
      setLevels((lvR.data ?? []) as Level[])
      setGrades((grR.data ?? []) as Grade[])
      setSchoolYears((syR.data ?? []) as SchoolYear[])
      setSubjects((subR.data ?? []) as SubjectCat[])
      setGradeSubjects((gsR.data ?? []) as GradeSubject[])

      const active = (syR.data ?? []).find((y: any) => y.is_active)
      const activeYearId = (active as any)?.id
      if (activeYearId) setSelectedYear(activeYearId)

      // Solo incluir secciones que tienen alumnos matriculados en el año activo
      const allSections = (scR.data ?? []) as Section[]
      if (activeYearId) {
        const { data: enrollData } = await db
          .from('enrollments')
          .select('section_id')
          .eq('school_year_id', activeYearId)
          .eq('status', 'active')
        const secIds = new Set((enrollData ?? []).map((e: any) => e.section_id))
        const filtered = allSections.filter(s => secIds.has(s.id))
        setSections(filtered.length > 0 ? filtered : allSections)
      } else {
        setSections(allSections)
      }
      setLoading(false)
    })().finally(() => clearTimeout(t))
    return () => clearTimeout(t)
  }, [profile?.id])

  // ── Load teacher assignments (teacherTA) ─────────────────────────────────
  // Loaded automatically so the generator always has teacher data available
  useEffect(() => {
    if (!selectedYear) return
    ;(async () => {
      const db = supabase as any
      const { data: taData } = await db
        .from('teacher_assignments')
        .select('teacher_id, section_id, grade_subject:grade_subjects(subject_catalog_id)')
        .eq('school_year_id', selectedYear)
        .eq('is_active', true)
      const ta = (taData ?? []).map((r: any) => ({
        teacher_id: r.teacher_id,
        section_id: r.section_id,
        subject_catalog_id: r.grade_subject?.subject_catalog_id ?? '',
      })).filter((a: any) => a.subject_catalog_id)
      setTeacherTA(ta)
    })()
  }, [selectedYear])

  // ── Load GSH config ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedYear || !subjects.length || !grades.length) return
    ;(async () => {
      const db = supabase as any
      const { data } = await db.from('grade_subject_hours').select('*').eq('school_year_id', selectedYear)
      const map: GshMap = {}
      grades.forEach(g => { map[g.id] = {} })

      const savedGrades = new Set<string>()
      ;(data ?? []).forEach((row: any) => {
        if (!map[row.grade_id]) map[row.grade_id] = {}
        map[row.grade_id][row.subject_catalog_id] = { hours: row.weekly_hours, ext: row.is_extracurricular }
        savedGrades.add(row.grade_id)
      })

      // Pre-populate from grade_subjects (Niveles y Grados) for unconfigured grades
      grades.forEach(g => {
        if (savedGrades.has(g.id)) return
        const gs = gradeSubjects.filter(r => r.grade_id === g.id)
        gs.forEach(r => {
          if (!map[g.id][r.subject_catalog_id]) {
            map[g.id][r.subject_catalog_id] = { hours: r.weekly_hours ?? 5, ext: false }
          }
        })
      })

      setGshMap(map)
    })()
  }, [selectedYear, subjects, grades, gradeSubjects])

  // ── Load existing schedules ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedYear || !sections.length) return
    ;(async () => {
      const { data } = await supabase.from('class_schedules')
        .select('section_id,school_year_id,day_of_week,start_time,end_time,subject_catalog_id,teacher_id,color,notes')
        .eq('school_year_id', selectedYear)
      if (data && data.length > 0) {
        setEntries((data as any[]).map(e => ({ ...e, start_time: (e.start_time as string).slice(0, 5) })))
        setHasGenerated(false)
      } else {
        setEntries([])
      }
    })()
  }, [selectedYear, sections])

  // ── Save config ───────────────────────────────────────────────────────────
  const saveCfg = async () => {
    if (!selectedYear) return
    setSavingCfg(true)
    const db = supabase as any
    const rows: any[] = []
    const toDelete: Record<string, string[]> = {}

    Object.entries(gshMap).forEach(([gId, subjMap]) => {
      Object.entries(subjMap).forEach(([sId, val]) => {
        if (val.hours > 0) {
          rows.push({ grade_id: gId, subject_catalog_id: sId, school_year_id: selectedYear, weekly_hours: val.hours, is_extracurricular: val.ext })
        } else {
          if (!toDelete[gId]) toDelete[gId] = []
          toDelete[gId].push(sId)
        }
      })
    })

    for (const [gId, sIds] of Object.entries(toDelete)) {
      if (sIds.length) await db.from('grade_subject_hours').delete().eq('grade_id', gId).eq('school_year_id', selectedYear).in('subject_catalog_id', sIds)
    }
    if (rows.length) {
      const { error } = await db.from('grade_subject_hours').upsert(rows, { onConflict: 'grade_id,subject_catalog_id,school_year_id' })
      if (error) { toast.error('Error: ' + error.message); setSavingCfg(false); return }
    }
    toast.success('Configuración guardada')
    setSavingCfg(false)
  }

  // ── Run generation ────────────────────────────────────────────────────────
  const runGenerate = async () => {
    if (!selectedYear) return
    setGenerating(true)
    const db = supabase as any
    const { data: taData } = await db
      .from('teacher_assignments')
      .select('teacher_id,section_id,grade_subject:grade_subjects(subject_catalog_id)')
      .eq('school_year_id', selectedYear)
      .eq('is_active', true)

    const ta = (taData ?? []).map((r: any) => ({
      teacher_id: r.teacher_id,
      section_id: r.section_id,
      subject_catalog_id: r.grade_subject?.subject_catalog_id ?? '',
    })).filter((a: any) => a.subject_catalog_id)

    const colorMap: Record<string, string> = {}
    subjects.forEach((s, i) => { colorMap[s.id] = PALETTE[i % PALETTE.length] })

    const { entries: gen, conflicts: cs } = generate(grades, sections, levels, gshMap, ta, colorMap, selectedYear, templates, gradeMaxHours, crossGradeGroups, subjects)
    setEntries(gen)
    setConflicts(cs)
    setHasGenerated(true)
    setGenerating(false)
    if (cs.length) toast(`Generado con ${cs.length} advertencias`, { icon: '⚠️' })
    else toast.success(`¡Listo! ${gen.length} entradas en ${sections.length} secciones`)

    // Auto-show AI with generation summary
    if (!showAi) {
      const gradeCount = grades.filter(g => {
        const gsh = gshMap[g.id] ?? {}
        return Object.values(gsh).some(v => v.hours > 0)
      }).length
      const initialMsg: AiMsg = {
        role: 'assistant',
        content: cs.length > 0
          ? `Generé el horario maestro para ${gradeCount} grados (${gen.length} clases en total). Encontré ${cs.length} advertencia${cs.length > 1 ? 's' : ''}:\n${cs.slice(0, 3).map(c => `• ${c}`).join('\n')}${cs.length > 3 ? `\n• ...y ${cs.length - 3} más` : ''}\n\n¿Quieres que te ayude a resolver algún conflicto o ajustar algo en el horario?`
          : `¡Horario generado con éxito! ${gen.length} clases distribuidas en ${gradeCount} grados. Todos los niveles tienen sus 2 recreos (09:45 y 11:30) y el bloque TESLA al final de cada día.\n\n¿Quieres ajustar algo? Puedo sugerirte cambios o explicarte cómo quedó cualquier grado.`
      }
      setAiMsgs([initialMsg])
      setShowAi(true)
    }
  }

  // ── Generate with OpenAI ─────────────────────────────────────────────────
  const runGenerateAI = async () => {
    if (!selectedYear) return
    setGeneratingAI(true)
    try {
      const db = supabase as any
      const { data: taData } = await db
        .from('teacher_assignments')
        .select('teacher_id,section_id,grade_subject:grade_subjects(subject_catalog_id),profile:profiles(full_name)')
        .eq('school_year_id', selectedYear)
        .eq('is_active', true)

      const ta = (taData ?? []).map((r: any) => ({
        teacher_id: r.teacher_id,
        section_id: r.section_id,
        subject_catalog_id: r.grade_subject?.subject_catalog_id ?? '',
        teacher_name: r.profile?.full_name ?? null,
      })).filter((a: any) => a.subject_catalog_id)

      const colorMap: Record<string, string> = {}
      subjects.forEach((s, i) => { colorMap[s.id] = PALETTE[i % PALETTE.length] })

      // Build classSlotsPerLevel (all level groups × all days)
      const allLgsRaw = grades.map(g => getLG(g.id, grades, levels))
      const allLgs = allLgsRaw.filter((v, i) => allLgsRaw.indexOf(v) === i)
      const classSlotsPerLevel: Record<string, Record<string, { start: string; end: string }[]>> = {}
      for (const lg of allLgs) {
        classSlotsPerLevel[lg] = {}
        for (const day of ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']) {
          classSlotsPerLevel[lg][day] = classSlots(lg, day, templates)
        }
      }

      // Build grade config for API
      const config = grades.map(g => {
        const gsh = gshMap[g.id] ?? {}
        const grSecs = sections.filter(s => s.grade_id === g.id)
        return {
          gradeId: g.id, gradeName: g.name,
          subjects: Object.entries(gsh)
            .filter(([, v]) => v.hours > 0)
            .map(([subjId, val]) => {
              const subj = subjects.find(s => s.id === subjId)
              const secTa = ta.find((a: any) => a.subject_catalog_id === subjId && grSecs.some(s => s.id === a.section_id))
              return {
                subjectId: subjId,
                subjectCode: subj?.code ?? subjId,
                subjectName: subj?.name ?? subjId,
                hours: val.hours,
                ext: val.ext ?? false,
                teacherId: (secTa as any)?.teacher_id ?? null,
                teacherName: (secTa as any)?.teacher_name ?? null,
              }
            })
        }
      }).filter(gc => gc.subjects.length > 0)

      // Build cross-grade groups for API
      const cgForApi = crossGradeGroups.map(grp => {
        const grpGrades = grades.filter(g => grp.gradeIds.includes(g.id))
        const grpSecs = sections.filter(s => grp.gradeIds.includes(s.grade_id))
        const subj = subjects.find(s => s.id === grp.subjectId)
        const secTa = ta.find((a: any) => a.subject_catalog_id === grp.subjectId && grpSecs.some(s => s.id === a.section_id))
        const hours = Math.max(...grpGrades.map(g => gshMap[g.id]?.[grp.subjectId]?.hours ?? 0))
        return {
          id: grp.id, subjectId: grp.subjectId,
          subjectCode: subj?.code ?? '', subjectName: subj?.name ?? '',
          gradeIds: grp.gradeIds, gradeNames: grpGrades.map(g => g.name),
          teacherId: (secTa as any)?.teacher_id ?? null, teacherName: (secTa as any)?.teacher_name ?? null,
          hours
        }
      })

      const sectionsForApi = sections.map(s => {
        const grade = grades.find(g => g.id === s.grade_id)
        return { id: s.id, name: s.name, gradeId: s.grade_id, gradeName: grade?.name ?? '', lg: grade ? getLG(grade.id, grades, levels) : 'elementary' }
      })

      const res = await fetch(apiUrl('/api/ai-generate-schedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearId: selectedYear,
          classSlotsPerLevel,
          sections: sectionsForApi,
          config,
          colorMap,
          crossGradeGroups: cgForApi
        })
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(`Error IA: ${err.error ?? 'desconocido'}`)
        return
      }

      const data = await res.json()

      // Guard: if AI returned no class entries, don't wipe the existing schedule
      const aiEntries: any[] = data.entries ?? []
      if (aiEntries.length === 0) {
        toast.error('El coordinador IA no generó entradas — el horario actual no fue modificado.')
        return
      }

      // Generate fresh fixed slots (Devocional, Recreo, Almuerzo, etc.)
      const { entries: fullGen } = generate(grades, sections, levels, {}, [], colorMap, selectedYear, templates, gradeMaxHours, [], subjects)
      const freshFixed = fullGen.filter(e => !e.subject_catalog_id || e.notes?.startsWith('TESLA:'))

      setEntries([...freshFixed, ...aiEntries])
      setHasGenerated(true)

      const warns = data.warnings ?? []
      if (warns.length) {
        setConflicts(warns)
        toast(`Coordinador IA generó el horario con ${warns.length} advertencia${warns.length !== 1 ? 's' : ''}`, { icon: '🤖⚠️' })
      } else {
        setConflicts([])
        toast.success(`🤖 Coordinador IA generó ${data.totalPlaced} clases exitosamente`)
      }
    } catch (e) {
      toast.error(`Error: ${String(e)}`)
    } finally {
      setGeneratingAI(false)
    }
  }

  // ── Save to DB ────────────────────────────────────────────────────────────
  const saveToDb = async () => {
    setSaving(true)
    const db = supabase as any
    const secSet = new Set<string>()
    entries.forEach(e => secSet.add(e.section_id))
    const secIds: string[] = []
    secSet.forEach(id => secIds.push(id))

    if (secIds.length) {
      const { error } = await db.from('class_schedules').delete().in('section_id', secIds).eq('school_year_id', selectedYear)
      if (error) { toast.error('Error al limpiar: ' + error.message); setSaving(false); return }
    }
    for (let i = 0; i < entries.length; i += 500) {
      const { error } = await db.from('class_schedules').insert(entries.slice(i, i + 500))
      if (error) { toast.error('Error al guardar: ' + error.message); setSaving(false); return }
    }
    toast.success(`${entries.length} entradas guardadas`)
    setSaving(false)
    setHasGenerated(false)
  }

  // ── Hours controls ────────────────────────────────────────────────────────
  const adj = (gId: string, sId: string, delta: number) => {
    setGshMap(prev => {
      const cur = prev[gId]?.[sId] ?? { hours: 0, ext: false }
      const maxAllowed = cur.ext ? 2 : 12
      return { ...prev, [gId]: { ...(prev[gId] ?? {}), [sId]: { ...cur, hours: Math.max(0, Math.min(maxAllowed, cur.hours + delta)) } } }
    })
  }
  const toggleExt = (gId: string, sId: string) => {
    setGshMap(prev => {
      const cur = prev[gId]?.[sId] ?? { hours: 0, ext: false }
      const nextExt = !cur.ext
      // Extracurriculars se comparten entre secciones: limitar a máx 2 h/sem
      const nextHours = nextExt ? Math.min(cur.hours, 2) || 1 : cur.hours
      return { ...prev, [gId]: { ...(prev[gId] ?? {}), [sId]: { hours: nextHours, ext: nextExt } } }
    })
  }
  const toggleGrade = (gId: string) => {
    setExpandedGrades(prev => {
      const next = new Set<string>()
      prev.forEach(id => next.add(id))
      if (next.has(gId)) next.delete(gId); else next.add(gId)
      return next
    })
  }

  // ── Cell edit ─────────────────────────────────────────────────────────────
  const applyCell = (subjId: string | null) => {
    if (!editCell) return
    const { secId, day, start, end } = editCell
    setEntries(prev => {
      const idx = prev.findIndex(e => e.section_id === secId && e.day_of_week === day && e.start_time === start)
      const updated = [...prev]
      if (idx < 0) {
        // Empty slot — create new entry if a subject was selected
        if (subjId === null) return prev
        const ci = subjects.findIndex(s => s.id === subjId)
        updated.push({
          section_id: secId, school_year_id: selectedYear, day_of_week: day,
          start_time: start, end_time: end, subject_catalog_id: subjId,
          teacher_id: null, color: PALETTE[ci >= 0 ? ci % PALETTE.length : 0], notes: null,
        })
      } else {
        if (subjId === null) {
          updated.splice(idx, 1)
        } else {
          const ci = subjects.findIndex(s => s.id === subjId)
          updated[idx] = { ...updated[idx], subject_catalog_id: subjId, color: PALETTE[ci >= 0 ? ci % PALETTE.length : 0], notes: null }
        }
      }
      return updated
    })
    setHasGenerated(true)
    setEditCell(null)
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────
  const sendAiMsg = async () => {
    if (!aiInput.trim() || aiLoading) return
    const userMsg: AiMsg = { role: 'user', content: aiInput.trim() }
    const newMsgs = [...aiMsgs, userMsg]
    setAiMsgs(newMsgs)
    setAiInput('')
    setAiLoading(true)

    // Build schedule context for AI
    const gradeCtx = grades.map(g => {
      const gsh = gshMap[g.id] ?? {}
      const subjList = Object.entries(gsh)
        .filter(([, v]) => v.hours > 0)
        .map(([sId, v]) => {
          const s = subjects.find(x => x.id === sId)
          return s ? `${s.name}(${v.hours}h${v.ext ? ',ext' : ''})` : ''
        }).filter(Boolean)
      return subjList.length ? `${g.name}: ${subjList.join(', ')}` : null
    }).filter(Boolean).join('\n')

    const ctx = `Contexto del horario maestro en construcción:\n${gradeCtx}\nConflictos actuales: ${conflicts.length > 0 ? conflicts.join('; ') : 'ninguno'}`
    const systemExtra = `\n\nEres el asistente de horarios del colegio E-OS. Ayudas al Pastor Diego a construir el horario maestro.\n${ctx}`

    try {
      const res = await fetch(apiUrl('/api/chat-ia'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs,
          userRole: 'master',
          userName: profile?.full_name ?? 'Pastor Diego',
          systemExtra,
        }),
      })
      const json = await res.json()
      setAiMsgs(prev => [...prev, { role: 'assistant', content: json.content ?? 'Sin respuesta.' }])
    } catch {
      setAiMsgs(prev => [...prev, { role: 'assistant', content: 'Error al conectar con Míster EOS.' }])
    }
    setAiLoading(false)
    setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {}
    subjects.forEach((s, i) => { m[s.id] = PALETTE[i % PALETTE.length] })
    return m
  }, [subjects])

  const orderedSections = useMemo(() => {
    const result: Section[] = []
    levels.forEach(lv => {
      grades.filter(g => g.level_id === lv.id).forEach(g => {
        sections.filter(s => s.grade_id === g.id).sort((a, b) => a.name.localeCompare(b.name)).forEach(s => result.push(s))
      })
    })
    return result
  }, [levels, grades, sections])

  const entryMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, Entry>>> = {}
    entries.forEach(e => {
      if (!m[e.section_id]) m[e.section_id] = {}
      if (!m[e.section_id][e.day_of_week]) m[e.section_id][e.day_of_week] = {}
      m[e.section_id][e.day_of_week][e.start_time] = e
    })
    return m
  }, [entries])

  const daySlots = useMemo(() => {
    const day = DAY_KEYS[selectedDay]
    const seen = new Map<string, SlotTemplate>()
    const lgs: LevelGroup[] = ['parvularia', 'elementary', 'secondary']
    lgs.forEach(lg => {
      const tpl = templates[lg][day === 'viernes' ? 'half' : 'full']
      tpl.forEach(s => { if (!seen.has(s.start)) seen.set(s.start, s) })
      // Add TESLA post-school row for each level
      const lastSlotEnd = tpl[tpl.length - 1]?.end
      if (lastSlotEnd && !seen.has(lastSlotEnd)) {
        seen.set(lastSlotEnd, { start: lastSlotEnd, end: minsToTime(timeToMins(lastSlotEnd) + 30), type: 'class' })
      }
    })
    const slots: SlotTemplate[] = []
    seen.forEach(v => slots.push(v))
    return slots.sort((a, b) => a.start.localeCompare(b.start))
  }, [selectedDay, templates])

  // Subjects available in grade (from grade_subjects table)
  const gradeSubjectIds = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    gradeSubjects.forEach(gs => {
      if (!m[gs.grade_id]) m[gs.grade_id] = new Set()
      m[gs.grade_id].add(gs.subject_catalog_id)
    })
    return m
  }, [gradeSubjects])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      Cargando...
    </div>
  )

  const day = DAY_KEYS[selectedDay]

  return (
    <div className="flex overflow-hidden bg-white" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      {isMaster && (
        <div className="w-52 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-bold text-gray-800">Horas / semana</span>
            </div>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white">
              {schoolYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' ✓' : ''}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {levels.map(lv => (
              <div key={lv.id}>
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-3 pt-2 pb-0.5">{lv.name}</div>
                {grades.filter(g => g.level_id === lv.id).map(g => {
                  const isExp = expandedGrades.has(g.id)
                  const gradeVals = gshMap[g.id] ?? {}
                  const totalH = Object.values(gradeVals).reduce((s, v) => s + v.hours, 0)
                  const lg = getLG(g.id, grades, levels)
                  const slotsMax = availableSlots(lg, templates)
                  const maxH = gradeMaxHours[g.id] ?? slotsMax
                  const over = totalH > maxH
                  // Pool: subjects from Niveles y Grados, or all if none configured
                  const gSubjIds = gradeSubjectIds[g.id]
                  const pool = (gSubjIds && gSubjIds.size > 0)
                    ? subjects.filter(s => { let has = false; gSubjIds.forEach(id => { if (id === s.id) has = true }); return has })
                    : subjects

                  return (
                    <div key={g.id}>
                      {/* Grade header — always visible */}
                      <div className="flex items-center px-2 py-0.5 hover:bg-gray-50">
                        <button onClick={() => toggleGrade(g.id)}
                          className="flex-1 flex items-center gap-1 min-w-0 text-left">
                          <ChevronRight className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${isExp ? 'rotate-90' : ''}`} />
                          <span className="text-xs font-semibold text-gray-700 truncate">{g.name}</span>
                        </button>
                        {/* Per-grade weekly hours limit — always editable */}
                        <div className="flex items-center gap-0.5 shrink-0 ml-1">
                          <button
                            onClick={e => { e.stopPropagation(); setGradeMax(g.id, Math.max(1, maxH - 1)) }}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-gray-500 text-base leading-none font-bold">−</button>
                          <span className={`text-[10px] font-bold px-1 rounded min-w-[36px] text-center ${over ? 'bg-red-100 text-red-600' : totalH > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
                            title="Horas clase / semana para este grado">
                            {totalH}/{maxH}h
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); setGradeMax(g.id, Math.min(60, maxH + 1)) }}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-emerald-100 text-gray-500 text-base leading-none font-bold">+</button>
                        </div>
                      </div>

                      {isExp && (
                        <div className="bg-white border-y border-gray-100 py-0.5">
                          {subjects.filter(s => (gradeVals[s.id]?.hours ?? 0) > 0).map(s => {
                            const val = gradeVals[s.id]
                            return (
                              <div key={s.id} className="flex items-center gap-0.5 px-2 py-0.5 bg-indigo-50/60">
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: colorMap[s.id] }} />
                                <span className="flex-1 text-[10px] truncate ml-0.5 text-gray-900 font-bold" title={s.name}>{s.code}</span>
                                <button onClick={() => adj(g.id, s.id, -1)}
                                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-gray-500 leading-none text-base">−</button>
                                <span className="w-5 text-center text-[11px] font-bold text-gray-700">{val.hours}</span>
                                <button onClick={() => adj(g.id, s.id, +1)}
                                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 leading-none text-base">+</button>
                                <button onClick={() => toggleExt(g.id, s.id)}
                                  title={val.ext ? 'Extracurricular: se une entre secciones' : 'Marcar como extracurricular'}
                                  className={`w-4 h-4 text-[10px] flex items-center justify-center rounded ${val.ext ? 'bg-indigo-100 text-indigo-600' : 'text-gray-300 hover:text-gray-400'}`}>
                                  ∪
                                </button>
                              </div>
                            )
                          })}
                          {/* Add subject — filtered to this grade's subjects */}
                          {(() => {
                            const unconfigured = pool.filter(s => (gradeVals[s.id]?.hours ?? 0) === 0)
                            if (!unconfigured.length) return null
                            return (
                              <div className="px-2 pt-1 pb-1.5">
                                <select value=""
                                  onChange={e => { if (e.target.value) { adj(g.id, e.target.value, 1); e.target.value = '' } }}
                                  className="w-full text-[10px] border border-dashed border-gray-300 rounded px-1 py-0.5 bg-white text-gray-500 cursor-pointer hover:border-indigo-400">
                                  <option value="">+ Agregar materia...</option>
                                  {unconfigured.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="p-2.5 border-t border-gray-200 bg-white shrink-0 space-y-1.5">
            <button onClick={saveCfg} disabled={savingCfg}
              className="w-full flex items-center justify-center gap-1 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-3 h-3" />
              {savingCfg ? 'Guardando...' : 'Guardar config'}
            </button>
            <button onClick={() => { setSchedDraft(schedConfig); setShowSchedCfg(true) }}
              className="w-full flex items-center justify-center gap-1 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg transition-colors border border-gray-200">
              ⚙️ Configurar Horarios por Nivel
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={runGenerate} disabled={generating || generatingAI}
                className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors">
                {generating
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Wand2 className="w-3 h-3" />}
                {generating ? '...' : 'Generar'}
              </button>
              <button onClick={runGenerateAI} disabled={generating || generatingAI}
                title="Coordinador IA de horarios de clase"
                className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors">
                {generatingAI
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <span className="text-sm">🤖</span>}
                {generatingAI ? 'Coordinando...' : 'Coordinador IA'}
              </button>
            </div>
            {/* AI chat toggle */}
            <button onClick={() => setShowAi(v => !v)}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${showAi ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-300 text-blue-600 hover:bg-blue-50'}`}>
              <Bot className="w-3.5 h-3.5" />
              {showAi ? 'Cerrar IA' : 'Consultar Míster EOS'}
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Main view tabs */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
          <button onClick={() => setMainTab('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mainTab === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Grid de Materias
          </button>
          <button onClick={() => setMainTab('grado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mainTab === 'grado' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Horario por Grado
          </button>
          <button onClick={() => { setMainTab('docentes'); loadTeacherProfiles() }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mainTab === 'docentes' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Horario por Docente
          </button>
        </div>

        {/* ── GRADO VIEW ────────────────────────────────────────────────────── */}
        {mainTab === 'grado' && (() => {
          const viewGrade = grades.find(g => g.id === selectedViewGradeId)
          const viewSections = sections.filter(s => s.grade_id === selectedViewGradeId)
          const displaySections = selectedViewSecId === 'all' ? viewSections : viewSections.filter(s => s.id === selectedViewSecId)
          const viewLg = viewGrade ? getLG(viewGrade.id, grades, levels) : 'elementary'
          const gsh = gshMap[selectedViewGradeId] ?? {}
          const configuredSubjects = Object.entries(gsh).filter(([, v]) => v.hours > 0)

          // Count placed hours per subject per section for this grade
          const placedHours: Record<string, number> = {}
          if (selectedViewGradeId) {
            entries.forEach(e => {
              if (!e.subject_catalog_id) return
              const sec = sections.find(s => s.id === e.section_id)
              if (!sec || sec.grade_id !== selectedViewGradeId) return
              if (selectedViewSecId !== 'all' && e.section_id !== selectedViewSecId) return
              if (e.notes?.startsWith('TESLA:')) return
              placedHours[e.subject_catalog_id] = (placedHours[e.subject_catalog_id] ?? 0) + 1
            })
          }

          // Time slots for this grade's level
          const viewSlots: SlotTemplate[] = []
          if (viewGrade) {
            const seen = new Map<string, SlotTemplate>();
            (['lunes','martes','miercoles','jueves','viernes'] as const).forEach(d => {
              const isHalf = d === 'viernes'
              const tpl = templates[viewLg][isHalf ? 'half' : 'full']
              tpl.forEach(s => { if (!seen.has(s.start)) seen.set(s.start, s) })
              // Post-school TESLA row
              const lastEnd = tpl[tpl.length - 1]?.end
              if (lastEnd && !seen.has(lastEnd)) seen.set(lastEnd, { start: lastEnd, end: minsToTime(timeToMins(lastEnd) + 30), type: 'class' })
            })
            seen.forEach(v => viewSlots.push(v))
            viewSlots.sort((a, b) => a.start.localeCompare(b.start))
          }

          const secCount = selectedViewSecId === 'all' ? viewSections.length : 1

          return (
            <div className="flex-1 overflow-auto p-4 flex gap-4 min-h-0">
              {/* LEFT: timetable */}
              <div className="flex-1 overflow-auto min-w-0">
                {/* Controls */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <select value={selectedViewGradeId} onChange={e => { setSelectedViewGradeId(e.target.value); setSelectedViewSecId('all') }}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-[180px]">
                    <option value="">— Seleccionar grado —</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {viewSections.length > 1 && (
                    <select value={selectedViewSecId} onChange={e => setSelectedViewSecId(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      <option value="all">Todas las secciones</option>
                      {viewSections.map(s => <option key={s.id} value={s.id}>Sección {s.name}</option>)}
                    </select>
                  )}
                  {viewGrade && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                      {displaySections.length} sección{displaySections.length !== 1 ? 'es' : ''} · Nivel {viewLg}
                    </span>
                  )}
                </div>

                {!selectedViewGradeId ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                    <div className="text-4xl opacity-20">📅</div>
                    <p className="text-sm">Selecciona un grado para ver su horario</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-xs min-w-max">
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-white shadow-sm">
                          <th className="border border-gray-200 p-2 text-left w-14 text-gray-400 font-medium text-[10px] bg-gray-50 sticky left-0 z-30">Hora</th>
                          {DAY_KEYS.map((d, di) => {
                            const t = EOS_INFO[d]
                            return displaySections.map(sec => (
                              <th key={`${d}-${sec.id}`}
                                className={`border border-gray-200 p-1 text-center min-w-[80px] bg-white ${di > 0 && displaySections.indexOf(sec) === 0 ? 'border-l-2 border-l-gray-300' : ''}`}>
                                <div className="font-black text-[11px]" style={{ color: t.color }}>{t.short} {DAYS[di]}</div>
                                {displaySections.length > 1 && <div className="text-[9px] text-gray-400 font-normal">Secc. {sec.name}</div>}
                              </th>
                            ))
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {viewSlots.map(slot => (
                          <tr key={slot.start} className="hover:bg-emerald-50/20">
                            <td className="border border-gray-200 p-1.5 text-gray-500 font-mono text-[10px] whitespace-nowrap bg-gray-50 sticky left-0 z-10">{slot.start}</td>
                            {DAY_KEYS.map((d, di) => {
                              const isHalf = d === 'viernes'
                              const tpl = templates[viewLg][isHalf ? 'half' : 'full']
                              const hasSlot = tpl.some(t => t.start === slot.start)
                              return displaySections.map(sec => {
                                const borderL = di > 0 && displaySections.indexOf(sec) === 0 ? 'border-l-2 border-l-gray-300' : ''
                                if (!hasSlot) {
                                  // Check for post-school TESLA
                                  const postEntry = entryMap[sec.id]?.[d]?.[slot.start]
                                  if (!postEntry?.notes?.startsWith('TESLA:')) {
                                    return <td key={`${d}-${sec.id}`} className={`border border-gray-100 bg-gray-100/40 ${borderL}`} />
                                  }
                                }
                                const entry = entryMap[sec.id]?.[d]?.[slot.start]
                                if (entry?.notes?.startsWith('TESLA:')) {
                                  const eos = EOS_INFO[d]
                                  return (
                                    <td key={`${d}-${sec.id}`} className={`border border-gray-100 p-0 ${borderL}`}>
                                      <div className="h-full min-h-[18px] flex items-center justify-center" style={{ backgroundColor: eos.color + '18', borderLeft: `3px solid ${eos.color}` }}>
                                        <span className="text-[8px] font-bold opacity-50" style={{ color: eos.color }}>{eos.short}</span>
                                      </div>
                                    </td>
                                  )
                                }
                                if (entry && !entry.subject_catalog_id) {
                                  return (
                                    <td key={`${d}-${sec.id}`} className={`border border-gray-100 p-0.5 ${borderL}`}>
                                      <div className="text-center text-[9px] font-semibold py-0.5 rounded text-gray-500" style={{ backgroundColor: (entry.color ?? '#94a3b8') + '22' }}>{entry.notes}</div>
                                    </td>
                                  )
                                }
                                const subj = entry?.subject_catalog_id ? subjects.find(s => s.id === entry.subject_catalog_id) : null
                                const canPaint = isAdmin && tpl.find(t => t.start === slot.start)?.type === 'class'
                                const paintCursor = canPaint && paintSubjectId ? 'cursor-cell' : canPaint ? 'cursor-pointer' : ''
                                const paintHandler = () => {
                                  if (!canPaint) return
                                  const slotInfo = tpl.find(t => t.start === slot.start)
                                  if (paintSubjectId) {
                                    // Paint this cell with the active subject
                                    const ci = subjects.findIndex(s => s.id === paintSubjectId)
                                    const color = PALETTE[ci >= 0 ? ci % PALETTE.length : 0]
                                    setEntries(prev => {
                                      const updated = [...prev]
                                      const idx = updated.findIndex(e => e.section_id === sec.id && e.day_of_week === d && e.start_time === slot.start)
                                      if (idx >= 0) { updated[idx] = { ...updated[idx], subject_catalog_id: paintSubjectId, color, notes: null } }
                                      else { updated.push({ section_id: sec.id, school_year_id: selectedYear, day_of_week: d, start_time: slot.start, end_time: slotInfo?.end ?? slot.start, subject_catalog_id: paintSubjectId, teacher_id: null, color, notes: null }) }
                                      return updated
                                    })
                                    setHasGenerated(true)
                                  } else if (subj) {
                                    // Click on occupied cell → remove subject
                                    setEntries(prev => prev.filter(e => !(e.section_id === sec.id && e.day_of_week === d && e.start_time === slot.start && e.subject_catalog_id)))
                                    setHasGenerated(true)
                                  }
                                }
                                return (
                                  <td key={`${d}-${sec.id}`}
                                    className={`border border-gray-100 p-0.5 ${borderL} ${paintCursor} group`}
                                    onClick={paintHandler}>
                                    {subj ? (
                                      <div className={`text-center font-black text-[11px] py-0.5 rounded text-white transition-opacity ${paintSubjectId ? 'group-hover:opacity-60' : ''}`}
                                        style={{ backgroundColor: entry?.color ?? colorMap[subj.id] ?? '#6366f1' }}>
                                        {subj.code}
                                      </div>
                                    ) : canPaint ? (
                                      <div className={`py-2 text-center text-[11px] font-bold transition-all ${paintSubjectId ? 'text-gray-300 group-hover:text-white group-hover:rounded' : 'text-gray-200'}`}
                                        style={paintSubjectId ? { '--hover-bg': colorMap[paintSubjectId] ?? '#6366f1' } as React.CSSProperties : {}}>
                                        {paintSubjectId ? '✦' : '·'}
                                      </div>
                                    ) : (
                                      <div className="py-2 text-center text-[10px] text-gray-200">·</div>
                                    )}
                                  </td>
                                )
                              })
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RIGHT: subject palette + summary panel */}
              {selectedViewGradeId && (
                <div className="w-60 shrink-0 flex flex-col gap-2">
                  {/* Active paint indicator */}
                  {paintSubjectId ? (
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 text-white text-xs font-bold shadow-md"
                      style={{ backgroundColor: colorMap[paintSubjectId] ?? '#6366f1', borderColor: colorMap[paintSubjectId] ?? '#6366f1' }}>
                      <span className="text-base">✦</span>
                      <span className="flex-1 truncate">{subjects.find(s => s.id === paintSubjectId)?.name}</span>
                      <button onClick={() => setPaintSubjectId(null)} className="opacity-80 hover:opacity-100 font-black">✕</button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 text-center py-1 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      Haz clic en una materia para pintar celdas
                    </div>
                  )}

                  <div className="text-xs font-bold text-gray-600 mt-1">Materias del grado</div>
                  {configuredSubjects.length === 0 ? (
                    <p className="text-xs text-gray-400">No hay materias configuradas para este grado.</p>
                  ) : (
                    configuredSubjects.map(([subjId, val]) => {
                      const subj = subjects.find(s => s.id === subjId)
                      if (!subj) return null
                      const target = val.hours * secCount
                      const placed = placedHours[subjId] ?? 0
                      const pct = target > 0 ? Math.min(100, Math.round(placed / target * 100)) : 0
                      const ok = placed >= target
                      const none = placed === 0
                      const isActive = paintSubjectId === subjId
                      return (
                        <div key={subjId}
                          className={`rounded-xl border p-2 transition-all select-none
                            ${isActive ? 'shadow-md' : 'hover:shadow-sm'}
                            ${ok ? 'border-emerald-200 bg-emerald-50' : none ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}
                          style={isActive ? { outline: `2px solid ${colorMap[subjId] ?? '#6366f1'}`, outlineOffset: '2px' } : {}}>
                          {/* Header row: color dot + name + hour controls */}
                          <div className="flex items-center gap-1 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-sm shrink-0`}
                              style={{ backgroundColor: colorMap[subjId] ?? '#6366f1' }} />
                            <span className="text-[11px] font-bold text-gray-800 truncate flex-1 cursor-pointer"
                              title={`Pintar: ${subj.name}`}
                              onClick={() => setPaintSubjectId(isActive ? null : subjId)}>
                              {subj.name}
                            </span>
                            {/* Hour controls */}
                            <button onClick={e => { e.stopPropagation(); adj(selectedViewGradeId, subjId, -1) }}
                              className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-gray-500 text-sm leading-none font-bold shrink-0">−</button>
                            <span className={`text-[10px] font-bold w-8 text-center shrink-0 ${ok ? 'text-emerald-600' : none ? 'text-red-600' : 'text-amber-600'}`}>
                              {placed}/{target}h
                            </span>
                            <button onClick={e => { e.stopPropagation(); adj(selectedViewGradeId, subjId, +1) }}
                              className="w-4 h-4 flex items-center justify-center rounded hover:bg-emerald-100 text-gray-500 text-sm leading-none font-bold shrink-0">+</button>
                          </div>
                          <div className="h-1.5 bg-white rounded-full overflow-hidden border border-gray-200">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: ok ? '#10b981' : none ? '#ef4444' : '#f59e0b' }} />
                          </div>
                          {!ok && (
                            <div className={`text-[9px] mt-0.5 flex justify-between items-center ${none ? 'text-red-500 font-bold' : 'text-amber-600'}`}>
                              <span>{none ? 'Sin colocar — clic para pintar' : `Faltan ${target - placed}h — clic para pintar`}</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  {/* Add subject from grade view */}
                  {selectedViewGradeId && (() => {
                    const gSubjIds = gradeSubjectIds[selectedViewGradeId]
                    const pool = (gSubjIds && gSubjIds.size > 0)
                      ? subjects.filter(s => { let has = false; gSubjIds.forEach(id => { if (id === s.id) has = true }); return has })
                      : subjects
                    const unconfigured = pool.filter(s => (gsh[s.id]?.hours ?? 0) === 0)
                    if (!unconfigured.length) return null
                    return (
                      <div className="pt-1">
                        <select value=""
                          onChange={e => { if (e.target.value) { adj(selectedViewGradeId, e.target.value, 1); e.target.value = '' } }}
                          className="w-full text-[10px] border border-dashed border-indigo-300 rounded-lg px-2 py-1.5 bg-white text-gray-500 cursor-pointer hover:border-indigo-500 transition-colors">
                          <option value="">+ Agregar materia al grado...</option>
                          {unconfigured.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )
                  })()}

                  {configuredSubjects.length > 0 && (() => {
                    const totalTarget = configuredSubjects.reduce((s, [, v]) => s + v.hours * secCount, 0)
                    const totalPlaced = configuredSubjects.reduce((s, [id]) => s + (placedHours[id] ?? 0), 0)
                    const missing = configuredSubjects.filter(([id, v]) => (placedHours[id] ?? 0) < v.hours * secCount)
                    return (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <div className="flex justify-between text-[11px] font-bold text-gray-700">
                          <span>Total semanal</span>
                          <span className={totalPlaced >= totalTarget ? 'text-emerald-600' : 'text-amber-600'}>{totalPlaced}/{totalTarget}h</span>
                        </div>
                        {missing.length > 0 && (
                          <div className="mt-1 text-[10px] text-red-500">
                            {missing.length} materia{missing.length !== 1 ? 's' : ''} incompleta{missing.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── DOCENTES VIEW ─────────────────────────────────────────────────── */}
        {mainTab === 'docentes' && (
          <div className="flex-1 overflow-auto p-4">
            {/* Teacher selector */}
            <div className="flex items-center gap-3 mb-4">
              <select
                value={selectedTeacherId}
                onChange={e => setSelectedTeacherId(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 min-w-[220px]">
                <option value="">— Seleccionar docente —</option>
                {teacherProfiles.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
              {loadingTeachers && <span className="text-xs text-gray-400">Cargando...</span>}
              {selectedTeacherId && (
                <span className="text-xs text-violet-600 font-semibold bg-violet-50 px-2.5 py-1 rounded-full">
                  {teacherTotalHours} clases / semana
                </span>
              )}
            </div>

            {selectedTeacherId && teacherSchedule.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-12">
                Este docente no tiene clases asignadas en el horario actual.<br/>
                <span className="text-xs">Generá el horario primero o verificá sus asignaciones de materias.</span>
              </div>
            )}

            {selectedTeacherId && teacherSchedule.length > 0 && (
              <div className="overflow-x-auto">
                <table className="border-collapse text-xs min-w-max">
                  <thead>
                    <tr>
                      <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-gray-500 font-mono w-16">Hora</th>
                      {['Lunes','Martes','Miércoles','Jueves','Viernes'].map((d, i) => {
                        const key = ['lunes','martes','miercoles','jueves','viernes'][i]
                        const t = EOS_INFO[key as keyof typeof EOS_INFO]
                        return (
                          <th key={d} className="border border-gray-200 bg-gray-50 px-3 py-2 text-center font-bold w-28" style={{ color: t.color }}>
                            {t.short} {d}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {teacherTimeSlots.map(time => (
                      <tr key={time} className="hover:bg-violet-50/20">
                        <td className="border border-gray-200 p-1.5 text-gray-500 font-mono text-[10px] bg-gray-50">{time}</td>
                        {['lunes','martes','miercoles','jueves','viernes'].map(day => {
                          const slot = teacherSchedule.find(s => s.day === day && s.start === time)
                          return (
                            <td key={day} className="border border-gray-100 p-0.5">
                              {slot ? (
                                <div className="rounded px-1.5 py-1 text-white text-center" style={{ backgroundColor: slot.color }}>
                                  <div className="font-black text-[11px]">{slot.subjectCode}</div>
                                  {slot.sectionNames.length > 0 && (
                                    <div className="text-[9px] opacity-90 font-semibold">
                                      {slot.sectionNames.join(', ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="py-3" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Subject legend */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {teacherSchedule.filter((s, i, a) => a.findIndex(x => x.subjectId === s.subjectId) === i).map(s => (
                    <div key={s.subjectId} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-white text-[10px] font-bold" style={{ backgroundColor: s.color }}>
                      {s.subjectCode} — {s.subjectName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Day tabs + save bar */}
        {mainTab === 'grid' && (<>
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap gap-y-1">
          {DAYS.map((d, i) => {
            const t = EOS_INFO[DAY_KEYS[i]]
            const active = selectedDay === i
            return (
              <button key={i} onClick={() => setSelectedDay(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                <span className="font-black text-sm" style={active ? { color: 'white' } : { color: t.color }}>{t.short}</span>
                {d}
                {active && <span className="text-[9px] opacity-75">{t.label}</span>}
              </button>
            )
          })}

          {isAdmin && (
            <button
              onClick={() => { setSelectionMode(v => !v); setSelectedCells(new Set()) }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ml-2 flex items-center gap-1.5 ${selectionMode ? 'bg-violet-600 text-white shadow-md' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}>
              {selectionMode ? <><X className="w-3 h-3" /> Cancelar selección</> : <>✦ Seleccionar celdas</>}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!isMaster && (
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                {schoolYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            )}
            {conflicts.length > 0 && (
              <button onClick={() => setShowConflicts(v => !v)}
                className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflicts.length} advertencias
              </button>
            )}
            {hasGenerated && isAdmin && (
              <button onClick={saveToDb} disabled={saving}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Guardando...' : 'Guardar horarios'}
              </button>
            )}
          </div>
        </div>

        {/* Conflicts strip */}
        {showConflicts && conflicts.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-amber-800">Advertencias</span>
              <button onClick={() => setShowConflicts(false)}><X className="w-4 h-4 text-amber-600" /></button>
            </div>
            <ul>{conflicts.map((c, idx) => <li key={idx} className="text-xs text-amber-700">• {c}</li>)}</ul>
          </div>
        )}

        {/* TESLA legend strip */}
        <div className="flex items-center gap-3 px-3 py-1 bg-gray-50 border-b border-gray-100 shrink-0">
          <Zap className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="text-[10px] text-gray-400">EOS Project hoy:</span>
          <span className="text-[11px] font-bold" style={{ color: EOS_INFO[day].color }}>
            {EOS_INFO[day].short} — {EOS_INFO[day].label}
          </span>
          <span className="text-[9px] text-gray-400 ml-1">(después de clases, 15 min extra)</span>
        </div>

        {/* Master grid */}
        <div className="flex-1 overflow-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <Wand2 className="w-12 h-12 opacity-20" />
              <p className="text-sm">Configura las horas por grado y presiona <strong>Generar</strong></p>
            </div>
          ) : (
            <table className="border-collapse text-xs min-w-max w-full">
              <thead className="sticky top-0 z-20">
                <tr className="bg-white shadow-sm">
                  <th className="border border-gray-200 p-2 text-left w-16 text-gray-400 font-medium text-[10px] bg-gray-50 sticky left-0 z-30">Hora</th>
                  {orderedSections.map((sec, i) => {
                    const grade = grades.find(g => g.id === sec.grade_id)
                    const prevGradeId = i > 0 ? orderedSections[i - 1].grade_id : null
                    const isNewGrade = prevGradeId !== sec.grade_id
                    const sameSecs = sections.filter(s => s.grade_id === sec.grade_id)
                    return (
                      <th key={sec.id}
                        className={`border border-gray-200 p-1 text-center min-w-[58px] bg-white ${isNewGrade ? 'border-l-2 border-l-gray-400' : ''}`}>
                        <div className="font-black text-[11px] text-gray-800">{grade?.code || grade?.name}</div>
                        {sameSecs.length > 1 && <div className="text-[9px] text-gray-400 font-normal">{sec.name}</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {daySlots.map(slot => (
                  <tr key={slot.start} className="hover:bg-blue-50/10">
                    <td className="border border-gray-200 p-1.5 text-gray-500 font-mono text-[10px] whitespace-nowrap bg-gray-50 sticky left-0 z-10">
                      {slot.start}
                    </td>
                    {orderedSections.map((sec, i) => {
                      const prevGradeId = i > 0 ? orderedSections[i - 1].grade_id : null
                      const isNewGrade = prevGradeId !== sec.grade_id
                      const lg = getLG(sec.grade_id, grades, levels)
                      const tpl = templates[lg][day === 'viernes' ? 'half' : 'full']
                      const hasSlot = tpl.some(t => t.start === slot.start)
                      const borderCls = isNewGrade ? 'border-l-2 border-l-gray-400' : ''

                      // Post-school TESLA rows don't have template slots — still render TESLA entry if present
                      const postSchoolEntry = !hasSlot ? entryMap[sec.id]?.[day]?.[slot.start] : null
                      if (!hasSlot && !postSchoolEntry?.notes?.startsWith('TESLA:')) {
                        return <td key={sec.id} className={`border border-gray-100 bg-gray-100/50 ${borderCls}`} />
                      }

                      const entry = entryMap[sec.id]?.[day]?.[slot.start]

                      if (entry?.notes?.startsWith('TESLA:')) {
                        const eos = EOS_INFO[day]
                        return (
                          <td key={sec.id} className={`border border-gray-100 p-0 overflow-hidden ${borderCls}`}
                            title={`EOS Project: ${eos.label}`}>
                            <div className="h-full min-h-[18px] flex items-center justify-center"
                              style={{ backgroundColor: eos.color + '18', borderLeft: `3px solid ${eos.color}` }}>
                              <span className="text-[8px] font-bold opacity-40" style={{ color: eos.color }}>
                                {eos.short}
                              </span>
                            </div>
                          </td>
                        )
                      }

                      if (entry && !entry.subject_catalog_id) {
                        return (
                          <td key={sec.id} className={`border border-gray-100 p-0.5 ${borderCls}`}>
                            <div className="text-center text-[9px] font-semibold py-0.5 rounded text-gray-500"
                              style={{ backgroundColor: (entry.color ?? '#94a3b8') + '22' }}>
                              {entry.notes}
                            </div>
                          </td>
                        )
                      }

                      const subj = entry?.subject_catalog_id ? subjects.find(s => s.id === entry.subject_catalog_id) : null
                      const isEditing = editCell?.secId === sec.id && editCell.day === day && editCell.start === slot.start
                      const slotInfo = tpl.find(t => t.start === slot.start)
                      const isClassSlot = slotInfo?.type === 'class'

                      const cellKey = `${sec.id}|${day}|${slot.start}`
                      const isSel = selectionMode && selectedCells.has(cellKey)
                      return (
                        <td key={sec.id}
                          className={`border border-gray-100 p-0.5 ${borderCls} ${isAdmin && isClassSlot ? 'cursor-pointer group' : ''} ${isEditing ? 'ring-2 ring-inset ring-indigo-500' : ''} ${isSel ? 'ring-2 ring-inset ring-violet-500 bg-violet-50' : ''}`}
                          onClick={() => {
                            if (!isAdmin || !isClassSlot) return
                            if (selectionMode) { toggleCellSel(sec.id, day, slot.start) }
                            else { setEditCell({ secId: sec.id, day, start: slot.start, end: slotInfo?.end ?? slot.start }) }
                          }}>
                          {subj ? (
                            <div className={`text-center font-black text-[11px] py-0.5 rounded text-white truncate ${isSel ? 'opacity-70' : ''}`}
                              style={{ backgroundColor: entry?.color ?? colorMap[subj.id] ?? '#6366f1' }}>
                              {subj.code}
                            </div>
                          ) : entry ? (
                            <div className="text-center text-[9px] py-0.5 rounded bg-amber-50 text-amber-500">?</div>
                          ) : isClassSlot && isAdmin ? (
                            <div className={`py-1.5 text-center text-[10px] font-bold transition-colors ${isSel ? 'text-violet-400' : 'text-gray-200 group-hover:text-indigo-400'}`}>
                              {isSel ? '✓' : '+'}
                            </div>
                          ) : (
                            <div className="py-2" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Floating selection action bar ───────────────────────────────── */}
        {selectionMode && selectedCells.size > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white border border-violet-200 rounded-2xl shadow-2xl p-3 flex items-center gap-3 z-50 max-w-[90vw] flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-sm font-bold text-gray-700">{selectedCells.size} celda{selectedCells.size !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {subjects.map(s => (
                <button key={s.id}
                  onClick={() => assignToSelected(s.id)}
                  title={s.name}
                  className="px-2.5 py-1 rounded-lg text-white text-[11px] font-black hover:scale-110 hover:shadow-md transition-all active:scale-95"
                  style={{ backgroundColor: colorMap[s.id] ?? '#6366f1' }}>
                  {s.code}
                </button>
              ))}
              <button onClick={() => assignToSelected(null)}
                className="px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-[11px] font-bold hover:bg-red-200 transition-colors">
                Borrar
              </button>
            </div>
            <button onClick={() => { setSelectedCells(new Set()); setSelectionMode(false) }}
              className="text-gray-400 hover:text-gray-700 shrink-0 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        </>)} {/* end mainTab === 'grid' */}
      </div>

      {/* ── AI Chat panel ──────────────────────────────────────────────────── */}
      {showAi && (
        <div className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-blue-600 shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white">Míster EOS</span>
              <span className="text-[10px] text-blue-200">Asistente de Horarios</span>
            </div>
            <button onClick={() => setShowAi(false)} className="text-blue-200 hover:text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {aiMsgs.length === 0 && (
              <div className="text-center text-gray-400 text-xs mt-8">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Hola Pastor Diego, soy Míster EOS.</p>
                <p className="mt-1">Puedo ayudarte a revisar el horario, resolver conflictos y sugerir distribuciones óptimas.</p>
                <div className="mt-4 space-y-2">
                  {['¿Cómo quedó el horario de P4?', '¿Hay materias sin colocar?', 'Sugiere cómo distribuir Inglés'].map(q => (
                    <button key={q} onClick={() => setAiInput(q)}
                      className="w-full text-left text-[11px] bg-blue-50 text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] text-xs px-3 py-2 rounded-xl whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-500 text-xs px-3 py-2 rounded-xl rounded-bl-sm">
                  <span className="animate-pulse">Escribiendo...</span>
                </div>
              </div>
            )}
            <div ref={aiEndRef} />
          </div>

          <div className="p-2.5 border-t border-gray-200 shrink-0">
            <div className="flex gap-2">
              <input
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMsg() } }}
                placeholder="Pregunta sobre el horario..."
                className="flex-1 text-xs border border-gray-300 rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-400"
              />
              <button onClick={sendAiMsg} disabled={aiLoading || !aiInput.trim()}
                className="bg-blue-600 text-white p-2 rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cell edit popover ─────────────────────────────────────────────── */}
      {editCell && (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setEditCell(null)}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-gray-200 shadow-2xl rounded-xl p-3 w-56"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700">Cambiar materia</span>
              <button onClick={() => setEditCell(null)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              <button onClick={() => applyCell(null)}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-red-50 text-red-500 font-medium">
                ✕ Limpiar celda
              </button>
              {subjects.map(s => (
                <button key={s.id} onClick={() => applyCell(s.id)}
                  className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorMap[s.id] }} />
                  <span className="font-bold">{s.code}</span>
                  <span className="text-gray-500 truncate text-[10px]">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── Sched Config Modal ───────────────────────────────────────────────── */}
      {showSchedCfg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-black text-gray-900 text-base">⚙️ Configurar Horarios por Nivel</h2>
              <button onClick={() => setShowSchedCfg(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-6">
              {([
                ['parvularia', '🎈 Parvularia (P4, P5, P6)'],
                ['elementary', '📚 Primer y Segundo Ciclo (1°–6°)'],
                ['secondary',  '🎓 Tercer Ciclo y Bachillerato (7°–11°)'],
              ] as [LevelGroup, string][]).map(([lg, label]) => {
                const cfg = schedDraft[lg]
                const set = (key: keyof LevelScheduleConfig, val: string | boolean) =>
                  setSchedDraft(p => ({ ...p, [lg]: { ...p[lg], [key]: val } }))
                return (
                  <div key={lg} className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <h3 className="font-bold text-gray-800 text-sm">{label}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Hora de entrada</label>
                        <input type="time" value={cfg.entry} onChange={e => set('entry', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Salida Lun–Jue</label>
                        <input type="time" value={cfg.exitFull} onChange={e => set('exitFull', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Salida Viernes</label>
                        <input type="time" value={cfg.exitHalf} onChange={e => set('exitHalf', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <div className="border border-indigo-100 bg-indigo-50/40 rounded-lg p-3">
                      <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide mb-2">⏱️ Duración de hora clase</div>
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="text-[10px] text-gray-500 block mb-1">Minutos por clase</label>
                          <input type="number" min={15} max={90} step={5}
                            value={cfg.blockDuration ?? 45}
                            onChange={e => set('blockDuration', Math.max(15, Math.min(90, parseInt(e.target.value) || 45)) as any)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                        </div>
                        <div className="text-[10px] text-indigo-600 font-semibold mt-4">
                          Clases Lun–Jue: {buildTemplate(schedDraft[lg], false).filter(s => s.type === 'class').length} · Vie: {buildTemplate(schedDraft[lg], true).filter(s => s.type === 'class').length}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-green-100 bg-green-50/50 rounded-lg p-3">
                        <div className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-2">🟢 Recreo 1</div>
                        <div className="flex gap-2 items-center">
                          <div>
                            <label className="text-[10px] text-gray-500 block">Inicio</label>
                            <input type="time" value={cfg.recess1Start} onChange={e => set('recess1Start', e.target.value)}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block">Fin</label>
                            <input type="time" value={cfg.recess1End} onChange={e => set('recess1End', e.target.value)}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          </div>
                        </div>
                      </div>
                      <div className="border border-green-100 bg-green-50/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-bold text-green-700 uppercase tracking-wide">🟢 Recreo 2</div>
                          <input type="checkbox" checked={cfg.recess2} onChange={e => set('recess2', e.target.checked)}
                            className="w-3.5 h-3.5 accent-green-600" />
                          <span className="text-[10px] text-gray-500">{cfg.recess2 ? 'activo' : 'desactivado'}</span>
                        </div>
                        {cfg.recess2 && (
                          <div className="flex gap-2 items-center">
                            <div>
                              <label className="text-[10px] text-gray-500 block">Inicio</label>
                              <input type="time" value={cfg.recess2Start} onChange={e => set('recess2Start', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block">Fin</label>
                              <input type="time" value={cfg.recess2End} onChange={e => set('recess2End', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="border border-cyan-100 bg-cyan-50/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide">🍽️ Almuerzo</div>
                        <input type="checkbox" checked={cfg.hasLunch} onChange={e => set('hasLunch', e.target.checked)}
                          className="w-3.5 h-3.5 accent-cyan-600" />
                        <span className="text-[10px] text-gray-500">{cfg.hasLunch ? 'activo' : 'desactivado'}</span>
                      </div>
                      {cfg.hasLunch && (
                        <div className="flex gap-3 items-center">
                          <div>
                            <label className="text-[10px] text-gray-500 block">Inicio</label>
                            <input type="time" value={cfg.lunchStart} onChange={e => set('lunchStart', e.target.value)}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block">Fin</label>
                            <input type="time" value={cfg.lunchEnd} onChange={e => set('lunchEnd', e.target.value)}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          </div>
                          <div className="mt-3 text-[10px] text-cyan-600 font-semibold">
                            Duración: {cfg.lunchStart && cfg.lunchEnd ? `${timeToMins(cfg.lunchEnd) - timeToMins(cfg.lunchStart)} min` : '—'}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Snack + Hand wash (optional, parvularia-style) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-orange-100 bg-orange-50/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">🍎 Refrigerio</div>
                          <input type="checkbox" checked={cfg.hasSnack ?? false} onChange={e => set('hasSnack', e.target.checked)}
                            className="w-3.5 h-3.5 accent-orange-600" />
                          <span className="text-[10px] text-gray-500">{cfg.hasSnack ? 'activo' : 'no'}</span>
                        </div>
                        {cfg.hasSnack && (
                          <div className="flex gap-2">
                            <div>
                              <label className="text-[10px] text-gray-500 block">Inicio</label>
                              <input type="time" value={cfg.snackStart} onChange={e => set('snackStart', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block">Fin</label>
                              <input type="time" value={cfg.snackEnd} onChange={e => set('snackEnd', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="border border-sky-100 bg-sky-50/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-bold text-sky-700 uppercase tracking-wide">🚿 Lavado de manos</div>
                          <input type="checkbox" checked={cfg.hasHandWash ?? false} onChange={e => set('hasHandWash', e.target.checked)}
                            className="w-3.5 h-3.5 accent-sky-600" />
                          <span className="text-[10px] text-gray-500">{cfg.hasHandWash ? 'activo' : 'no'}</span>
                        </div>
                        {cfg.hasHandWash && (
                          <div className="flex gap-2">
                            <div>
                              <label className="text-[10px] text-gray-500 block">Inicio</label>
                              <input type="time" value={cfg.handWashStart} onChange={e => set('handWashStart', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block">Fin</label>
                              <input type="time" value={cfg.handWashEnd} onChange={e => set('handWashEnd', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setShowSchedCfg(false)}
                className="text-sm text-gray-600 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold">
                Cancelar
              </button>
              <button onClick={() => {
                setSchedConfig(schedDraft)
                try { localStorage.setItem('eos_sched_config', JSON.stringify(schedDraft)) } catch {}
                setShowSchedCfg(false)
                toast.success('Horarios configurados — vuelve a Generar')
              }}
                className="text-sm text-white px-6 py-2.5 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 transition-colors">
                Guardar configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
