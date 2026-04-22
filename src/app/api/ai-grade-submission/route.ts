import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const {
      taskTitle,
      taskDescription,
      taskType,
      maxScore,
      submissionContent,
      submissionLink,
    } = await req.json() as {
      taskTitle: string
      taskDescription: string | null
      taskType: string
      maxScore: number
      submissionContent: string | null
      submissionLink: string | null
    }

    if (!submissionContent && !submissionLink) {
      return NextResponse.json({ error: 'Sin contenido para evaluar.' }, { status: 400 })
    }

    const content = [
      submissionContent ? `Respuesta escrita del estudiante:\n${submissionContent}` : null,
      submissionLink    ? `Enlace adjunto: ${submissionLink} (evalúa basándote en el contexto de la tarea)` : null,
    ].filter(Boolean).join('\n\n')

    const prompt = `Eres un evaluador pedagógico objetivo y justo para el sistema escolar de El Salvador (educación primaria y secundaria).

TAREA: "${taskTitle}"
TIPO: ${taskType}
CRITERIOS / DESCRIPCIÓN: ${taskDescription ?? 'No especificada — evalúa coherencia, completitud y comprensión según el tipo de tarea.'}
PUNTAJE MÁXIMO: ${maxScore} puntos

ENTREGA DEL ESTUDIANTE:
${content}

INSTRUCCIONES DE EVALUACIÓN:
- Sé objetivo: evalúa la calidad del contenido, no la extensión.
- Un estudiante puede faltar a clases y aun así entender el tema — evalúa solo lo que entrega.
- Si la respuesta demuestra comprensión sólida: puntaje alto (80–100% del máximo).
- Si es parcial o incompleta: puntaje medio (50–79%).
- Si es muy superficial o no responde: puntaje bajo (10–49%).
- Si no hay nada relevante: 0.
- Justifica brevemente (2–3 oraciones) tu puntuación.
- Da retroalimentación constructiva al estudiante.

Responde ÚNICAMENTE con este JSON (sin texto adicional, sin markdown):
{
  "score": [número decimal entre 0 y ${maxScore}],
  "justification": "[2-3 oraciones explicando el puntaje basado en criterios pedagógicos]",
  "feedback": "[Retroalimentación directa al estudiante: qué hizo bien, qué puede mejorar]"
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const result = JSON.parse(raw)

    // Clamp score to valid range
    if (typeof result.score === 'number') {
      result.score = Math.max(0, Math.min(maxScore, result.score))
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[ai-grade-submission] Error:', e)
    return NextResponse.json({ error: e.message ?? 'Error al calificar.' }, { status: 500 })
  }
}
