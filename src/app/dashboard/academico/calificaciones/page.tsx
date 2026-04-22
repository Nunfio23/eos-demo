'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { ClipboardList, Save, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackButton from '@/components/ui/BackButton'

// ──────────────────────────────────────────────────────────────
// Estructura fija de evaluación
// El docente siempre ingresa de 0–10.
// El sistema convierte: puntos_ganados = (nota / 10) × peso
// ──────────────────────────────────────────────────────────────
const TRIMESTRES = ['1er Trimestre', '2do Trimestre', '3er Trimestre'] as const

const MESES_POR_TRIMESTRE: Record<string, { value: string; label: string }[]> = {
  '1er Trimestre': [
    { value: '1', label: 'Febrero' },
    { value: '2', label: 'Marzo' },
    { value: '3', label: 'Abril' },
  ],
  '2do Trimestre': [
    { value: '1', label: 'Mayo' },
    { value: '2', label: 'Junio' },
    { value: '3', label: 'Julio' },
  ],
  '3er Trimestre': [
    { value: '1', label: 'Agosto' },
    { value: '2', label: 'Septiembre' },
    { value: '3', label: 'Octubre' },
  ],
}

const TIPOS_EVAL = [
  { label: 'Actividad',   peso: 10,  color: 'sky'    },
  { label: 'Exposición',  peso: 20,  color: 'violet' },
  { label: 'Laboratorio', peso: 30,  color: 'amber'  },
  { label: 'Examen',      peso: 40,  color: 'rose'   },
] as const

const TIPO_COLORS: Record<string, string> = {
  sky:    'bg-sky-50 text-sky-700 border-sky-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
  rose:   'bg-rose-50 text-rose-700 border-rose-200',
}

function toPts(nota: number, peso: number) { return (nota / 10) * peso }

function calcLetter(nota: number): string {
  if (nota >= 9)   return 'Excelente'
  if (nota >= 8)   return 'Muy Bueno'
  if (nota >= 7)   return 'Bueno'
  if (nota >= 6)   return 'Regular'
  return 'Insuficiente'
}

function letterColor(letter: string) {
  if (letter === 'Excelente') return 'text-emerald-700 bg-emerald-50'
  if (letter === 'Muy Bueno') return 'text-blue-700 bg-blue-50'
  if (letter === 'Bueno')     return 'text-yellow-700 bg-yellow-50'
  if (letter === 'Regular')   return 'text-orange-700 bg-orange-50'
  return 'text-red-700 bg-red-50'
}

function toSemana(mes: number, tipoIdx: number) { return (mes - 1) * 4 + tipoIdx + 1 }

// Mapeo trimestre+mes → mes calendario real (para monthly_grades)
const TRIMESTRE_CAL_MONTH: Record<string, Record<string, number>> = {
  '1er Trimestre': { '1': 2, '2': 3, '3': 4 },
  '2do Trimestre': { '1': 5, '2': 6, '3': 7 },
  '3er Trimestre': { '1': 8, '2': 9, '3': 10 },
}
// Mapeo tipoIdx → campo en monthly_grades
const TIPO_TO_MG_FIELD = ['week1_score', 'week2_score', 'lab_score', 'exam_score'] as const

interface DbGrade { id: string; name: string; sort_order: number }
interface Section  { id: string; name: string; grade_id: string }
interface Subject  { id: string; name: string }
interface Student  { id: string; enrollment_number: string; full_name: string }
// Asignación del docente: una clase específica
interface MyAssignment {
  id: string          // teacher_assignment.id
  sectionId: string
  gradeId: string
  subjectCatalogId: string
  label: string       // "Matemáticas — Quinto Grado Sección A"
  gradeName: string
  sectionName: string
  subjectName: string
}
type Cell     = { value: string; existingId: string | null; saved: boolean }
type ScoreMap = Record<string, Record<string, Cell>>

export default function CalificacionesPage() {
  const { role, user } = useAuth()
  const isDocente = role === 'docente'
  const isAdmin   = !!role && ['master', 'direccion', 'administracion'].includes(role)
  const canEdit   = isDocente || isAdmin

  // Estado compartido
  const [subjects,  setSubjects]  = useState<Subject[]>([])
  const [students,  setStudents]  = useState<Student[]>([])
  const [scores,    setScores]    = useState<ScoreMap>({})
  const [selTrimestre, setSelTrimestre] = useState('')
  const [selMes,       setSelMes]       = useState('')
  const [selTipo,      setSelTipo]      = useState('')
  const [loading,      setLoading]      = useState(true)
  const [loadingGrid,  setLoadingGrid]  = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [schoolYearId, setSchoolYearId] = useState<string | null>(null)

  // Estado para docentes: selección por asignación
  const [myAssignments,  setMyAssignments]  = useState<MyAssignment[]>([])
  const [selAssignment,  setSelAssignment]  = useState('')   // teacher_assignment.id

  // Estado para admins: selección por grado+sección (todos los subjects)
  const [dbGrades,  setDbGrades]  = useState<DbGrade[]>([])
  const [sections,  setSections]  = useState<Section[]>([])
  const [selGrade,  setSelGrade]  = useState('')
  const [selSection,setSelSection]= useState('')

  // Mapeo subject_catalog_id → teacher_assignment_id (para sincronizar monthly_grades)
  const [subjectToTA, setSubjectToTA] = useState<Record<string, string>>({})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Derivados
  const currentAssignment = myAssignments.find(a => a.id === selAssignment) ?? null
  const effectiveSection  = isDocente ? (currentAssignment?.sectionId ?? '') : selSection
  const effectiveGrade    = isDocente ? (currentAssignment?.gradeId ?? '')   : selGrade
  const tipoActual   = selTipo !== '' ? TIPOS_EVAL[parseInt(selTipo)] : null
  const semanaActual = selMes && selTipo !== '' ? toSemana(parseInt(selMes), parseInt(selTipo)) : null
  const readyToLoad  = isDocente
    ? !!(selAssignment && selTrimestre && selMes && selTipo !== '')
    : !!(effectiveGrade && effectiveSection && selTrimestre && selMes && selTipo !== '')

  const sectionsForGrade = sections.filter(s => s.grade_id === selGrade)

  // ── Cargar estructura base ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 15000)

    const load = async () => {
      const { data: syData } = await supabase
        .from('school_years').select('id').eq('is_active', true).limit(1)
      const syId = (syData as { id: string }[] | null)?.[0]?.id ?? null
      setSchoolYearId(syId)

      if (isDocente && syId) {
        // Cargar mis asignaciones: subject + grade + section
        const { data: me } = await db.from('teachers').select('id').eq('user_id', user?.id).single()
        if (me) {
          const { data: taData } = await db
            .from('teacher_assignments')
            .select('id, section_id, grade_subject_id')
            .eq('teacher_id', me.id)
            .eq('school_year_id', syId)
            .eq('is_active', true)

          if (taData?.length) {
            const gsIds    = taData.map((t: any) => t.grade_subject_id).filter(Boolean)
            const secIds   = taData.map((t: any) => t.section_id).filter(Boolean)

            const [{ data: gsData }, { data: secData }] = await Promise.all([
              supabase.from('grade_subjects')
                .select('id, grade_id, subject_catalog_id, subject_catalog:subject_catalog(name)')
                .in('id', gsIds),
              supabase.from('sections').select('id, name, grade_id').in('id', secIds),
            ])
            const gradeIds = [...new Set((gsData ?? []).map((g: any) => g.grade_id))]
            const { data: gradeData } = await supabase
              .from('grades').select('id, name').in('id', gradeIds)

            const gsMap    = new Map((gsData ?? []).map((g: any) => [g.id, g]))
            const secMap   = new Map((secData ?? []).map((s: any) => [s.id, s]))
            const gradeMap = new Map((gradeData ?? []).map((g: any) => [g.id, g]))

            const assignments: MyAssignment[] = taData.map((ta: any) => {
              const gs        = gsMap.get(ta.grade_subject_id)
              const sec       = secMap.get(ta.section_id)
              const grade     = gradeMap.get(gs?.grade_id)
              const subName   = (gs?.subject_catalog as any)?.name ?? '—'
              const gradeName = grade?.name ?? '—'
              const secName   = sec?.name ?? '—'
              return {
                id: ta.id,
                sectionId: ta.section_id,
                gradeId: gs?.grade_id ?? '',
                subjectCatalogId: gs?.subject_catalog_id ?? '',
                label: `${subName} — ${gradeName} Sección ${secName}`,
                gradeName, sectionName: secName, subjectName: subName,
              }
            }).sort((a: MyAssignment, b: MyAssignment) => a.label.localeCompare(b.label))

            setMyAssignments(assignments)
          }
        }
      } else {
        // Admin: cargar todos los grados y secciones
        const [{ data: gData }, { data: sData }] = await Promise.all([
          supabase.from('grades').select('id, name, sort_order').order('sort_order'),
          supabase.from('sections').select('id, name, grade_id').order('name'),
        ])
        setDbGrades(gData ?? [])
        setSections(sData ?? [])
      }
      setLoading(false)
      clearTimeout(t)
    }

    if (user?.id) load()
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // ── Cargar grilla ───────────────────────────────────────────
  const loadGrid = useCallback(async () => {
    if (!readyToLoad || !schoolYearId || semanaActual === null) return
    setLoadingGrid(true)

    let subjectList: Subject[] = []

    if (isDocente && currentAssignment) {
      // Docente: solo su materia
      subjectList = [{ id: currentAssignment.subjectCatalogId, name: currentAssignment.subjectName }]
    } else {
      // Admin: todas las materias del grado
      const { data: gsData } = await supabase
        .from('grade_subjects')
        .select('subject_catalog_id, subject_catalog(name)')
        .eq('grade_id', effectiveGrade)
        .order('sort_order')
      subjectList = (gsData ?? []).map((gs: any) => ({
        id: gs.subject_catalog_id, name: gs.subject_catalog?.name ?? '—',
      }))
    }
    setSubjects(subjectList)

    // Construir mapeo subject_catalog_id → teacher_assignment_id
    if (subjectList.length > 0 && effectiveSection && schoolYearId) {
      if (isDocente && currentAssignment) {
        // Para docente: su única asignación ya es el teacher_assignment_id
        setSubjectToTA({ [currentAssignment.subjectCatalogId]: currentAssignment.id })
      } else {
        // Para admin: buscar teacher_assignments por subject_catalog_id
        const { data: gsData } = await supabase
          .from('grade_subjects')
          .select('id, subject_catalog_id')
          .eq('grade_id', effectiveGrade)
          .in('subject_catalog_id', subjectList.map(s => s.id))
        if (gsData?.length) {
          const { data: taData } = await db
            .from('teacher_assignments')
            .select('id, grade_subject_id')
            .in('grade_subject_id', (gsData as any[]).map((g: any) => g.id))
            .eq('section_id', effectiveSection)
            .eq('school_year_id', schoolYearId)
            .neq('is_active', false)
          const gsMap = new Map((gsData as any[]).map((g: any) => [g.id, g.subject_catalog_id]))
          const taMap: Record<string, string> = {}
          for (const ta of taData ?? []) {
            const subCatId = gsMap.get(ta.grade_subject_id)
            if (subCatId) taMap[subCatId] = ta.id
          }
          setSubjectToTA(taMap)
        } else {
          setSubjectToTA({})
        }
      }
    }

    // Fetch students via API route (service-role key bypasses docente RLS)
    let studentList: Student[] = []
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token && effectiveSection && schoolYearId) {
      const res = await fetch(
        `/api/students-by-section?sectionId=${effectiveSection}&schoolYearId=${schoolYearId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (res.ok) studentList = await res.json()
    }
    setStudents(studentList)

    // Notas guardadas
    const gradeStudentIds = studentList.map(s => s.id)
    const subjectIds = subjectList.map(s => s.id)
    let existing: any[] = []
    if (gradeStudentIds.length > 0 && subjectIds.length > 0) {
      const { data } = await db
        .from('calificaciones_notas')
        .select('id, student_id, subject_id, score')
        .eq('section_id', effectiveSection)
        .eq('school_year_id', schoolYearId)
        .eq('trimestre', selTrimestre)
        .eq('semana', semanaActual)
        .in('student_id', gradeStudentIds)
        .in('subject_id', subjectIds)
      existing = data ?? []
    }

    const map: ScoreMap = {}
    studentList.forEach(s => {
      map[s.id] = {}
      subjectList.forEach(sub => {
        const ex = existing.find((n: any) => n.student_id === s.id && n.subject_id === sub.id)
        map[s.id][sub.id] = { value: ex ? String(ex.score) : '', existingId: ex?.id ?? null, saved: !!ex }
      })
    })
    setScores(map)
    setLoadingGrid(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToLoad, schoolYearId, effectiveGrade, effectiveSection, selTrimestre, semanaActual, selAssignment])

  useEffect(() => { loadGrid() }, [loadGrid])

  const updateScore = (studentId: string, subjectId: string, value: string) =>
    setScores(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [subjectId]: { ...prev[studentId]?.[subjectId], value, saved: false } },
    }))

  // ── Guardar ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!schoolYearId || !tipoActual || semanaActual === null) return

    const inserts: any[] = []
    const updates: { id: string; score: number }[] = []

    students.forEach(s => subjects.forEach(sub => {
      const cell = scores[s.id]?.[sub.id]
      const nota = parseFloat(cell?.value ?? '')
      if (isNaN(nota) || nota < 0 || nota > 10 || cell?.saved) return
      if (cell?.existingId) {
        updates.push({ id: cell.existingId, score: nota })
      } else {
        inserts.push({
          student_id:     s.id,
          subject_id:     sub.id,
          section_id:     effectiveSection,
          school_year_id: schoolYearId,
          trimestre:      selTrimestre,
          semana:         semanaActual,
          score:          nota,
          max_score:      tipoActual.peso,
          entered_by:     user?.id ?? null,
        })
      }
    }))

    if (!inserts.length && !updates.length) {
      toast('No hay notas nuevas o modificadas.', { icon: '📋' })
      return
    }

    // Recopilar items a sincronizar ANTES de guardar
    const itemsToSync: { studentId: string; subjectId: string; score: number }[] = []
    students.forEach(s => subjects.forEach(sub => {
      const cell = scores[s.id]?.[sub.id]
      const nota = parseFloat(cell?.value ?? '')
      if (!isNaN(nota) && nota >= 0 && nota <= 10 && !cell?.saved) {
        itemsToSync.push({ studentId: s.id, subjectId: sub.id, score: nota })
      }
    }))

    setSaving(true)
    let err: any = null
    if (inserts.length) {
      const { error } = await db.from('calificaciones_notas').insert(inserts)
      if (error) err = error
    }
    for (const u of updates) {
      const { error } = await db.from('calificaciones_notas').update({ score: u.score }).eq('id', u.id)
      if (error) err = error
    }

    if (!err) {
      // Sincronizar a monthly_grades para que aparezcan en el libro de notas y boleta
      const calMonth = TRIMESTRE_CAL_MONTH[selTrimestre]?.[selMes]
      const fieldName = TIPO_TO_MG_FIELD[parseInt(selTipo)]
      if (calMonth && fieldName && schoolYearId) {
        for (const item of itemsToSync) {
          const taId = subjectToTA[item.subjectId]
          if (!taId) continue
          await db.from('monthly_grades').upsert(
            { teacher_assignment_id: taId, student_id: item.studentId, school_year_id: schoolYearId, month: calMonth, [fieldName]: item.score },
            { onConflict: 'teacher_assignment_id,student_id,month,school_year_id' }
          )
        }
      }
    }

    setSaving(false)
    if (err) { toast.error('Error: ' + err.message); return }
    toast.success(`${inserts.length + updates.length} nota(s) guardadas`)
    loadGrid()
  }

  const unsavedCount = students.reduce((acc, s) =>
    acc + subjects.filter(sub => {
      const cell = scores[s.id]?.[sub.id]
      const nota = parseFloat(cell?.value ?? '')
      return !isNaN(nota) && nota >= 0 && nota <= 10 && !cell?.saved
    }).length, 0)

  const exportSIGES = async () => {
    if (!students.length || !subjects.length) return
    const XLSX = await import('xlsx')

    // Fila de encabezado: NIE + nombres de materias en mayúsculas
    const header = ['NIE', ...subjects.map(s => s.name.toUpperCase())]

    // Filas de datos: enrollment_number + notas (solo el número, vacío si no hay)
    const rows = students.map(student => [
      student.enrollment_number,
      ...subjects.map(sub => {
        const val = scores[student.id]?.[sub.id]?.value
        const n = parseFloat(val ?? '')
        return isNaN(n) ? '' : n
      }),
    ])

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()

    // Nombre de hoja con contexto
    const sheetName = isDocente && currentAssignment
      ? currentAssignment.subjectName.slice(0, 31)
      : 'Calificaciones'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const fileName = [
      'SIGES',
      isDocente && currentAssignment ? currentAssignment.gradeName : '',
      isDocente && currentAssignment ? `Sec${currentAssignment.sectionName}` : '',
      selTrimestre.replace(' ', ''),
      MESES_POR_TRIMESTRE[selTrimestre]?.find(m => m.value === selMes)?.label ?? '',
      tipoActual?.label ?? '',
    ].filter(Boolean).join('_') + '.xlsx'

    XLSX.writeFile(wb, fileName)
  }

  // Exportar TODAS las notas del trimestre (promedio ponderado por materia)
  const exportTrimestre = async () => {
    if (!selTrimestre || !effectiveSection || !schoolYearId) {
      toast.error('Seleccioná trimestre y sección primero')
      return
    }
    toast('Generando exportación...', { icon: '⏳' })

    // 1. Obtener lista de materias del grado si aún no están cargadas
    let subjectList = subjects
    if (!subjectList.length) {
      if (isDocente && currentAssignment) {
        subjectList = [{ id: currentAssignment.subjectCatalogId, name: currentAssignment.subjectName }]
      } else {
        const { data: gsData } = await (supabase as any)
          .from('grade_subjects')
          .select('subject_catalog_id, subject_catalog(name)')
          .eq('grade_id', effectiveGrade)
          .order('sort_order')
        subjectList = (gsData ?? []).map((gs: any) => ({
          id: gs.subject_catalog_id, name: gs.subject_catalog?.name ?? '—',
        }))
      }
    }

    // 2. Obtener estudiantes si no están cargados
    let studentList = students
    if (!studentList.length) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const res = await fetch(
          `/api/students-by-section?sectionId=${effectiveSection}&schoolYearId=${schoolYearId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        )
        if (res.ok) studentList = await res.json()
      }
    }

    if (!studentList.length || !subjectList.length) {
      toast.error('No hay datos para exportar')
      return
    }

    // 3. Traer TODAS las notas del trimestre (todas las semanas 1-12)
    const { data: allScores } = await db
      .from('calificaciones_notas')
      .select('student_id, subject_id, score, max_score, semana')
      .eq('section_id', effectiveSection)
      .eq('school_year_id', schoolYearId)
      .eq('trimestre', selTrimestre)
      .in('student_id', studentList.map((s: Student) => s.id))
      .in('subject_id', subjectList.map((s: Subject) => s.id))

    // 4. Para cada estudiante+materia calcular promedio ponderado (puntos ganados / puntos posibles)
    //    Cada mes tiene 4 evaluaciones con pesos 10+20+30+40=100 → máximo por mes = 100 pts
    //    El trimestre tiene 3 meses → máximo trimestre = 300 pts
    //    Promedio final sobre 10 = totalPts / (cantMeses × 100) × 10
    const scoreMatrix: Record<string, Record<string, { pts: number; maxPts: number }>> = {}
    studentList.forEach((s: Student) => {
      scoreMatrix[s.id] = {}
      subjectList.forEach((sub: Subject) => { scoreMatrix[s.id][sub.id] = { pts: 0, maxPts: 0 } })
    })
    ;(allScores ?? []).forEach((row: any) => {
      if (!scoreMatrix[row.student_id]?.[row.subject_id]) return
      const pts = (row.score / 10) * (row.max_score ?? 10)
      scoreMatrix[row.student_id][row.subject_id].pts    += pts
      scoreMatrix[row.student_id][row.subject_id].maxPts += (row.max_score ?? 10)
    })

    // 5. Construir Excel
    const XLSX = await import('xlsx')
    const header = ['NIE', ...subjectList.map((s: Subject) => s.name.toUpperCase())]
    const rows = studentList.map((student: Student) => [
      student.enrollment_number,
      ...subjectList.map((sub: Subject) => {
        const cell = scoreMatrix[student.id]?.[sub.id]
        if (!cell || cell.maxPts === 0) return ''
        // Convertir puntos ganados a nota sobre 10
        const nota = (cell.pts / cell.maxPts) * 10
        return Math.round(nota * 10) / 10
      }),
    ])

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    const sheetName = selTrimestre.replace(' ', '').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const label = isDocente && currentAssignment
      ? `${currentAssignment.gradeName}_Sec${currentAssignment.sectionName}`
      : ''
    const fileName = ['SIGES_Trimestre', label, selTrimestre.replace(' ', '')].filter(Boolean).join('_') + '.xlsx'
    XLSX.writeFile(wb, fileName)
  }

  const peso     = tipoActual?.peso ?? 10
  const colorCls = tipoActual ? TIPO_COLORS[tipoActual.color] : ''

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="page-title">Calificaciones</h1>
            <p className="page-subtitle">Nota del docente: 0–10 · El sistema calcula los puntos según ponderación</p>
          </div>
        </div>
        {unsavedCount > 0 && canEdit && (
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : `Guardar ${unsavedCount} nota(s)`}
          </button>
        )}
      </div>

      {/* Tabla de ponderación */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Escala de ponderación — sobre nota 0–10
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {TIPOS_EVAL.map((t, i) => (
            <div key={i} className={cn('rounded-xl border p-3 space-y-1', TIPO_COLORS[t.color])}>
              <p className="font-semibold">{t.label}</p>
              <p className="opacity-70">Peso: {t.peso}%</p>
              <div className="space-y-0.5 pt-1 font-mono">
                {[10, 9, 8, 7, 6].map(n => (
                  <div key={n} className="flex justify-between">
                    <span>{n}/10</span>
                    <span className="font-bold">{toPts(n, t.peso).toFixed(1)} pts</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-4">

        {/* ── Selector para DOCENTES: mis clases ── */}
        {isDocente && (
          myAssignments.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No tienes clases asignadas en el año escolar activo.
            </p>
          ) : (
            <div>
              <label className="label">Mi Clase</label>
              <select
                className="input"
                value={selAssignment}
                onChange={e => { setSelAssignment(e.target.value); setSelTrimestre(''); setSelMes(''); setSelTipo('') }}
              >
                <option value="">— Seleccionar clase —</option>
                {myAssignments.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          )
        )}

        {/* ── Selector para ADMINS: grado + sección ── */}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Grado</label>
              <select className="input" value={selGrade}
                onChange={e => { setSelGrade(e.target.value); setSelSection('') }}>
                <option value="">— Seleccionar —</option>
                {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sección</label>
              <select className="input" value={selSection} disabled={!selGrade}
                onChange={e => setSelSection(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {sectionsForGrade.map(s => <option key={s.id} value={s.id}>Sección {s.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Periodo de evaluación (común) ── */}
        {(isAdmin ? !!(selGrade && selSection) : !!selAssignment) && (
          <div className="border-t border-slate-100 pt-4">
            <label className="label mb-2">Periodo de evaluación</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select className="input" value={selTrimestre}
                onChange={e => { setSelTrimestre(e.target.value); setSelMes(''); setSelTipo('') }}>
                <option value="">— Trimestre —</option>
                {TRIMESTRES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="input" value={selMes} disabled={!selTrimestre}
                onChange={e => { setSelMes(e.target.value); setSelTipo('') }}>
                <option value="">— Mes —</option>
                {(MESES_POR_TRIMESTRE[selTrimestre] ?? []).map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select className="input" value={selTipo} disabled={!selMes}
                onChange={e => setSelTipo(e.target.value)}>
                <option value="">— Evaluación —</option>
                {TIPOS_EVAL.map((t, i) => (
                  <option key={i} value={String(i)}>{t.label} ({t.peso}%)</option>
                ))}
              </select>
            </div>
            {tipoActual && selMes && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border', colorCls)}>
                  {selTrimestre} · {MESES_POR_TRIMESTRE[selTrimestre]?.find(m => m.value === selMes)?.label ?? `Mes ${selMes}`} · {tipoActual.label}
                </span>
                <span className="text-xs text-slate-500">
                  Nota 10/10 = <strong>{tipoActual.peso} pts</strong> ·
                  Nota 5/10 = <strong>{toPts(5, tipoActual.peso)} pts</strong> ·
                  Máximo acumulable este mes: <strong>100 pts</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grilla */}
      {!readyToLoad ? (
        <div className="card p-10 text-center">
          <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {isDocente
              ? 'Seleccioná tu clase, trimestre, mes y tipo de evaluación.'
              : 'Seleccioná grado, sección, trimestre, mes y tipo de evaluación.'}
          </p>
        </div>
      ) : loadingGrid ? (
        <div className="card p-10 text-center text-slate-400 text-sm">Cargando...</div>
      ) : students.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-slate-500">No hay estudiantes matriculados en esta sección.</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-slate-500">
            Este grado no tiene materias asignadas.
          </p>
        </div>
      ) : (
        <>
        <div className="flex justify-end gap-2 mb-2">
          <button
            onClick={exportTrimestre}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Trimestre
          </button>
          <button
            onClick={exportSIGES}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar SIGES
          </button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 min-w-[200px] z-10">
                  Estudiante
                </th>
                {subjects.map(sub => (
                  <th key={sub.id} className="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[100px] leading-tight">
                    {sub.name}
                    <div className={cn('text-xs font-normal normal-case tracking-normal mt-0.5 px-1.5 py-0.5 rounded border', colorCls)}>
                      0–10 → /{peso} pts
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[90px] bg-slate-100 border-l border-slate-200 sticky right-0 z-10">
                  Promedio
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((student, i) => {
                const notasValidas = subjects
                  .map(sub => parseFloat(scores[student.id]?.[sub.id]?.value ?? ''))
                  .filter(n => !isNaN(n) && n >= 0 && n <= 10)
                const promedio = notasValidas.length > 0
                  ? notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length
                  : null
                return (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-5 shrink-0 text-right">{i + 1}</span>
                      <div>
                        <p className="font-medium text-slate-800">{student.full_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{student.enrollment_number}</p>
                      </div>
                    </div>
                  </td>
                  {subjects.map(sub => {
                    const cell  = scores[student.id]?.[sub.id]
                    const nota  = parseFloat(cell?.value ?? '')
                    const valid = !isNaN(nota) && nota >= 0 && nota <= 10
                    const pts   = valid ? toPts(nota, peso) : null
                    const letter = valid ? calcLetter(nota) : ''
                    return (
                      <td key={sub.id} className="px-1.5 py-2 text-center">
                        {cell?.saved ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={cn('px-2 py-0.5 rounded-lg font-bold text-sm', letterColor(letter))}>
                              {cell.value}
                            </span>
                            <span className="text-xs text-slate-500 font-semibold">
                              = {pts?.toFixed(1)} pts
                            </span>
                            {canEdit && (
                              <button
                                onClick={() => updateScore(student.id, sub.id, cell.value)}
                                className="text-xs text-slate-400 hover:text-eos-600 underline"
                              >
                                editar
                              </button>
                            )}
                          </div>
                        ) : canEdit ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <input
                              type="number" min="0" max="10" step="0.5"
                              value={cell?.value ?? ''}
                              onChange={e => updateScore(student.id, sub.id, e.target.value)}
                              placeholder="0–10"
                              className={cn(
                                'w-16 px-1.5 py-1 rounded-lg border text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-eos-500 transition-all',
                                !cell?.value      ? 'border-slate-200 bg-white text-slate-700'          :
                                valid && nota < 6 ? 'border-red-300 bg-red-50 text-red-700'             :
                                valid             ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                                                    'border-orange-300 bg-orange-50 text-orange-700'
                              )}
                            />
                            {valid && cell?.value && (
                              <span className="text-xs text-slate-400 font-mono">
                                = {toPts(nota, peso).toFixed(1)} pts
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    )
                  })}
                  {/* Promedio */}
                  <td className="px-3 py-2 text-center bg-slate-50 border-l border-slate-200 sticky right-0 z-10">
                    {promedio !== null ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={cn('px-2 py-0.5 rounded-lg font-bold text-sm', letterColor(calcLetter(promedio)))}>
                          {promedio.toFixed(1)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {notasValidas.length < subjects.length && (
                            <span className="text-amber-500">~</span>
                          )}
                          {calcLetter(promedio)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>

          {unsavedCount > 0 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-amber-50/50">
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {unsavedCount} nota(s) sin guardar — no cerrés la página antes de guardar
              </p>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar todo'}
              </button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
