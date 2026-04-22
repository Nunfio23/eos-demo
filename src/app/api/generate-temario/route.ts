import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

interface QuestionInput {
  question_text: string
  question_type: string
  points: number
  options?: { option_text: string; is_correct: boolean }[]
}

interface GuionInput {
  title: string
  date: string
  objective: string
  intro?: string
  development: string
  closure?: string
  resources?: string
  evaluation?: string
}

export async function POST(req: NextRequest) {
  try {
    // Validar variables de entorno primero
    if (!process.env.OPENAI_API_KEY) {
      console.error('[generate-temario] OPENAI_API_KEY no configurada')
      return NextResponse.json(
        { error: 'OPENAI_API_KEY no configurada en el servidor. Contacta al administrador.' },
        { status: 500 }
      )
    }

    const { exam_title, questions, guiones } = await req.json() as {
      exam_title: string
      questions: QuestionInput[]
      guiones: GuionInput[]
    }

    // Validar entrada
    if (!exam_title) {
      return NextResponse.json(
        { error: 'exam_title es requerido' },
        { status: 400 }
      )
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'El examen no tiene preguntas.' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const questionsText = questions.map((q, i) => {
      const opts = q.options && q.options.length > 0
        ? '\n   Opciones: ' + q.options.map(o => `"${o.option_text}"${o.is_correct ? ' ✓' : ''}`).join(' | ')
        : ''
      return `P${i + 1} [${q.question_type}] (${q.points}pts): ${q.question_text}${opts}`
    }).join('\n')

    const guionesText = guiones.length > 0
      ? guiones.map((g, i) => `
GUIÓN ${i + 1}: ${g.title} | Fecha: ${g.date}
  Objetivo: ${g.objective}
  Introducción: ${g.intro || '—'}
  Desarrollo: ${g.development}
  Cierre: ${g.closure || '—'}
  Evaluación/Notas del docente: ${g.evaluation || '—'}
`).join('\n')
      : '(Sin guiones — analiza las preguntas del examen para inferir el contenido)'

    const prompt = `Eres un experto en educación para El Salvador. Genera un TEMARIO DE ESTUDIO para estudiantes basado en el examen y los guiones de clase del docente.

EXAMEN: "${exam_title}"

PREGUNTAS (${questions.length}):
${questionsText}

GUIONES DE CLASE:
${guionesText}

INSTRUCCIONES:
1. Analiza cada pregunta y clasifícala en:
   - "memorizacion": dato directo, definición, nombre, fecha
   - "comprension": entender y explicar un concepto
   - "analisis": causa-efecto, comparación, relaciones entre ideas
   - "reflexion_personal": opinión, valoración personal, aplicación a situaciones nuevas

2. Agrupa los temas y etiqueta cada uno con el nivel cognitivo predominante.

3. Crea "tipos_de_preguntas" explicando CLARAMENTE al estudiante qué tipos hay y cómo prepararse — incluye reflexión personal si aplica, ya que los maestros no solo preguntan contenido textual.

Responde ÚNICAMENTE con este JSON (sin texto extra, sin markdown):
{
  "titulo": "Temario — ${exam_title}",
  "introduccion": "2-3 oraciones motivando al estudiante y explicando qué tipo de preguntas tiene el examen",
  "temas": [
    {
      "numero": 1,
      "tema": "Nombre del tema",
      "nivel_cognitivo": "memorizacion",
      "subtemas": ["Subtema específico", "Otro subtema"],
      "como_estudiar": "Instrucción específica según el nivel cognitivo de este tema"
    }
  ],
  "tipos_de_preguntas": [
    {
      "tipo": "Memorización / Contenido textual",
      "icono": "📖",
      "cantidad": 5,
      "descripcion": "Preguntas de dato directo sobre definiciones, nombres o conceptos del libro",
      "como_prepararse": "Repasa directamente el libro de texto y tus apuntes de clase"
    }
  ],
  "conceptos_clave": ["Término importante"],
  "habilidades": ["Habilidad que será evaluada"],
  "consejos": ["Consejo de estudio específico para este examen"]
}

Iconos para tipos: 📖 memorización, 🔍 comprensión, ⚡ análisis, 💭 reflexión personal.
Solo incluye tipos que REALMENTE aparezcan en el examen.
Si hay reflexión personal, explica que NO hay respuesta única y que deben argumentar.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    })

    const text = completion.choices[0]?.message?.content ?? ''
    
    if (!text) {
      throw new Error('OpenAI no retornó contenido en la respuesta')
    }

    let result
    try {
      result = JSON.parse(text)
    } catch (parseError: any) {
      console.error('[generate-temario] Error en JSON.parse:', parseError.message)
      console.error('[generate-temario] Contenido recibido:', text.substring(0, 200))
      throw new Error('Error al procesar la respuesta de OpenAI: ' + parseError.message)
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[generate-temario] Error:', {
      message: e.message,
      code: e.code,
      type: e.constructor.name,
      stack: e.stack?.split('\n')[0],
    })
    return NextResponse.json({ error: e.message ?? 'Error al generar el temario.' }, { status: 500 })
  }
}
