import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const EXAM_CONFIG = {
  mensual:   { count: 12, label: 'mensual',           span: 'las clases de este mes' },
  periodo:   { count: 22, label: 'del Período TESLA', span: 'el período TESLA cubierto' },
  trimestre: { count: 35, label: 'trimestral',        span: 'el trimestre completo' },
} as const

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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const { guiones, exam_type } = await req.json() as {
      guiones: GuionInput[]
      exam_type: keyof typeof EXAM_CONFIG
    }

    if (!guiones || guiones.length === 0) {
      return NextResponse.json({ error: 'No hay guiones de clase disponibles para el período seleccionado.' }, { status: 400 })
    }
    if (!exam_type || !EXAM_CONFIG[exam_type]) {
      return NextResponse.json({ error: 'Tipo de examen inválido.' }, { status: 400 })
    }

    const config = EXAM_CONFIG[exam_type]
    const mcCount   = Math.round(config.count * 0.6)
    const tfCount   = Math.round(config.count * 0.25)
    const openCount = config.count - mcCount - tfCount

    const guionesText = guiones.map((g, i) => `
### Guión ${i + 1}: ${g.title}
- Fecha: ${g.date}
- Objetivo: ${g.objective}
- Introducción: ${g.intro || '(no especificado)'}
- Desarrollo: ${g.development}
- Cierre: ${g.closure || '(no especificado)'}
- Recursos: ${g.resources || '(no especificado)'}
- Evaluación/Notas: ${g.evaluation || '(no especificado)'}
`).join('\n')

    const prompt = `Eres un experto en evaluación pedagógica para el sistema escolar de El Salvador. Crea un examen ${config.label} basado en los siguientes guiones de clase.

GUIONES DE CLASE (${guiones.length} guión(es) — cubre ${config.span}):
${guionesText}

REQUISITOS DEL EXAMEN:
- Total de preguntas: exactamente ${config.count}
- Opción múltiple (4 opciones A/B/C/D, 1 correcta): ${mcCount} preguntas
- Verdadero/Falso: ${tfCount} preguntas
- Respuesta abierta (2-4 oraciones): ${openCount} preguntas
- Los puntos de TODAS las preguntas deben sumar exactamente 100
- Redacción clara y apropiada para el nivel educativo salvadoreño

Responde ÚNICAMENTE con este JSON (sin texto extra, sin markdown):
{
  "title": "Examen ${config.label.charAt(0).toUpperCase() + config.label.slice(1)} — [tema principal]",
  "instructions": "Lee cada pregunta con atención y responde con base en lo estudiado en clase.",
  "questions": [
    {
      "question_text": "¿Cuál de las siguientes opciones describe correctamente...?",
      "question_type": "multiple_choice",
      "points": 8,
      "options": [
        { "option_text": "Primera opción", "is_correct": false },
        { "option_text": "Opción correcta", "is_correct": true },
        { "option_text": "Tercera opción", "is_correct": false },
        { "option_text": "Cuarta opción", "is_correct": false }
      ]
    },
    {
      "question_text": "¿Es verdad que...?",
      "question_type": "true_false",
      "points": 4,
      "options": [
        { "option_text": "Verdadero", "is_correct": true },
        { "option_text": "Falso", "is_correct": false }
      ]
    },
    {
      "question_text": "Explica con tus propias palabras...",
      "question_type": "open",
      "points": 10,
      "options": []
    }
  ]
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const result = JSON.parse(text)

    if (!result.questions || !Array.isArray(result.questions)) {
      throw new Error('La respuesta no contiene una lista de preguntas válida.')
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[generate-exam] Error:', e)
    return NextResponse.json({ error: e.message ?? 'Error al generar el examen.' }, { status: 500 })
  }
}
