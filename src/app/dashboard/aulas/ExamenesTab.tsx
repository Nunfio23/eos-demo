'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import toast from 'react-hot-toast'
import { apiUrl } from '@/lib/api-url'
import {
  ClipboardList, Plus, Trash2, Eye, Clock, X, ArrowLeft,
  CheckCircle, AlertCircle, Printer, Edit2, Send, Lock, Sparkles, BookOpen,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

type QType = 'multiple_choice' | 'true_false' | 'open' | 'matching'

interface Exam {
  id: string
  classroom_id: string
  created_by: string
  title: string
  instructions: string | null
  time_limit_minutes: number | null
  available_from: string | null
  available_until: string | null
  is_published: boolean
  created_at: string
}
interface QuestionFull {
  id: string
  exam_id: string
  question_text: string
  question_type: QType
  points: number
  sort_order: number
  options: OptionFull[]
}
interface OptionFull {
  id: string
  question_id: string
  option_text: string
  match_text: string | null
  is_correct: boolean
  sort_order: number
}
interface OptionDraft {
  temp_id: string
  option_text: string
  match_text: string
  is_correct: boolean
}
interface QuestionDraft {
  temp_id: string
  question_text: string
  question_type: QType
  points: number
  options: OptionDraft[]
}
interface ExamForm {
  title: string
  instructions: string
  time_limit_minutes: string
  available_from: string
  available_until: string
  is_published: boolean
}
interface Submission {
  id: string
  exam_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  auto_score: number | null
  final_score: number | null
  student?: { profile: { full_name: string } }
  answers_count?: number
}
type AnswerMap = Record<string, { option_id?: string; text?: string; matching?: Record<string, string> }>

interface Props {
  classroom: { id: string; section_id: string; school_year_id: string; name: string }
  canManage: boolean
  isStudent: boolean
  teacherAssignmentId?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const emptyForm: ExamForm = {
  title: '', instructions: '', time_limit_minutes: '',
  available_from: '', available_until: '', is_published: false,
}
const newOptionDraft = (): OptionDraft => ({
  temp_id: crypto.randomUUID(), option_text: '', match_text: '', is_correct: false,
})
const newQuestion = (): QuestionDraft => ({
  temp_id: crypto.randomUUID(),
  question_text: '',
  question_type: 'multiple_choice',
  points: 1,
  options: [newOptionDraft(), newOptionDraft()],
})
const tfOptions = (): OptionDraft[] => [
  { temp_id: 'tf-v', option_text: 'Verdadero', match_text: '', is_correct: true },
  { temp_id: 'tf-f', option_text: 'Falso',     match_text: '', is_correct: false },
]
const Q_TYPE_LABELS: Record<QType, string> = {
  multiple_choice: 'Opción múltiple',
  true_false:      'Verdadero / Falso',
  open:            'Respuesta abierta',
  matching:        'Unión de opciones',
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExamenesTab({ classroom, canManage, isStudent, teacherAssignmentId }: Props) {
  const { profile } = useAuth()

  type View = 'list' | 'edit' | 'take' | 'results'
  const [view,    setView]    = useState<View>('list')
  const [exams,   setExams]   = useState<Exam[]>([])
  const [loading, setLoading] = useState(false)

  // Edit
  const [editExam,        setEditExam]        = useState<Exam | null>(null)
  const [form,            setForm]            = useState<ExamForm>(emptyForm)
  const [draftQuestions,  setDraftQuestions]  = useState<QuestionDraft[]>([newQuestion()])
  const [saving,          setSaving]          = useState(false)

  // Take
  const [activeExam,    setActiveExam]    = useState<Exam | null>(null)
  const [examQuestions, setExamQuestions] = useState<QuestionFull[]>([])
  const [mySubmission,  setMySubmission]  = useState<Submission | null>(null)
  const [answers,       setAnswers]       = useState<AnswerMap>({})
  const [timeLeft,      setTimeLeft]      = useState<number | null>(null)
  const [shuffledRight, setShuffledRight] = useState<Record<string, string[]>>({})
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const answersRef    = useRef<AnswerMap>({})
  const subRef        = useRef<Submission | null>(null)
  const qsRef         = useRef<QuestionFull[]>([])

  useEffect(() => { answersRef.current = answers },       [answers])
  useEffect(() => { subRef.current     = mySubmission },  [mySubmission])
  useEffect(() => { qsRef.current      = examQuestions }, [examQuestions])

  // Results
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [liveNow, setLiveNow] = useState(() => Date.now())
  useEffect(() => {
    const hasInProgress = submissions.some(s => !s.submitted_at)
    if (!hasInProgress) return
    const interval = setInterval(() => setLiveNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [submissions])

  // AI Generation
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiExamType, setAIExamType] = useState<'mensual' | 'periodo' | 'trimestre'>('mensual')
  const [aiDateFrom, setAIDateFrom] = useState('')
  const [aiDateTo, setAIDateTo] = useState('')
  const [aiGenerating, setAIGenerating] = useState(false)

  // Temario
  type TemarioTipo = {
    tipo: string
    icono: string
    cantidad: number
    descripcion: string
    como_prepararse: string
  }
  type TemarioTema = {
    numero: number
    tema: string
    nivel_cognitivo?: string
    subtemas: string[]
    como_estudiar?: string
  }
  type TemarioData = {
    titulo: string
    introduccion: string
    temas: TemarioTema[]
    tipos_de_preguntas?: TemarioTipo[]
    conceptos_clave: string[]
    habilidades: string[]
    consejos: string[]
  }
  const [temarioExam, setTemarioExam] = useState<Exam | null>(null)
  const [temarioData, setTemarioData] = useState<TemarioData | null>(null)
  const [temarioLoading, setTemarioLoading] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────

  const loadExams = useCallback(async () => {
    setLoading(true)
    let q = (supabase as any)
      .from('classroom_exams')
      .select('*')
      .eq('classroom_id', classroom.id)
    if (teacherAssignmentId) q = q.eq('teacher_assignment_id', teacherAssignmentId)
    const { data } = await q.order('created_at', { ascending: false })
    setExams((data ?? []) as Exam[])
    setLoading(false)
  }, [classroom.id])

  useEffect(() => { loadExams() }, [loadExams])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // ── Edit helpers ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditExam(null)
    setForm(emptyForm)
    setDraftQuestions([newQuestion()])
    setView('edit')
  }

  const openEdit = async (exam: Exam) => {
    setEditExam(exam)
    setForm({
      title:               exam.title,
      instructions:        exam.instructions ?? '',
      time_limit_minutes:  exam.time_limit_minutes?.toString() ?? '',
      available_from:      exam.available_from  ? exam.available_from.slice(0, 16)  : '',
      available_until:     exam.available_until ? exam.available_until.slice(0, 16) : '',
      is_published:        exam.is_published,
    })
    const { data: qs } = await (supabase as any)
      .from('exam_questions')
      .select('*, options:exam_options(*)')
      .eq('exam_id', exam.id)
      .order('sort_order')
    const drafts: QuestionDraft[] = (qs ?? []).map((q: any) => ({
      temp_id:       q.id,
      question_text: q.question_text,
      question_type: q.question_type as QType,
      points:        q.points,
      options:       (q.options ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((o: any) => ({
          temp_id:      o.id,
          option_text:  o.option_text,
          match_text:   o.match_text ?? '',
          is_correct:   o.is_correct,
        })),
    }))
    setDraftQuestions(drafts.length > 0 ? drafts : [newQuestion()])
    setView('edit')
  }

  const updateQ = (idx: number, patch: Partial<QuestionDraft>) =>
    setDraftQuestions(p => p.map((q, i) => i === idx ? { ...q, ...patch } : q))

  const updateOpt = (qi: number, oi: number, patch: Partial<OptionDraft>) =>
    setDraftQuestions(p => p.map((q, i) => i !== qi ? q : {
      ...q, options: q.options.map((o, j) => j === oi ? { ...o, ...patch } : o)
    }))

  const markCorrect = (qi: number, oi: number) =>
    setDraftQuestions(p => p.map((q, i) => i !== qi ? q : {
      ...q, options: q.options.map((o, j) => ({ ...o, is_correct: j === oi }))
    }))

  const changeQType = (idx: number, type: QType) =>
    setDraftQuestions(p => p.map((q, i) => {
      if (i !== idx) return q
      const opts: OptionDraft[] =
        type === 'multiple_choice' ? [newOptionDraft(), newOptionDraft()] :
        type === 'true_false'      ? tfOptions() :
        type === 'matching'        ? [
          { temp_id: crypto.randomUUID(), option_text: '', match_text: '', is_correct: true },
          { temp_id: crypto.randomUUID(), option_text: '', match_text: '', is_correct: true },
        ] : []
      return { ...q, question_type: type, options: opts }
    }))

  // ── Save exam ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return }
    if (draftQuestions.length === 0) { toast.error('Agrega al menos una pregunta'); return }
    for (const q of draftQuestions) {
      if (!q.question_text.trim()) { toast.error('Todas las preguntas necesitan texto'); return }
      if (q.question_type === 'multiple_choice') {
        if (q.options.length < 2) { toast.error('Opción múltiple necesita al menos 2 opciones'); return }
        if (!q.options.some(o => o.is_correct)) { toast.error('Marca la respuesta correcta en todas las preguntas de opción múltiple'); return }
        if (q.options.some(o => !o.option_text.trim())) { toast.error('Completa el texto de todas las opciones'); return }
      }
      if (q.question_type === 'matching') {
        if (q.options.length < 2) { toast.error('Unión necesita al menos 2 pares'); return }
        if (q.options.some(o => !o.option_text.trim() || !o.match_text.trim())) {
          toast.error('Completa todos los pares de unión'); return
        }
      }
    }
    setSaving(true)
    try {
      const payload: any = {
        classroom_id:          classroom.id,
        created_by:            profile!.id,
        title:                 form.title.trim(),
        instructions:          form.instructions.trim() || null,
        time_limit_minutes:    form.time_limit_minutes ? parseInt(form.time_limit_minutes) : null,
        available_from:        form.available_from  || null,
        available_until:       form.available_until || null,
        is_published:          form.is_published,
        teacher_assignment_id: teacherAssignmentId ?? null,
      }
      let examId = editExam?.id
      if (examId) {
        const { error } = await (supabase as any).from('classroom_exams').update(payload).eq('id', examId)
        if (error) throw error
        await (supabase as any).from('exam_questions').delete().eq('exam_id', examId)
      } else {
        const { data, error } = await (supabase as any).from('classroom_exams').insert(payload).select().single()
        if (error) throw error
        examId = data.id
      }
      for (let i = 0; i < draftQuestions.length; i++) {
        const q = draftQuestions[i]
        const { data: qd, error: qe } = await (supabase as any).from('exam_questions').insert({
          exam_id:       examId,
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          points:        q.points,
          sort_order:    i,
        }).select().single()
        if (qe) throw qe
        const opts = q.question_type === 'true_false' ? tfOptions() : q.options
        if (q.question_type !== 'open') {
          for (let j = 0; j < opts.length; j++) {
            const o = opts[j]
            await (supabase as any).from('exam_options').insert({
              question_id: qd.id,
              option_text: o.option_text,
              match_text:  o.match_text || null,
              is_correct:  o.is_correct,
              sort_order:  j,
            })
          }
        }
      }
      toast.success(editExam ? 'Examen actualizado' : 'Examen creado')
      setView('list')
      loadExams()
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e.message ?? ''))
    }
    setSaving(false)
  }

  const handleDeleteExam = async (id: string) => {
    if (!confirm('¿Eliminar este examen y todas sus respuestas?')) return
    await (supabase as any).from('classroom_exams').delete().eq('id', id)
    toast.success('Examen eliminado')
    loadExams()
  }

  // ── AI Generation ────────────────────────────────────────────────────────

  const generateWithAI = async () => {
    if (!profile) return
    setAIGenerating(true)
    try {
      // 1. Use the teacherAssignmentId prop directly (already resolved by parent)
      const taId = teacherAssignmentId
      if (!taId) {
        toast.error('No se encontró tu asignación docente para este aula.')
        setAIGenerating(false)
        return
      }

      // 2. Fetch guiones filtered by date range (if provided)
      let q = (supabase as any)
        .from('guiones_clase')
        .select('title, date, objective, intro, development, closure, resources, evaluation')
        .eq('teacher_assignment_id', taId)
        .order('date', { ascending: true })

      if (aiDateFrom) q = q.gte('date', aiDateFrom)
      if (aiDateTo)   q = q.lte('date', aiDateTo)

      const { data: guiones, error: guionErr } = await q

      if (guionErr) throw guionErr
      if (!guiones || guiones.length === 0) {
        toast.error('No hay guiones de clase en el período seleccionado. Crea guiones en "Mis Materias" primero.')
        return
      }

      // 3. Call the AI API route
      const res = await fetch(apiUrl('/api/generate-exam'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiones, exam_type: aiExamType }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')

      // 4. Populate form and draft questions
      if (data.title && !form.title.trim()) {
        setForm(p => ({ ...p, title: data.title, instructions: data.instructions ?? p.instructions }))
      } else if (data.instructions) {
        setForm(p => ({ ...p, instructions: data.instructions }))
      }

      const drafts: QuestionDraft[] = (data.questions ?? []).map((q: any) => ({
        temp_id:       crypto.randomUUID(),
        question_text: q.question_text ?? '',
        question_type: (q.question_type as QType) ?? 'multiple_choice',
        points:        q.points ?? 1,
        options: (q.options ?? []).map((o: any) => ({
          temp_id:     crypto.randomUUID(),
          option_text: o.option_text ?? '',
          match_text:  '',
          is_correct:  o.is_correct ?? false,
        })),
      }))

      setDraftQuestions(drafts)
      setShowAIPanel(false)
      toast.success(`✨ ${drafts.length} preguntas generadas con IA`)
    } catch (e: any) {
      toast.error('Error: ' + (e.message ?? 'Fallo al generar el examen'))
    } finally {
      setAIGenerating(false)
    }
  }

  // ── Temario ──────────────────────────────────────────────────────────────

  const openTemario = async (exam: Exam) => {
    setTemarioExam(exam)
    setTemarioData(null)
    setTemarioLoading(true)
    try {
      // Fetch exam questions
      const { data: qs } = await (supabase as any)
        .from('exam_questions')
        .select('question_text, question_type, points, options:exam_options(option_text, is_correct)')
        .eq('exam_id', exam.id)
        .order('sort_order')

      // Fetch guiones via teacher_assignments (profile → teachers → teacher_assignments)
      let guiones: any[] = []
      if (profile) {
        const { data: teacherRec } = await (supabase as any)
          .from('teachers').select('id').eq('user_id', profile.id).maybeSingle()
        if (teacherRec?.id) {
          const { data: tas } = await (supabase as any)
            .from('teacher_assignments')
            .select('id')
            .eq('section_id', classroom.section_id)
            .eq('school_year_id', classroom.school_year_id)
            .eq('teacher_id', teacherRec.id)
          const taIds = (tas ?? []).map((t: any) => t.id)
          if (taIds.length > 0) {
            const { data: gs } = await (supabase as any)
              .from('guiones_clase')
              .select('title, date, objective, intro, development, closure, resources, evaluation')
              .in('teacher_assignment_id', taIds)
              .order('date', { ascending: true })
            guiones = gs ?? []
          }
        }
      }

      const res = await fetch(apiUrl('/api/generate-temario'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_title: exam.title, questions: qs ?? [], guiones }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')
      setTemarioData(data as TemarioData)
    } catch (e: any) {
      toast.error('Error: ' + (e.message ?? 'No se pudo generar el temario'))
      setTemarioExam(null)
    } finally {
      setTemarioLoading(false)
    }
  }

  const printTemario = () => {
    if (!temarioData || !temarioExam) return
    const win = window.open('', '_blank')
    if (!win) { toast.error('Activa los pop-ups para imprimir'); return }

    const origin = window.location.origin
    const logoUrl  = `${origin}/eos-logo.png`
    const bgUrl    = `${origin}/eos-bg.jpeg`

    const nivelLabel: Record<string, string> = {
      memorizacion: '📖 Memorización',
      comprension: '🔍 Comprensión',
      analisis: '⚡ Análisis',
      reflexion_personal: '💭 Reflexión personal',
    }
    const nivelBg: Record<string, string> = {
      memorizacion: '#e0f2fe',
      comprension: '#d1fae5',
      analisis: '#fef3c7',
      reflexion_personal: '#ede9fe',
    }
    const nivelColor: Record<string, string> = {
      memorizacion: '#0369a1',
      comprension: '#065f46',
      analisis: '#92400e',
      reflexion_personal: '#5b21b6',
    }

    const tiposHtml = (temarioData.tipos_de_preguntas ?? []).map(tp => `
      <div style="border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;margin-bottom:6px;background:#fff;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;gap:4px;">
          <span style="font-weight:700;font-size:11px;color:#1e3a5f;">${tp.icono} ${tp.tipo}</span>
          <span style="font-size:9px;font-weight:600;background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:16px;">${tp.cantidad}</span>
        </div>
        <p style="font-size:10px;color:#64748b;margin:0 0 3px;line-height:1.3;">${tp.descripcion}</p>
        <div style="background:#f5f3ff;border-left:2px solid #7c3aed;padding:3px 6px;border-radius:0 3px 3px 0;">
          <span style="font-size:10px;font-weight:600;color:#5b21b6;">Prep: </span>
          <span style="font-size:9px;color:#5b21b6;line-height:1.3;">${tp.como_prepararse}</span>
        </div>
      </div>`).join('')

    const temasHtml = temarioData.temas.map(t => {
      const nivel = t.nivel_cognitivo ?? ''
      const etiqueta = nivelLabel[nivel] ?? ''
      const bg = nivelBg[nivel] ?? '#f8fafc'
      const col = nivelColor[nivel] ?? '#475569'
      return `
      <div style="margin-bottom:12px;background:#f8fafc;border-radius:8px;padding:10px 12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <p style="font-weight:700;font-size:13px;color:#1e3a5f;margin:0;">${t.numero}. ${t.tema}</p>
          ${etiqueta ? `<span style="font-size:10px;font-weight:700;background:${bg};color:${col};padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;">${etiqueta}</span>` : ''}
        </div>
        <ul style="margin:0 0 0 18px;padding:0;">
          ${t.subtemas.map(s => `<li style="font-size:12px;color:#334155;margin-bottom:3px;">${s}</li>`).join('')}
        </ul>
        ${t.como_estudiar ? `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;margin-top:6px;font-size:11px;color:#475569;"><strong>Cómo estudiar:</strong> ${t.como_estudiar}</div>` : ''}
      </div>`
    }).join('')

    const conceptosHtml = temarioData.conceptos_clave.map(c =>
      `<li style="font-size:12px;color:#334155;margin-bottom:3px;">${c}</li>`).join('')

    const habilidadesHtml = temarioData.habilidades.map(h =>
      `<li style="font-size:12px;color:#334155;margin-bottom:3px;">${h}</li>`).join('')

    const consejosHtml = temarioData.consejos.map(c =>
      `<li style="font-size:12px;color:#0f5132;margin-bottom:2px;">${c}</li>`).join('')

    // Dividir temas en grupos (6 temas por página en lugar de 4)
    const temasArray = temarioData.temas || []
    const temasPerPage = 6
    const temaGroups: typeof temasArray[] = []
    for (let i = 0; i < temasArray.length; i += temasPerPage) {
      temaGroups.push(temasArray.slice(i, i + temasPerPage))
    }

    // Generar HTML de cada grupo de temas
    const temaGroupsHtml = temaGroups.map(group => 
      group.map(t => {
        const nivel = t.nivel_cognitivo ?? ''
        const etiqueta = nivelLabel[nivel] ?? ''
        const bg = nivelBg[nivel] ?? '#f8fafc'
        const col = nivelColor[nivel] ?? '#475569'
        return `
        <div style="margin-bottom:8px;background:#f8fafc;border-radius:6px;padding:8px 10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:4px;">
            <p style="font-weight:700;font-size:12px;color:#1e3a5f;margin:0;">${t.numero}. ${t.tema}</p>
            ${etiqueta ? `<span style="font-size:9px;font-weight:700;background:${bg};color:${col};padding:1px 6px;border-radius:20px;white-space:nowrap;flex-shrink:0;">${etiqueta}</span>` : ''}
          </div>
          <ul style="margin:0 0 0 16px;padding:0;">
            ${t.subtemas.map(s => `<li style="font-size:11px;color:#334155;margin-bottom:2px;">${s}</li>`).join('')}
          </ul>
          ${t.como_estudiar ? `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;margin-top:4px;font-size:10px;color:#475569;"><strong>Cómo:</strong> ${t.como_estudiar}</div>` : ''}
        </div>`
      }).join('')
    )

    // Construir páginas optimizadas
    const pageDefs = [
      { content: `
        <div style="border-bottom:3px solid #c0392b;padding-bottom:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <img src="${logoUrl}" alt="Escuela Cristiana E-OS" style="height:56px;display:block;" />
          <div style="text-align:right;flex:1;">
            <div style="background:#1e3a5f;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Temario</div>
            <div style="font-size:10px;color:#64748b;margin-top:3px;">${temarioExam.title}</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:1px;">2025 – 2026</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <div style="flex:2;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;font-weight:700;">Estudiante</div>
            <div style="border-bottom:1px solid #cbd5e1;height:18px;"></div>
          </div>
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;font-weight:700;">Grado</div>
            <div style="border-bottom:1px solid #cbd5e1;height:18px;"></div>
          </div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:#1e40af;line-height:1.4;">
          ${temarioData.introduccion}
        </div>
        ${(temarioData.tipos_de_preguntas ?? []).length > 0 ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:0 0 8px;">🎯 Tipos</div>
          ${tiposHtml}
        </div>` : ''}
      ` }
    ]

    // Agregar páginas de temas
    temaGroupsHtml.forEach((groupHtml, idx) => {
      pageDefs.push({
        content: `
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:0 0 8px;">📚 Temas ${temaGroupsHtml.length > 1 ? ` (${idx + 1}/${temaGroupsHtml.length})` : ''}</div>
          ${groupHtml}
        `
      })
    })

    // Página final: Conceptos + Habilidades + Consejos juntos
    pageDefs.push({ content: `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:0 0 6px;">🔑 Conceptos Clave</div>
      <ul style="margin:0 0 10px 16px;padding:0;">${conceptosHtml}</ul>
      
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:8px 0 6px;">✅ Habilidades</div>
      <ul style="margin:0 0 10px 16px;padding:0;">${habilidadesHtml}</ul>
      
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:8px 0 6px;">💡 Consejos</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:8px;">
        <ul style="margin:0 0 0 16px;padding:0;">${consejosHtml}</ul>
      </div>
      <div style="margin-top:12px;text-align:right;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:6px;">
        ${new Date().toLocaleDateString('es-CR', { day:'2-digit', month:'short', year:'numeric' })} · E-OS
      </div>
    ` })

    // Generar HTML con múltiples páginas
    const pagesHtml = pageDefs.map((page, idx) => `
      <div class="page">
        <img src="${bgUrl}" alt="" aria-hidden="true" class="bg-wm" />
        ${page.content}
      </div>
    `).join('')

    const html = `<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8"/>
      <title>Temario — ${temarioExam.title}</title>
      <style>
        * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
        body { font-family:Arial,sans-serif; margin:0; padding:0; background:#fff; color:#1e293b; }
        .page { padding:20px 24px; max-width:800px; margin:0 auto; position:relative; overflow:visible; }
        .bg-wm { position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:1;z-index:0;pointer-events:none; }
        .page > *:not(.bg-wm) { position:relative; z-index:1; }
        p, li, div { orphans:2; widows:2; }
        @media print {
          * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
          body { margin:0; padding:0; }
          .page { 
            padding:20px 24px;
            max-width:100%;
            margin:0;
            height:297mm;
            overflow:hidden;
            page-break-after:always;
            page-break-inside:avoid;
          }
          .page:last-child { page-break-after:auto; }
          .bg-wm { position:fixed; top:0; left:0; width:100vw; height:100vh; object-fit:cover; z-index:0; }
          @page { 
            margin:0;
            size:A4 portrait;
            padding:0;
          }
        }
        @media screen { .page { border-bottom:2px dashed #e2e8f0; height:auto; } }
      </style>
    </head><body>
    ${pagesHtml}
    </body></html>`

    win.document.write(html)
    win.document.close()
    win.onload = () => {
      const imgs = Array.from(win.document.images)
      if (imgs.length === 0) { win.print(); return }
      let loaded = 0
      const tryPrint = () => { if (++loaded >= imgs.length) win.print() }
      imgs.forEach(img => {
        if (img.complete) tryPrint()
        else { img.onload = tryPrint; img.onerror = tryPrint }
      })
    }
  }

  // ── Print ────────────────────────────────────────────────────────────────

  const handlePrint = async (exam: Exam) => {
    const { data: qs } = await (supabase as any)
      .from('exam_questions')
      .select('*, options:exam_options(*)')
      .eq('exam_id', exam.id)
      .order('sort_order')
    const questions: QuestionFull[] = (qs ?? []).map((q: any) => ({
      ...q,
      options: (q.options ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))
    const win = window.open('', '_blank')
    if (!win) { toast.error('Activa los pop-ups para imprimir'); return }

    const origin = window.location.origin
    const logoUrl = `${origin}/eos-logo.png`
    const bgUrl   = `${origin}/eos-bg.jpeg`
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const totalPts = questions.reduce((s, q) => s + Number(q.points), 0)

    // ── Pagination ───────────────────────────────────────────────────────
    // A4 at 96dpi = 1122px, minus 14mm*2 padding (~106px) = ~1016px usable
    const PAGE_H  = 1010  // usable height per page
    const HEADER_H = 270  // header + student info + instructions on page 1

    const estimateQH = (q: QuestionFull): number => {
      const extraLines = Math.max(0, Math.ceil(q.question_text.length / 55) - 1)
      let h = 44 + extraLines * 18  // question text
      if (q.question_type === 'multiple_choice') h += q.options.length * 22
      else if (q.question_type === 'true_false')  h += 24
      else if (q.question_type === 'open')         h += 72  // 3 answer lines
      else if (q.question_type === 'matching')     h += q.options.length * 22
      return h + 18  // margin-bottom
    }

    // Split questions into pages
    const pages: QuestionFull[][] = []
    let pageQs: QuestionFull[] = []
    let usedH = HEADER_H  // page 1 starts with header already consuming space

    for (const q of questions) {
      const qH = estimateQH(q)
      if (pageQs.length > 0 && usedH + qH > PAGE_H) {
        pages.push(pageQs)
        pageQs = [q]
        usedH = qH
      } else {
        pageQs.push(q)
        usedH += qH
      }
    }
    if (pageQs.length > 0) pages.push(pageQs)

    // ── Build question HTML ───────────────────────────────────────────────
    const buildQ = (q: QuestionFull, num: number): string => {
      let html = `<div class="question">
        <p class="qtitle">${num}. ${q.question_text}<span class="pts">(${q.points} pts)</span></p>`
      if (q.question_type === 'multiple_choice') {
        q.options.forEach((o, j) => {
          html += `<p class="opt">○ &nbsp;${letters[j]}) ${o.option_text}</p>`
        })
      } else if (q.question_type === 'true_false') {
        html += `<p class="opt">○ &nbsp;Verdadero &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ○ &nbsp;Falso</p>`
      } else if (q.question_type === 'open') {
        html += `<div class="ans-line"></div><div class="ans-line"></div><div class="ans-line"></div>`
      } else if (q.question_type === 'matching') {
        const rights = shuffle(q.options.map((o, j) => `${letters[j]}. &nbsp;${o.match_text}`))
        html += `<div class="match">
          <div>${q.options.map((o, j) => `<p class="opt">${j + 1}. ___ &nbsp;${o.option_text}</p>`).join('')}</div>
          <div>${rights.map(r => `<p class="opt">${r}</p>`).join('')}</div>
        </div>`
      }
      html += `</div>`
      return html
    }

    // ── Assemble pages HTML ───────────────────────────────────────────────
    let globalIdx = 0
    let pagesHtml = ''

    pages.forEach((pQs, pi) => {
      const isLast = pi === pages.length - 1
      pagesHtml += `<div class="page${isLast ? ' last' : ''}">`

      if (pi === 0) {
        // Page 1: full header + student info
        pagesHtml += `
        <div class="no-break">
          <div class="header-bar">
            <img src="${logoUrl}" alt="E-OS" class="logo" />
            <div style="text-align:right;">
              <div class="badge">Examen</div>
              <div class="exam-title">${exam.title}</div>
              <div class="exam-year">Año Lectivo 2025 – 2026</div>
            </div>
          </div>
          <div class="student-row">
            <div class="sfield wide"><div class="slabel">Nombre del Estudiante</div><div class="sline"></div></div>
            <div class="sfield"><div class="slabel">Grado / Sección</div><div class="sline"></div></div>
            <div class="sfield center">
              <div class="slabel">Puntaje Total</div>
              <div class="stotal">${totalPts} pts</div>
              ${exam.time_limit_minutes ? `<div class="stime">Tiempo: ${exam.time_limit_minutes} min</div>` : ''}
            </div>
          </div>
          ${exam.instructions ? `<div class="instructions"><strong>Instrucciones:</strong> ${exam.instructions}</div>` : ''}
        </div>`
      }

      pQs.forEach(q => { pagesHtml += buildQ(q, ++globalIdx) })

      if (isLast) {
        pagesHtml += `<div class="footer">Emitido el ${new Date().toLocaleDateString('es-CR', { day:'2-digit', month:'long', year:'numeric' })} · E-OS</div>`
      }

      pagesHtml += `</div>`
    })

    // ── Full HTML ─────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8"/>
      <title>${exam.title}</title>
      <style>
        *  { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; margin:0; padding:0; }
        body { font-family:Arial,sans-serif; background:#fff; color:#1e293b; }

        .page {
          padding:14mm 16mm;
          background-image:url('${bgUrl}');
          background-size:cover;
          background-position:center;
        }
        @media screen {
          .page { max-width:210mm; margin:0 auto; min-height:297mm; border-bottom:3px dashed #e2e8f0; }
        }
        @media print {
          .page { width:210mm; min-height:297mm; page-break-after:always; break-after:page; }
          .page.last { page-break-after:auto; break-after:auto; }
          @page { margin:0; size:A4 portrait; }
        }

        /* Header */
        .no-break { page-break-inside:avoid; break-inside:avoid; }
        .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #c0392b; padding-bottom:12px; margin-bottom:16px; }
        .logo { height:60px; display:block; }
        .badge { background:#1e3a5f; color:#fff; padding:5px 16px; border-radius:6px; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; display:inline-block; }
        .exam-title { font-size:11px; color:#64748b; margin-top:5px; text-transform:uppercase; letter-spacing:.5px; }
        .exam-year  { font-size:10px; color:#94a3b8; margin-top:2px; }

        /* Student row */
        .student-row { display:flex; gap:12px; margin-bottom:14px; }
        .sfield { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; flex:1; }
        .sfield.wide { flex:2; }
        .sfield.center { text-align:center; }
        .slabel { font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
        .sline  { border-bottom:1px solid #cbd5e1; height:22px; margin-top:4px; }
        .stotal { font-size:20px; font-weight:900; color:#1e3a5f; line-height:1.2; margin-top:4px; }
        .stime  { font-size:10px; color:#64748b; margin-top:2px; }
        .instructions { background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:9px 13px; margin-bottom:14px; font-size:11px; color:#92400e; }

        /* Questions */
        .question  { margin-bottom:16px; page-break-inside:avoid; break-inside:avoid; }
        .qtitle    { font-weight:700; font-size:12.5px; color:#1e293b; margin-bottom:5px; line-height:1.4; }
        .pts       { font-weight:400; font-size:10.5px; color:#94a3b8; margin-left:5px; }
        .opt       { margin:3px 0 3px 18px; font-size:12px; color:#334155; }
        .ans-line  { border-bottom:1px solid #cbd5e1; height:20px; margin:5px 18px 0; }
        .match     { display:flex; gap:50px; margin:5px 0 0 18px; }

        /* Footer */
        .footer { margin-top:14px; text-align:right; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:7px; }
      </style>
    </head><body>
    ${pagesHtml}
    </body></html>`

    win.document.write(html)
    win.document.close()
    win.onload = () => {
      const imgs = Array.from(win.document.images)
      if (imgs.length === 0) { win.print(); return }
      let loaded = 0
      const tryPrint = () => { if (++loaded >= imgs.length) win.print() }
      imgs.forEach(img => {
        if (img.complete) tryPrint()
        else { img.onload = tryPrint; img.onerror = tryPrint }
      })
    }
  }

  // ── Take exam ────────────────────────────────────────────────────────────

  const openTakeExam = async (exam: Exam) => {
    setActiveExam(exam)
    setAnswers({})
    setMySubmission(null)
    setTimeLeft(null)
    if (timerRef.current) clearInterval(timerRef.current)

    const { data: qs } = await (supabase as any)
      .from('exam_questions')
      .select('*, options:exam_options(*)')
      .eq('exam_id', exam.id)
      .order('sort_order')
    const questions: QuestionFull[] = (qs ?? []).map((q: any) => ({
      ...q, options: (q.options ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))
    setExamQuestions(questions)

    // Shuffle right side for matching
    const sr: Record<string, string[]> = {}
    questions.forEach(q => {
      if (q.question_type === 'matching') {
        sr[q.id] = shuffle(q.options.map(o => o.match_text ?? ''))
      }
    })
    setShuffledRight(sr)

    if (isStudent && profile) {
      const { data: student } = await (supabase as any)
        .from('students').select('id').eq('user_id', profile.id).single()
      if (student) {
        const { data: sub } = await (supabase as any)
          .from('exam_submissions')
          .select('*')
          .eq('exam_id', exam.id)
          .eq('student_id', student.id)
          .maybeSingle()

        if (sub?.submitted_at) {
          setMySubmission(sub as Submission)
        } else if (sub) {
          // Resume in-progress
          setMySubmission(sub as Submission)
          const { data: ans } = await (supabase as any)
            .from('exam_answers').select('*').eq('submission_id', sub.id)
          const map: AnswerMap = {}
          ;(ans ?? []).forEach((a: any) => {
            if (a.open_answer?.startsWith('{')) {
              try { map[a.question_id] = { matching: JSON.parse(a.open_answer) } } catch {}
            } else if (a.selected_option_id) {
              map[a.question_id] = { option_id: a.selected_option_id }
            } else {
              map[a.question_id] = { text: a.open_answer ?? '' }
            }
          })
          setAnswers(map)
          if (exam.time_limit_minutes) {
            const elapsed = Math.floor((Date.now() - new Date(sub.started_at).getTime()) / 1000)
            const remaining = exam.time_limit_minutes * 60 - elapsed
            if (remaining > 0) startCountdown(remaining)
          }
        } else {
          // Create new submission
          const { data: newSub } = await (supabase as any)
            .from('exam_submissions')
            .insert({ exam_id: exam.id, student_id: student.id })
            .select().single()
          setMySubmission(newSub as Submission)
          if (exam.time_limit_minutes) startCountdown(exam.time_limit_minutes * 60)
        }
      }
    }
    setView('take')
  }

  const startCountdown = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    let rem = seconds
    setTimeLeft(rem)
    timerRef.current = setInterval(() => {
      rem--
      setTimeLeft(rem)
      if (rem <= 0) {
        clearInterval(timerRef.current!)
        toast('Tiempo agotado — enviando examen automáticamente...')
        const sub = subRef.current
        if (sub && !sub.submitted_at) {
          doSubmit(sub.id, qsRef.current, answersRef.current)
        }
      }
    }, 1000)
  }

  const doSubmit = async (submissionId: string, questions: QuestionFull[], currentAnswers: AnswerMap) => {
    if (timerRef.current) clearInterval(timerRef.current)
    let autoScore = 0
    const totalPoints = questions.reduce((s, q) => s + Number(q.points), 0)
    for (const q of questions) {
      const ans = currentAnswers[q.id]
      let isCorrect: boolean | null = null
      let pointsEarned = 0

      if (q.question_type === 'open') {
        isCorrect = null
      } else if (q.question_type === 'matching') {
        const matching = ans?.matching ?? {}
        let correct = 0
        q.options.forEach(o => { if (matching[o.id] === o.match_text) correct++ })
        const ratio = q.options.length > 0 ? correct / q.options.length : 0
        pointsEarned = parseFloat((ratio * Number(q.points)).toFixed(2))
        isCorrect = ratio === 1
        autoScore += pointsEarned
      } else {
        const correctOpt = q.options.find(o => o.is_correct)
        if (correctOpt && ans?.option_id === correctOpt.id) {
          isCorrect = true
          pointsEarned = Number(q.points)
          autoScore += pointsEarned
        } else {
          isCorrect = !!ans?.option_id && false
        }
      }

      await (supabase as any).from('exam_answers').upsert({
        submission_id:      submissionId,
        question_id:        q.id,
        selected_option_id: ans?.option_id ?? null,
        open_answer:        q.question_type === 'matching'
          ? JSON.stringify(ans?.matching ?? {})
          : (ans?.text ?? null),
        is_correct:    isCorrect,
        points_earned: q.question_type === 'open' ? null : pointsEarned,
      }, { onConflict: 'submission_id,question_id' })
    }

    const pct = parseFloat(((autoScore / (totalPoints || 1)) * 100).toFixed(2))
    await (supabase as any).from('exam_submissions').update({
      submitted_at: new Date().toISOString(),
      auto_score:   autoScore,
      final_score:  pct,
    }).eq('id', submissionId)

    toast.success('Examen enviado')
    const { data: updated } = await (supabase as any)
      .from('exam_submissions').select('*').eq('id', submissionId).single()
    setMySubmission(updated as Submission)
  }

  const handleSubmit = () => {
    if (!mySubmission) return
    if (!confirm('¿Enviar el examen? No podrás cambiar tus respuestas.')) return
    doSubmit(mySubmission.id, examQuestions, answers)
  }

  // ── Results ─────────────────────────────────────────────────────────────

  const openResults = async (exam: Exam) => {
    setActiveExam(exam)
    const db = supabase as any

    // Load question count for this exam
    const { data: qs } = await db
      .from('exam_questions')
      .select('id')
      .eq('exam_id', exam.id)
    setExamQuestions((qs ?? []) as QuestionFull[])

    const { data: subs } = await db
      .from('exam_submissions')
      .select('*')
      .eq('exam_id', exam.id)
      .order('submitted_at', { ascending: false })

    const subsArr: any[] = subs ?? []

    // Resolve student names manually
    if (subsArr.length > 0) {
      const studentIds = Array.from(new Set(subsArr.map((s: any) => s.student_id as string)))
      const { data: students } = await db.from('students').select('id, user_id').in('id', studentIds)
      const userIds = Array.from(new Set((students ?? []).map((s: any) => s.user_id as string).filter(Boolean)))
      const { data: profs } = userIds.length
        ? await db.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] }
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]))
      const studentNameMap = new Map((students ?? []).map((s: any) => [s.id, profMap.get(s.user_id) ?? 'Alumno']))

      // Fetch answer counts for each submission
      const subIds = subsArr.map((s: any) => s.id as string)
      const { data: answerCounts } = await db
        .from('exam_answers')
        .select('submission_id')
        .in('submission_id', subIds)
      const countMap = new Map<string, number>()
      for (const a of (answerCounts ?? [])) {
        countMap.set(a.submission_id, (countMap.get(a.submission_id) ?? 0) + 1)
      }

      const enriched = subsArr.map((s: any) => ({
        ...s,
        student: { profile: { full_name: studentNameMap.get(s.student_id) ?? 'Alumno' } },
        answers_count: countMap.get(s.id) ?? 0,
      }))
      setSubmissions(enriched as Submission[])
    } else {
      setSubmissions([])
    }

    setView('results')
  }

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const fmtDuration = (startedAt: string, endedAt: string | null, now: number) => {
    const end = endedAt ? new Date(endedAt).getTime() : now
    const secs = Math.floor((end - new Date(startedAt).getTime()) / 1000)
    if (secs < 0) return '—'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const back = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setView('list')
    setActiveExam(null)
    setExamQuestions([])
    setMySubmission(null)
    setAnswers({})
    setTimeLeft(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: LIST
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'list') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{exams.length} examen{exams.length !== 1 ? 'es' : ''}</p>
        {canManage && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nuevo Examen
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-eos-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : exams.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-36 gap-2">
          <ClipboardList className="w-8 h-8 text-slate-200" />
          <p className="text-slate-400 text-sm">No hay exámenes creados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map(exam => {
            const available = !exam.available_until || new Date(exam.available_until) >= new Date()
            return (
              <div key={exam.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{exam.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        exam.is_published && available
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {exam.is_published && available ? 'Publicado' : exam.is_published ? 'Vencido' : 'Borrador'}
                      </span>
                      {exam.time_limit_minutes && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" /> {exam.time_limit_minutes} min
                        </span>
                      )}
                    </div>
                    {exam.instructions && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{exam.instructions}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(exam.created_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canManage && (
                      <>
                        <button onClick={() => openTemario(exam)}
                          title="Generar temario con IA"
                          className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors">
                          <BookOpen className="w-4 h-4" />
                        </button>
                        <button onClick={() => openResults(exam)}
                          title="Ver resultados"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handlePrint(exam)}
                          title="Imprimir examen"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(exam)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteExam(exam.id)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {isStudent && exam.is_published && available && (
                      <button onClick={() => openTakeExam(exam)}
                        className="btn-primary text-sm flex items-center gap-1.5">
                        Realizar <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Temario Modal ─────────────────────────────────────────── */}
      {temarioExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Temario de Estudio</p>
                  <p className="text-xs text-slate-400 line-clamp-1">{temarioExam.title}</p>
                </div>
              </div>
              <button onClick={() => { setTemarioExam(null); setTemarioData(null) }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {temarioLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
                  <div className="text-center">
                    <p className="text-slate-700 font-medium text-sm">Generando temario con IA…</p>
                    <p className="text-slate-400 text-xs mt-1">Claude está analizando las preguntas y los guiones de clase</p>
                  </div>
                </div>
              ) : temarioData ? (
                <div className="space-y-5">
                  {/* Intro */}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                    {temarioData.introduccion}
                  </div>

                  {/* Tipos de preguntas — sección clave */}
                  {temarioData.tipos_de_preguntas && temarioData.tipos_de_preguntas.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">🎯 Tipos de preguntas en este examen</p>
                      <div className="space-y-2">
                        {temarioData.tipos_de_preguntas.map((tp, i) => (
                          <div key={i} className="border border-slate-200 rounded-xl p-3 bg-white">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-semibold text-slate-800 text-sm">
                                {tp.icono} {tp.tipo}
                              </span>
                              <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {tp.cantidad} preg.
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{tp.descripcion}</p>
                            <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                              <span className="text-xs font-semibold text-violet-700">Cómo prepararse: </span>
                              <span className="text-xs text-violet-700">{tp.como_prepararse}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Temas */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">📚 Temas a estudiar</p>
                    <div className="space-y-3">
                      {temarioData.temas.map(t => {
                        const nivelColor: Record<string, string> = {
                          memorizacion: 'bg-sky-50 border-sky-200 text-sky-700',
                          comprension: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                          analisis: 'bg-amber-50 border-amber-200 text-amber-700',
                          reflexion_personal: 'bg-purple-50 border-purple-200 text-purple-700',
                        }
                        const nivelLabel: Record<string, string> = {
                          memorizacion: '📖 Memorización',
                          comprension: '🔍 Comprensión',
                          analisis: '⚡ Análisis',
                          reflexion_personal: '💭 Reflexión personal',
                        }
                        const nColor = nivelColor[t.nivel_cognitivo ?? ''] ?? 'bg-slate-50 border-slate-200 text-slate-600'
                        const nLabel = nivelLabel[t.nivel_cognitivo ?? '']
                        return (
                          <div key={t.numero} className="bg-slate-50 rounded-xl p-3">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <p className="font-semibold text-slate-800 text-sm">{t.numero}. {t.tema}</p>
                              {nLabel && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${nColor}`}>
                                  {nLabel}
                                </span>
                              )}
                            </div>
                            <ul className="space-y-1 pl-4 mb-2">
                              {t.subtemas.map((s, i) => (
                                <li key={i} className="text-xs text-slate-600 list-disc">{s}</li>
                              ))}
                            </ul>
                            {t.como_estudiar && (
                              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 mt-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cómo estudiar: </span>
                                <span className="text-xs text-slate-600">{t.como_estudiar}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Conceptos clave */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">🔑 Conceptos clave</p>
                    <div className="flex flex-wrap gap-2">
                      {temarioData.conceptos_clave.map((c, i) => (
                        <span key={i} className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Habilidades */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">✅ Habilidades que serán evaluadas</p>
                    <ul className="space-y-1.5 pl-4">
                      {temarioData.habilidades.map((h, i) => (
                        <li key={i} className="text-sm text-slate-700 list-disc">{h}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Consejos */}
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">💡 Consejos de estudio</p>
                    <ul className="space-y-1.5 pl-4">
                      {temarioData.consejos.map((c, i) => (
                        <li key={i} className="text-sm text-emerald-800 list-disc">{c}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {temarioData && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-400" /> Generado con IA · Claude
                </p>
                <div className="flex gap-2">
                  <button onClick={() => openTemario(temarioExam)}
                    className="btn-secondary text-sm flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Regenerar
                  </button>
                  <button onClick={printTemario}
                    className="btn-primary text-sm flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5" /> Imprimir temario
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: EDIT
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'edit') return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-slate-900">{editExam ? 'Editar Examen' : 'Nuevo Examen'}</h2>
      </div>

      {/* Exam info */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Título *</label>
          <input className="input" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Ej: Examen Parcial — Matemáticas" />
        </div>
        <div>
          <label className="label">Instrucciones</label>
          <textarea className="input resize-none" rows={2} value={form.instructions}
            onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
            placeholder="Instrucciones para el estudiante (opcional)" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Límite de tiempo (minutos)</label>
            <input className="input" type="number" min={1} value={form.time_limit_minutes}
              onChange={e => setForm(p => ({ ...p, time_limit_minutes: e.target.value }))}
              placeholder="Sin límite" />
          </div>
          <div>
            <label className="label">Disponible desde</label>
            <input className="input" type="datetime-local" value={form.available_from}
              onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
          </div>
          <div>
            <label className="label">Disponible hasta</label>
            <input className="input" type="datetime-local" value={form.available_until}
              onChange={e => setForm(p => ({ ...p, available_until: e.target.value }))} />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div onClick={() => setForm(p => ({ ...p, is_published: !p.is_published }))}
            className={`w-10 h-5 rounded-full relative transition-colors ${form.is_published ? 'bg-indigo-600' : 'bg-slate-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_published ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-slate-700">Publicar (visible para alumnos)</span>
        </label>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium text-slate-800 text-sm">Preguntas ({draftQuestions.length})</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAIPanel(p => !p)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium hover:from-violet-700 hover:to-indigo-700 transition-all shadow-sm">
              <Sparkles className="w-3.5 h-3.5" /> Generar con IA
            </button>
            <button onClick={() => setDraftQuestions(p => [...p, newQuestion()])}
              className="btn-secondary text-sm flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Agregar pregunta
            </button>
          </div>
        </div>

        {/* AI Generation Panel */}
        {showAIPanel && (
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" /> Generar examen con Inteligencia Artificial
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Claude analizará tus guiones de clase y creará las preguntas automáticamente.
                </p>
              </div>
              <button onClick={() => setShowAIPanel(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Tipo de examen</label>
                <select className="input" value={aiExamType} onChange={e => setAIExamType(e.target.value as typeof aiExamType)}>
                  <option value="mensual">Mensual (~12 preguntas)</option>
                  <option value="periodo">Período TESLA (~22 preguntas)</option>
                  <option value="trimestre">Trimestral (~35 preguntas)</option>
                </select>
              </div>
              <div>
                <label className="label">Guiones desde (fecha)</label>
                <input type="date" className="input" value={aiDateFrom}
                  onChange={e => setAIDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">Guiones hasta (fecha)</label>
                <input type="date" className="input" value={aiDateTo}
                  onChange={e => setAIDateTo(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {aiDateFrom || aiDateTo
                  ? `Guiones del ${aiDateFrom || '…'} al ${aiDateTo || '…'}`
                  : 'Sin filtro de fecha — usará todos tus guiones del aula'}
              </p>
              <button onClick={generateWithAI} disabled={aiGenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {aiGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando… (puede tardar ~30 seg)
                  </>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generar preguntas</>
                )}
              </button>
            </div>
          </div>
        )}


        {draftQuestions.map((q, qi) => (
          <div key={q.temp_id} className="card p-4 space-y-3 border-l-4 border-indigo-300">
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-indigo-500 mt-2.5 shrink-0">#{qi + 1}</span>
              <div className="flex-1 space-y-3">
                <div className="flex gap-3 flex-wrap">
                  <select className="input flex-1 min-w-[160px]" value={q.question_type}
                    onChange={e => changeQType(qi, e.target.value as QType)}>
                    {(Object.keys(Q_TYPE_LABELS) as QType[]).map(t => (
                      <option key={t} value={t}>{Q_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 whitespace-nowrap">Puntos</label>
                    <input type="number" min={0.5} step={0.5} className="input w-20" value={q.points}
                      onChange={e => updateQ(qi, { points: parseFloat(e.target.value) || 1 })} />
                  </div>
                </div>
                <textarea className="input resize-none" rows={2} value={q.question_text}
                  onChange={e => updateQ(qi, { question_text: e.target.value })}
                  placeholder="Escribe la pregunta..." />

                {/* Options for multiple_choice */}
                {q.question_type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {q.options.map((o, oi) => (
                      <div key={o.temp_id} className="flex items-center gap-2">
                        <input type="radio" name={`correct-${q.temp_id}`} checked={o.is_correct}
                          onChange={() => markCorrect(qi, oi)} className="accent-indigo-600 shrink-0" />
                        <input className="input flex-1" value={o.option_text}
                          onChange={e => updateOpt(qi, oi, { option_text: e.target.value })}
                          placeholder={`Opción ${oi + 1}`} />
                        {q.options.length > 2 && (
                          <button onClick={() => setDraftQuestions(p => p.map((qx, i) => i !== qi ? qx : {
                            ...qx, options: qx.options.filter((_, j) => j !== oi)
                          }))} className="p-1 text-slate-300 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setDraftQuestions(p => p.map((qx, i) => i !== qi ? qx : {
                      ...qx, options: [...qx.options, newOptionDraft()]
                    }))} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Agregar opción
                    </button>
                    <p className="text-xs text-slate-400">Selecciona el radio de la opción correcta</p>
                  </div>
                )}

                {/* True/False */}
                {q.question_type === 'true_false' && (
                  <div className="flex gap-4">
                    {['Verdadero', 'Falso'].map((label, oi) => (
                      <label key={label} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`tf-${q.temp_id}`}
                          checked={q.options[oi]?.is_correct ?? false}
                          onChange={() => updateQ(qi, {
                            options: tfOptions().map((o, j) => ({ ...o, is_correct: j === oi }))
                          })}
                          className="accent-indigo-600" />
                        <span className="text-sm text-slate-700">{label}</span>
                      </label>
                    ))}
                    <p className="text-xs text-slate-400 self-center">← Marca la correcta</p>
                  </div>
                )}

                {/* Open */}
                {q.question_type === 'open' && (
                  <p className="text-xs text-slate-400 italic">El alumno escribirá su respuesta — calificación manual.</p>
                )}

                {/* Matching */}
                {q.question_type === 'matching' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-500 px-1">
                      <span>Columna izquierda</span><span>Columna derecha (par correcto)</span>
                    </div>
                    {q.options.map((o, oi) => (
                      <div key={o.temp_id} className="grid grid-cols-2 gap-2 items-center">
                        <input className="input" value={o.option_text}
                          onChange={e => updateOpt(qi, oi, { option_text: e.target.value })}
                          placeholder={`Ítem ${oi + 1}`} />
                        <div className="flex gap-2 items-center">
                          <input className="input flex-1" value={o.match_text}
                            onChange={e => updateOpt(qi, oi, { match_text: e.target.value })}
                            placeholder={`Par ${oi + 1}`} />
                          {q.options.length > 2 && (
                            <button onClick={() => setDraftQuestions(p => p.map((qx, i) => i !== qi ? qx : {
                              ...qx, options: qx.options.filter((_, j) => j !== oi)
                            }))} className="p-1 text-slate-300 hover:text-red-400 shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setDraftQuestions(p => p.map((qx, i) => i !== qi ? qx : {
                      ...qx, options: [...qx.options, { temp_id: crypto.randomUUID(), option_text: '', match_text: '', is_correct: true }]
                    }))} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Agregar par
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setDraftQuestions(p => p.filter((_, i) => i !== qi))}
                className="p-1.5 text-slate-300 hover:text-red-400 shrink-0 mt-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pb-4">
        <button onClick={back} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : editExam ? 'Guardar cambios' : 'Crear examen'}
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: TAKE
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'take' && activeExam) {
    const submitted = !!mySubmission?.submitted_at

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={back} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-semibold text-slate-900">{activeExam.title}</h2>
              {activeExam.instructions && <p className="text-xs text-slate-500 mt-0.5">{activeExam.instructions}</p>}
            </div>
          </div>
          {timeLeft !== null && !submitted && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-semibold text-sm
              ${timeLeft < 60 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
              <Clock className="w-4 h-4" /> {fmtTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Score banner if submitted */}
        {submitted && mySubmission && (
          <div className="card p-4 bg-emerald-50 border-emerald-200 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800">Examen enviado</p>
              <p className="text-sm text-emerald-700">
                Puntaje automático: <strong>{mySubmission.final_score?.toFixed(1) ?? '—'}%</strong>
                {examQuestions.some(q => q.question_type === 'open') && (
                  <span className="ml-2 text-xs text-amber-600">(preguntas abiertas pendientes de calificación manual)</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Questions */}
        <div className="space-y-5">
          {examQuestions.map((q, qi) => {
            const ans = answers[q.id]
            return (
              <div key={q.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-800 text-sm leading-relaxed">
                    <span className="text-indigo-500 font-semibold mr-2">{qi + 1}.</span>
                    {q.question_text}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0">{q.points} pts</span>
                </div>

                {/* Multiple choice */}
                {q.question_type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {q.options.map(o => (
                      <label key={o.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors
                        ${ans?.option_id === o.id ? 'bg-indigo-50 border-indigo-300' : 'border-slate-100 hover:border-slate-200'}
                        ${submitted ? 'cursor-default' : ''}`}>
                        <input type="radio" disabled={submitted}
                          checked={ans?.option_id === o.id}
                          onChange={() => setAnswers(p => ({ ...p, [q.id]: { option_id: o.id } }))}
                          className="accent-indigo-600" />
                        <span className="text-sm text-slate-700">{o.option_text}</span>
                        {submitted && o.is_correct && <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                        {submitted && !o.is_correct && ans?.option_id === o.id && <AlertCircle className="w-4 h-4 text-red-400 ml-auto shrink-0" />}
                      </label>
                    ))}
                  </div>
                )}

                {/* True/False */}
                {q.question_type === 'true_false' && (
                  <div className="flex gap-3">
                    {q.options.map(o => (
                      <label key={o.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors flex-1 justify-center
                        ${ans?.option_id === o.id ? 'bg-indigo-50 border-indigo-300' : 'border-slate-100 hover:border-slate-200'}
                        ${submitted ? 'cursor-default' : ''}`}>
                        <input type="radio" disabled={submitted}
                          checked={ans?.option_id === o.id}
                          onChange={() => setAnswers(p => ({ ...p, [q.id]: { option_id: o.id } }))}
                          className="accent-indigo-600" />
                        <span className="text-sm font-medium text-slate-700">{o.option_text}</span>
                        {submitted && o.is_correct && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </label>
                    ))}
                  </div>
                )}

                {/* Open */}
                {q.question_type === 'open' && (
                  <textarea disabled={submitted} rows={3}
                    className="input resize-none w-full disabled:bg-slate-50"
                    value={ans?.text ?? ''}
                    onChange={e => setAnswers(p => ({ ...p, [q.id]: { text: e.target.value } }))}
                    placeholder="Escribe tu respuesta aquí..." />
                )}

                {/* Matching */}
                {q.question_type === 'matching' && (
                  <div className="space-y-2">
                    {q.options.map(o => {
                      const rights = shuffledRight[q.id] ?? q.options.map(x => x.match_text ?? '')
                      const selected = ans?.matching?.[o.id] ?? ''
                      return (
                        <div key={o.id} className="flex items-center gap-3">
                          <span className="text-sm text-slate-700 flex-1">{o.option_text}</span>
                          <select disabled={submitted}
                            className="input w-48 disabled:bg-slate-50"
                            value={selected}
                            onChange={e => setAnswers(p => ({
                              ...p,
                              [q.id]: { matching: { ...(p[q.id]?.matching ?? {}), [o.id]: e.target.value } }
                            }))}>
                            <option value="">— Seleccionar —</option>
                            {rights.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {submitted && (
                            selected === o.match_text
                              ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                              : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!submitted && isStudent && (
          <div className="flex justify-end pb-4">
            <button onClick={handleSubmit} className="btn-primary flex items-center gap-2">
              <Send className="w-4 h-4" /> Enviar examen
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: RESULTS
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'results' && activeExam) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-semibold text-slate-900">{activeExam.title}</h2>
          <p className="text-xs text-slate-400">{submissions.length} entrega{submissions.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="card flex items-center justify-center h-32">
          <p className="text-slate-400 text-sm">Ningún alumno ha enviado este examen aún</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">Alumno</th>
                <th className="px-4 py-3 font-medium text-slate-600">Enviado</th>
                <th className="px-4 py-3 font-medium text-slate-600">Duración</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Puntaje</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map(sub => {
                const totalQs = activeExam
                  ? (examQuestions.length > 0 ? examQuestions.length : null)
                  : null
                return (
                <tr key={sub.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {(sub.student as any)?.profile?.full_name ?? 'Alumno'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {sub.submitted_at
                      ? new Date(sub.submitted_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-amber-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> En progreso
                          </span>
                          {sub.answers_count != null && (
                            <span className="text-xs text-slate-400">
                              Pregunta {sub.answers_count}{totalQs ? `/${totalQs}` : ''}
                            </span>
                          )}
                        </div>
                      )
                    }
                  </td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums">
                    {sub.submitted_at
                      ? <span className="text-slate-600">{fmtDuration(sub.started_at, sub.submitted_at, liveNow)}</span>
                      : <span className="text-amber-500 font-mono">{fmtDuration(sub.started_at, null, liveNow)}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.final_score != null ? (
                      <span className={`font-semibold ${sub.final_score >= 70 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {sub.final_score.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.submitted_at
                      ? <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full">Enviado</span>
                      : <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full flex items-center gap-1 justify-end"><Lock className="w-3 h-3" />En curso</span>
                    }
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return null
}
