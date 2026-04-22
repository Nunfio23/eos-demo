import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SlotInfo { start: string; end: string }
interface SectionInfo { id: string; name: string; gradeId: string; gradeName: string; lg: string }
interface SubjectConfig {
  subjectId: string; subjectCode: string; subjectName: string
  hours: number; ext: boolean
  teacherId: string | null; teacherName: string | null
}
interface GradeConfig { gradeId: string; gradeName: string; subjects: SubjectConfig[] }

interface RequestBody {
  yearId: string
  classSlotsPerLevel: Record<string, Record<string, SlotInfo[]>>  // lg → day → slots
  sections: SectionInfo[]
  config: GradeConfig[]
  colorMap: Record<string, string>  // subjectId → hex color
  crossGradeGroups?: Array<{ id: string; subjectId: string; subjectCode: string; subjectName: string; gradeIds: string[]; gradeNames: string[]; teacherId: string | null; teacherName: string | null; hours: number }>
}

interface AIScheduleEntry { section: string; subject: string; day: string; start: string }

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

// ── Build the prompt for OpenAI ────────────────────────────────────────────────
function buildPrompt(body: RequestBody): string {
  const { classSlotsPerLevel, sections, config, crossGradeGroups = [] } = body

  // Section name → id lookup (for reference in prompt)
  const secByName: Record<string, string> = {}
  sections.forEach(s => { secByName[s.name] = s.id })

  // Grade → sections
  const gradeSections: Record<string, string[]> = {}
  sections.forEach(s => {
    if (!gradeSections[s.gradeName]) gradeSections[s.gradeName] = []
    gradeSections[s.gradeName].push(s.name)
  })

  // Build slots section of prompt
  const slotsBlock = Object.entries(classSlotsPerLevel).map(([lg, byDay]) => {
    const gradeNames = sections.filter(s => s.lg === lg).map(s => s.gradeName)
      .filter((v, i, a) => a.indexOf(v) === i).join(', ')
    const dayLines = Object.entries(byDay).map(([day, slots]) =>
      `   ${day}: ${slots.map(s => `${s.start}`).join(', ')}`
    ).join('\n')
    return `NIVEL "${lg}" (${gradeNames}):\n${dayLines}`
  }).join('\n\n')

  // Build assignments section
  const assignBlock = config.map(gc => {
    const secs = gradeSections[gc.gradeName] ?? []
    const subjLines = gc.subjects.map(s => {
      const docente = s.teacherName ? `docente: "${s.teacherName}"` : 'SIN DOCENTE ASIGNADO'
      const tipo = s.ext ? `EXTRACURRICULAR (mismo slot para: ${secs.join(', ')})` : `NORMAL (1 por sección)`
      return `  - ${s.subjectCode} (${s.subjectName}): ${s.hours}h/semana, ${docente}, ${tipo}`
    }).join('\n')
    return `${gc.gradeName} — secciones: [${secs.join(', ')}]\n${subjLines}`
  }).join('\n\n')

  // Cross-grade groups
  const cgBlock = crossGradeGroups.length > 0
    ? '\n\nMATERIAS COMPARTIDAS ENTRE GRADOS (deben darse al mismo tiempo para TODOS los grados indicados):\n' +
      crossGradeGroups.map(grp => {
        const allSecs = sections.filter(s => grp.gradeIds.includes(s.gradeId)).map(s => s.name)
        const docente = grp.teacherName ? `docente: "${grp.teacherName}"` : 'SIN DOCENTE'
        return `  - ${grp.subjectCode} (${grp.subjectName}): ${grp.hours}h/semana, ${docente}, secciones: [${allSecs.join(', ')}]`
      }).join('\n')
    : ''

  return `Eres un coordinador académico experto en horarios escolares de El Salvador. Genera un horario semanal COMPLETO y VÁLIDO para una escuela privada cristiana.

SLOTS DE CLASE DISPONIBLES POR NIVEL:
${slotsBlock}

MATERIAS A ASIGNAR POR GRADO:
${assignBlock}${cgBlock}

REGLAS ESTRICTAS (no negociables):
1. Un docente NO puede estar en dos secciones al mismo tiempo (mismo día y hora)
2. Una sección NO puede tener dos materias al mismo tiempo
3. Cada materia debe aparecer EXACTAMENTE el número de horas indicado por semana
4. Materias EXTRACURRICULAR deben tener el MISMO día y hora para TODAS sus secciones
5. Materias COMPARTIDAS ENTRE GRADOS deben tener el MISMO día y hora para TODAS las secciones indicadas
6. Solo usar los slots de clase del nivel correspondiente (no inventes horarios)

PREFERENCIAS DE CALIDAD:
- Distribuir cada materia en días distintos (evitar misma materia 3+ veces en un día)
- Materias con más horas semanales tienen prioridad en los mejores slots (mañana)
- Balancear la carga por día

FORMATO DE RESPUESTA — responde ÚNICAMENTE con este JSON (sin markdown, sin explicación):
{
  "schedule": [
    { "section": "P4", "subject": "mot", "day": "lunes", "start": "08:15" },
    { "section": "P4", "subject": "mot", "day": "martes", "start": "08:15" }
  ],
  "warnings": ["descripción de cualquier conflicto que no pudo resolverse"]
}

IMPORTANTE: Los campos "section" y "subject" deben usar exactamente los mismos nombres y códigos del input. "day" en minúsculas: lunes/martes/miercoles/jueves/viernes.`
}

// ── Map AI response → Entry objects ───────────────────────────────────────────
function mapToEntries(
  aiSchedule: AIScheduleEntry[],
  body: RequestBody
): Array<{
  section_id: string; school_year_id: string; day_of_week: string
  start_time: string; end_time: string; subject_catalog_id: string
  teacher_id: string | null; color: string; notes: string | null
}> {
  const { yearId, sections, config, classSlotsPerLevel, colorMap } = body

  // Build lookups
  const secByName: Record<string, SectionInfo> = {}
  sections.forEach(s => { secByName[s.name] = s })

  const subjByCode: Record<string, SubjectConfig & { gradeId: string }> = {}
  config.forEach(gc => {
    gc.subjects.forEach(s => { subjByCode[s.subjectCode] = { ...s, gradeId: gc.gradeId } })
  })

  // Cross-grade subjects (by code)
  type CgGroup = NonNullable<RequestBody['crossGradeGroups']>[number]
  const cgByCode: Record<string, CgGroup> = {}
  ;(body.crossGradeGroups ?? []).forEach(grp => { cgByCode[grp.subjectCode] = grp })

  const entries: ReturnType<typeof mapToEntries> = []

  for (const item of aiSchedule) {
    const sec = secByName[item.section]
    if (!sec) continue

    const subj = subjByCode[item.subject] ?? cgByCode[item.subject]
    if (!subj) continue

    // Find end time from level slots
    const levelSlots = classSlotsPerLevel[sec.lg]?.[item.day] ?? []
    const slotInfo = levelSlots.find(sl => sl.start === item.start)
    if (!slotInfo) continue

    const color = colorMap[subj.subjectId] ?? '#6366f1'

    // Detect shared note
    let notes: string | null = null
    if ('gradeNames' in subj && Array.isArray(subj.gradeNames)) {
      notes = `Unión grados: ${(subj.gradeNames as string[]).join(' + ')}`
    }

    entries.push({
      section_id: sec.id,
      school_year_id: yearId,
      day_of_week: item.day,
      start_time: item.start,
      end_time: slotInfo.end,
      subject_catalog_id: subj.subjectId,
      teacher_id: subj.teacherId,
      color,
      notes: notes ?? (subj.teacherId ? null : 'Sin docente asignado')
    })
  }

  return entries
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = buildPrompt(body)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    })

    const raw = response.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(raw) as { schedule: AIScheduleEntry[]; warnings?: string[] }

    if (!parsed.schedule || !Array.isArray(parsed.schedule)) {
      return NextResponse.json({ error: 'Respuesta inválida de OpenAI', raw }, { status: 500 })
    }

    const entries = mapToEntries(parsed.schedule, body)

    return NextResponse.json({
      entries,
      warnings: parsed.warnings ?? [],
      totalPlaced: entries.length,
      tokensUsed: response.usage?.total_tokens ?? 0
    })

  } catch (e) {
    console.error('AI generate schedule error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
