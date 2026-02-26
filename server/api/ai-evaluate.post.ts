import { defineEventHandler, readBody, createError } from 'h3'

type ReqBody = {
  question: string
  modelAnswer: string
  userAnswer: string
}

const heuristicScore = (modelAnswer: string, userAnswer: string) => {
  const m = modelAnswer.toLowerCase().trim()
  const u = userAnswer.toLowerCase().trim()
  if (!u) return 0
  if (u === m) return 2

  const tokens = m
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 3)
  if (!tokens.length) return 0

  const hits = tokens.filter(t => u.includes(t)).length
  const ratio = hits / tokens.length
  if (ratio >= 0.75) return 2
  if (ratio >= 0.3) return 1
  return 0
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReqBody>(event)
  if (!body?.question || !body?.modelAnswer) {
    throw createError({ statusCode: 400, statusMessage: 'question and modelAnswer are required' })
  }

  const userAnswer = body.userAnswer || ''
  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY

  if (!apiKey) {
    return {
      score: heuristicScore(body.modelAnswer, userAnswer),
      mode: 'heuristic',
    }
  }

  const prompt = `Bewerte eine Jagdkurs-Prüfungsantwort.

Frage: ${body.question}
Musterantwort: ${body.modelAnswer}
Nutzerantwort: ${userAnswer}

Gib ausschließlich JSON zurück mit:
{"score":0|1|2,"reason":"kurz"}

Regeln:
- 0 = falsch
- 1 = teilweise richtig
- 2 = Kernaussagen korrekt`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: prompt,
      text: { format: { type: 'json_object' } },
    }),
  })

  if (!response.ok) {
    return {
      score: heuristicScore(body.modelAnswer, userAnswer),
      mode: 'heuristic-fallback',
    }
  }

  const data: any = await response.json()
  const raw = data?.output?.[0]?.content?.[0]?.text || '{}'
  let parsed: any = {}
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    parsed = {}
  }

  const score = Number(parsed?.score)
  const normalized = score === 2 ? 2 : score === 1 ? 1 : 0

  return {
    score: normalized,
    reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
    mode: 'llm',
  }
})
