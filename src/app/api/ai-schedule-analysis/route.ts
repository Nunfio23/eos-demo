import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const { sections, teachers } = await req.json() as {
      sections: Array<{
        sectionId: string
        sectionName: string
        levelGroup: string
        subjects: Array<{ name: string; weeklyHours: number; teacher: string }>
      }>
      teachers: Array<{
        teacherName: string
        totalHours: number
        sectionCount: number
        sectionNames: string[]
      }>
    }

    const prompt = `Eres experto en planificación curricular de El Salvador. Analiza esta configuración de horarios para la Escuela Cristiana E-OS (escuela privada) y devuelve recomendaciones estructuradas.

CONFIGURACIÓN ACTUAL:
${JSON.stringify({ sections, teachers }, null, 2)}

PROGRAMAS DE ESTUDIO MINED 2026 — HORAS SEMANALES SUGERIDAS (la escuela privada puede ajustar):

PARVULARIA (P4, P5 — bloques 30min; P6+1° — bloques 40-45min):
  Enfoque INTEGRADO por ámbitos: Relaciones Sociales, Cuerpo y Movimiento, Lenguaje y Comunicación, Expresión Estética, Exploración del Entorno.
  NO se trabaja por materias aisladas con horas fijas.

I CICLO (2° Grado): Comunicación 6h, Matemática 5h, Ciudadanía y Valores 3h, Artes 2h, Desarrollo Corporal variable. Total mínimo: ~16h fijas.
I CICLO (3° Grado): Comunicación 5h, Matemática 5h, Ciudadanía y Valores 4h, Artes 2h, Desarrollo Corporal variable. Total mínimo: ~16h fijas.

II CICLO (4°, 5°, 6° Grado): Comunicación y Literatura 5h, Matemática 5h, Ciudadanía y Valores 4h, Artes 3h, Ciencia y Tecnología variable, Desarrollo Corporal variable. Total mínimo: ~17h fijas.

III CICLO (7°, 8°, 9° Grado): Lengua y Literatura 5h, Matemática 5h, Ciudadanía y Valores 5h, Educación Física variable, Ciencia y Tecnología variable. Total mínimo: ~15h fijas.

BACHILLERATO 1er Año (10°): Matemática Precálculo 6h, Lengua y Literatura 5h, Ciudadanía y Valores 5h, Finanzas y Economía 4h, Proyecto de Vida y Carrera 2h, Educación Física variable. Total mínimo: ~22h fijas.
BACHILLERATO 2do Año (11°): Matemática Precálculo 6h, Lengua y Literatura 5h, Ciudadanía y Valores 5h, Finanzas y Economía 2h, Proyecto de Vida y Carrera 2h, Educación Física variable. Total mínimo: ~20h fijas.

MATERIAS EXTRACURRICULARES/COMPLEMENTARIAS (escuela privada — candidatas para unir secciones):
  Inglés (3h sugeridas), Informática/Computación (2h), Educación Cristiana/Biblia (2h), Música/Coro (1h), Teatro (1h), Educación Física (cuando aplica), Artes.

CARGA DOCENTE — UMBRALES:
  OK: hasta 25h/semana | Advertencia: 26-32h | Sobrecargado: más de 32h/semana.

REGLA PARA UNIONES: Solo recomienda unir si el MISMO docente enseña la materia en ambas secciones.
Usa los sectionId exactos del input en las recomendaciones de unión.
Prioriza uniones en materias extracurriculares/complementarias (Inglés, Computación, Artes, Música, Educación Física).

Responde SOLO con JSON válido (sin markdown), estructura exacta:
{
  "gradeSummaries": [
    {
      "gradeName": "string (ej: 5° Grado)",
      "levelGroup": "string",
      "subjects": [
        { "name": "string", "configured": number, "recommended": number, "status": "ok|low|high|missing" }
      ],
      "notes": "string (máx 100 chars)"
    }
  ],
  "mergeRecommendations": [
    {
      "sectionAId": "string exacto del input",
      "sectionBId": "string exacto del input",
      "sectionAName": "string",
      "sectionBName": "string",
      "subject": "string (ej: Inglés)",
      "reason": "string breve",
      "isExtracurricular": boolean
    }
  ],
  "teacherWarnings": [
    { "teacherName": "string", "issue": "string breve" }
  ]
}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(content)
    return NextResponse.json(parsed)
  } catch (e) {
    console.error('AI schedule analysis error:', e)
    return NextResponse.json({ error: 'Error en análisis IA' }, { status: 500 })
  }
}
