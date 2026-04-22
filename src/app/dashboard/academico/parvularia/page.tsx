'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Baby, Save, CheckCircle2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import BackButton from '@/components/ui/BackButton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const TRIMESTRES = [
  { key: 'T1', label: 'Trimestre I   (Feb – Abr)' },
  { key: 'T2', label: 'Trimestre II  (May – Ago)' },
  { key: 'T3', label: 'Trimestre III (Sep – Nov)' },
] as const

type TrimestreKey = 'T1' | 'T2' | 'T3'
type EvalValue = 'S' | 'N' | 'P'

interface ParvSection {
  id: string
  name: string
  gradeName: string
  gradeCode: string
}

interface ParvIndicator {
  id: string
  text: string
  sort_order: number
}

interface ParvArea {
  id: string
  name: string
  sort_order: number
  indicators: ParvIndicator[]
}

interface ParvStudent {
  id: string
  full_name: string
  enrollment_number: string
}

// evaluations: Map<indicatorId_studentId, value>
type EvalMap = Map<string, EvalValue>

const VALUE_COLORS: Record<EvalValue, string> = {
  S: 'bg-emerald-500 text-white border-emerald-500',
  N: 'bg-red-500   text-white border-red-500',
  P: 'bg-amber-400 text-white border-amber-400',
}
const VALUE_LABELS: Record<EvalValue, string> = {
  S: 'S — Sí lo logra',
  N: 'N — No lo logra',
  P: 'P — En proceso',
}

function EvalBtn({
  value, current, onClick,
}: { value: EvalValue; current: EvalValue | undefined; onClick: () => void }) {
  const active = current === value
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-8 h-8 rounded-lg border-2 text-xs font-bold transition-all',
        active ? VALUE_COLORS[value] : 'border-slate-200 text-slate-400 hover:border-slate-400'
      )}
    >
      {value}
    </button>
  )
}

export default function ParvulariaPage() {
  const { profile } = useAuth()
  const isAdmin = ['master', 'direccion', 'administracion'].includes(profile?.role ?? '')

  const [loading,      setLoading]      = useState(true)
  const [sections,     setSections]     = useState<ParvSection[]>([])
  const [selectedSec,  setSelectedSec]  = useState<string>('')
  const [trimestre,    setTrimestre]    = useState<TrimestreKey>('T1')
  const [areas,        setAreas]        = useState<ParvArea[]>([])
  const [students,     setStudents]     = useState<ParvStudent[]>([])
  const [evals,        setEvals]        = useState<EvalMap>(new Map())
  const [activeArea,   setActiveArea]   = useState<string>('')
  const [saving,       setSaving]       = useState(false)
  const [gradeCode,    setGradeCode]    = useState<string>('')

  // ── 1. Load sections available to this user ─────────────
  useEffect(() => {
    if (!profile) return
    const t = setTimeout(() => setLoading(false), 15000)

    const loadSections = async () => {
      try {
        // Get all parvularia grade IDs (P4, P5, P6)
        const { data: parvGrades } = await db
          .from('grades').select('id, name, code')
          .in('code', ['P4', 'P5', 'P6'])

        if (!parvGrades?.length) { setLoading(false); clearTimeout(t); return }

        const gradeIds = parvGrades.map((g: any) => g.id)
        const gradeMap = new Map<string, { name: string; code: string }>(
          parvGrades.map((g: any) => [g.id, { name: g.name, code: g.code }])
        )

        let secRows: any[] = []

        if (isAdmin) {
          const { data } = await db
            .from('sections').select('id, name, grade_id').in('grade_id', gradeIds)
          secRows = data ?? []
        } else {
          // Teacher: sections where they have teacher_assignments OR are homeroom teacher
          const { data: teacher } = await db
            .from('teachers').select('id').eq('user_id', profile.id).single()
          if (!teacher) { setLoading(false); clearTimeout(t); return }

          const [{ data: taRows }, { data: hrRows }] = await Promise.all([
            db.from('teacher_assignments').select('section_id')
              .eq('teacher_id', teacher.id).in('section_id',
                (await db.from('sections').select('id').in('grade_id', gradeIds)).data?.map((s: any) => s.id) ?? []
              ),
            db.from('sections').select('id, name, grade_id')
              .eq('homeroom_teacher_id', teacher.id).in('grade_id', gradeIds),
          ])

          const taSecIds = new Set((taRows ?? []).map((r: any) => r.section_id))
          const hrSecs   = hrRows ?? []

          // Merge and deduplicate
          const allSecIds = [...new Set([
            ...hrSecs.map((s: any) => s.id),
            ...Array.from(taSecIds),
          ])]

          if (allSecIds.length > 0) {
            const { data } = await db
              .from('sections').select('id, name, grade_id').in('id', allSecIds)
            secRows = data ?? []
          }
        }

        const built: ParvSection[] = secRows.map((s: any) => ({
          id: s.id,
          name: s.name,
          gradeName: gradeMap.get(s.grade_id)?.name ?? '—',
          gradeCode: gradeMap.get(s.grade_id)?.code ?? '—',
        }))

        setSections(built)
        if (built.length > 0) setSelectedSec(built[0].id)
      } finally {
        setLoading(false)
        clearTimeout(t)
      }
    }

    loadSections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // ── 2. When section changes, derive gradeCode ────────────
  useEffect(() => {
    const sec = sections.find(s => s.id === selectedSec)
    setGradeCode(sec?.gradeCode ?? '')
  }, [selectedSec, sections])

  // ── 3. Load areas + indicators when gradeCode changes ───
  useEffect(() => {
    if (!gradeCode) return
    const loadAreas = async () => {
      const { data: areaRows } = await db
        .from('parv_areas').select('id, name, sort_order')
        .eq('grade_code', gradeCode).order('sort_order')

      if (!areaRows?.length) { setAreas([]); setActiveArea(''); return }

      const areaIds = areaRows.map((a: any) => a.id)
      const { data: indRows } = await db
        .from('parv_indicators').select('id, area_id, text, sort_order')
        .in('area_id', areaIds).order('sort_order')

      const built: ParvArea[] = areaRows.map((a: any) => ({
        id: a.id,
        name: a.name,
        sort_order: a.sort_order,
        indicators: (indRows ?? [])
          .filter((i: any) => i.area_id === a.id)
          .sort((x: any, y: any) => x.sort_order - y.sort_order),
      }))

      setAreas(built)
      setActiveArea(built[0]?.id ?? '')
    }
    loadAreas()
  }, [gradeCode])

  // ── 4. Load students + evaluations ──────────────────────
  const loadStudentsAndEvals = useCallback(async () => {
    if (!selectedSec) return

    // Students: try enrollments first, fallback to direct
    const { data: sy } = await db
      .from('school_years').select('id').eq('is_active', true).single()

    let studIds: string[] = []
    if (sy?.id) {
      const { data: enrolls } = await db
        .from('enrollments').select('student_id')
        .eq('section_id', selectedSec).eq('school_year_id', sy.id)
      studIds = (enrolls ?? []).map((e: any) => e.student_id)
    }

    let studs: any[] = []
    if (studIds.length > 0) {
      const { data } = await db
        .from('students').select('id, enrollment_number, user_id, display_name').in('id', studIds)
      studs = data ?? []
    }

    // fallback: no enrollments, get via section's grade
    if (studs.length === 0) {
      const sec = sections.find(s => s.id === selectedSec)
      if (sec) {
        const { data } = await db
          .from('students').select('id, enrollment_number, user_id, display_name')
          .eq('grade_level', sec.gradeName).neq('is_active', false)
        studs = data ?? []
      }
    }

    // Resolve names from profiles
    const userIds = studs.map((s: any) => s.user_id).filter(Boolean)
    const nameMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profs } = await db
        .from('profiles').select('id, full_name').in('id', userIds)
      for (const p of (profs ?? [])) nameMap.set(p.id, p.full_name)
    }

    const studentList: ParvStudent[] = studs.map((s: any) => ({
      id: s.id,
      enrollment_number: s.enrollment_number,
      full_name: s.display_name || nameMap.get(s.user_id) || s.enrollment_number,
    })).sort((a, b) => a.full_name.localeCompare(b.full_name))

    setStudents(studentList)

    // Load evaluations
    if (studIds.length === 0 && studs.length > 0) {
      studIds = studs.map((s: any) => s.id)
    }
    if (studIds.length === 0) return

    const { data: evalRows } = await db
      .from('parv_evaluations').select('student_id, indicator_id, value')
      .in('student_id', studIds).eq('trimestre', trimestre)

    const map = new Map<string, EvalValue>()
    for (const e of (evalRows ?? [])) {
      map.set(`${e.indicator_id}_${e.student_id}`, e.value as EvalValue)
    }
    setEvals(map)
  }, [selectedSec, trimestre, sections])

  useEffect(() => {
    if (selectedSec) loadStudentsAndEvals()
  }, [selectedSec, trimestre, loadStudentsAndEvals])

  // ── 5. Toggle evaluation value ───────────────────────────
  const toggleEval = (indicatorId: string, studentId: string, value: EvalValue) => {
    const key = `${indicatorId}_${studentId}`
    setEvals(prev => {
      const next = new Map(prev)
      if (next.get(key) === value) next.delete(key)
      else next.set(key, value)
      return next
    })
  }

  // ── 6. Save ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedSec || !profile) return
    setSaving(true)
    try {
      const rows = Array.from(evals.entries()).map(([key, value]) => {
        const [indicator_id, student_id] = key.split('_')
        return {
          student_id,
          indicator_id,
          section_id: selectedSec,
          trimestre,
          value,
          evaluated_by: profile.id,
          updated_at: new Date().toISOString(),
        }
      })

      if (rows.length === 0) { toast('No hay evaluaciones para guardar'); return }

      const { error } = await db
        .from('parv_evaluations')
        .upsert(rows, { onConflict: 'student_id,indicator_id,trimestre' })

      if (error) throw error
      toast.success(`${rows.length} evaluación(es) guardadas`)
    } catch (e: any) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <Baby className="w-12 h-12 opacity-30" />
        <p className="text-sm">No tienes secciones de Parvularia asignadas.</p>
      </div>
    )
  }

  const currentArea = areas.find(a => a.id === activeArea)

  return (
    <div className="space-y-6 pb-10">
      <BackButton />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <Baby className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Evaluación Parvularia</h1>
            <p className="text-sm text-slate-500">Indicadores de logro — S / N / P</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || students.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-eos-600 hover:bg-eos-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        {/* Section selector */}
        <div className="relative">
          <select
            value={selectedSec}
            onChange={e => setSelectedSec(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-eos-400"
          >
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                {s.gradeName} — {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Trimestre selector */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {TRIMESTRES.map(t => (
            <button
              key={t.key}
              onClick={() => setTrimestre(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                trimestre === t.key
                  ? 'bg-eos-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              {t.key}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {(Object.entries(VALUE_LABELS) as [EvalValue, string][]).map(([v, label]) => (
          <div key={v} className="flex items-center gap-1.5">
            <span className={cn('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold', VALUE_COLORS[v])}>
              {v}
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {students.length === 0 ? (
        <div className="text-center text-slate-400 py-12 text-sm">
          No hay estudiantes en esta sección.
        </div>
      ) : areas.length === 0 ? (
        <div className="text-center text-slate-400 py-12 text-sm">
          No se encontraron indicadores para este grado.<br />
          Ejecuta la migración e10_parvularia.sql en Supabase.
        </div>
      ) : (
        <>
          {/* Area tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {areas.map(area => (
              <button
                key={area.id}
                onClick={() => setActiveArea(area.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeArea === area.id
                    ? 'border-eos-500 text-eos-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                {area.sort_order}. {area.name}
              </button>
            ))}
          </div>

          {/* Indicators table */}
          {currentArea && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Indicador</th>
                    {students.map(s => (
                      <th key={s.id} className="px-2 py-3 text-center font-medium text-slate-600 min-w-[100px] max-w-[130px]">
                        <div className="truncate text-xs" title={s.full_name}>{s.full_name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentArea.indicators.map((ind, idx) => {
                    const rowEvals = students.map(s => evals.get(`${ind.id}_${s.id}`))
                    const done = rowEvals.filter(Boolean).length
                    return (
                      <tr
                        key={ind.id}
                        className={cn(
                          'border-b border-slate-100 last:border-0',
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        )}
                      >
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{ind.sort_order}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs">
                          <div className="flex items-start gap-2">
                            <span>{ind.text}</span>
                            {done === students.length && done > 0 && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            )}
                          </div>
                        </td>
                        {students.map(s => (
                          <td key={s.id} className="px-2 py-3">
                            <div className="flex gap-1 justify-center">
                              {(['S', 'N', 'P'] as EvalValue[]).map(v => (
                                <EvalBtn
                                  key={v}
                                  value={v}
                                  current={evals.get(`${ind.id}_${s.id}`)}
                                  onClick={() => toggleEval(ind.id, s.id, v)}
                                />
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary chips */}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-1">
            {areas.map(area => {
              const total = area.indicators.length * students.length
              const done  = area.indicators.reduce((s, ind) =>
                s + students.filter(st => evals.has(`${ind.id}_${st.id}`)).length, 0)
              const pct = total > 0 ? Math.round(done / total * 100) : 0
              return (
                <div key={area.id} className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-300'
                  )} />
                  <span>{area.sort_order}. {area.name.split(',')[0]}</span>
                  <span className="font-medium text-slate-600">{pct}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
