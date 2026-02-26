import { createError, defineEventHandler, readBody } from 'h3'

type ReqBody = {
  question: string
  modelAnswer: string
  userAnswer?: string
  followupQuestion: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReqBody>(event)
  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY

  if (!body?.question || !body?.modelAnswer || !body?.followupQuestion) {
    throw createError({ statusCode: 400, statusMessage: 'question, modelAnswer and followupQuestion are required' })
  }

  if (!apiKey) {
    return {
      answer: 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Bitte orientiere dich primär an der Musterlösung.',
      mode: 'fallback',
    }
  }

  const prompt = `Du bist Tutor für Jagdkurs-Prüfungsfragen.
Wichtig: Deine Antwort kann unvollständig sein. Formuliere daher vorsichtig.

Originalfrage: ${body.question}
Musterlösung: ${body.modelAnswer}
Nutzerantwort: ${body.userAnswer || '-'}
Rückfrage des Nutzers: ${body.followupQuestion}

Antworte kurz (max 4 Sätze), sachlich und auf Deutsch.
Beginne zwingend mit: "Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt."`

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-5-mini', input: prompt }),
  })

  if (!response.ok) {
    return {
      answer: 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Ich kann die Rückfrage gerade nicht sicher beantworten.',
      mode: 'fallback',
    }
  }

  const data: any = await response.json()
  const textFromOutput = (data?.output || [])
    .flatMap((o: any) => o?.content || [])
    .map((c: any) => c?.text || '')
    .join('\n')
    .trim()

  const answer = (data?.output_text || textFromOutput || '').trim()

  return {
    answer: answer || 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Keine Antwort erhalten.',
    mode: 'llm',
  }
})
