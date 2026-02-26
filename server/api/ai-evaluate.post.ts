import { defineEventHandler, readBody, createError } from 'h3'

type ReqBody = {
  question: string
  modelAnswer: string
  alternativeAnswers?: string[]
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
  const accepted = [body.modelAnswer, ...(body.alternativeAnswers || [])].filter(Boolean)
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
Weitere akzeptierte Antworten: ${accepted.join(', ')}
Nutzerantwort: ${userAnswer}

Gib ausschließlich JSON zurück mit:
{"score":0|1|2,"reason":"kurz"}

Regeln:
- 0 = falsch
- 1 = teilweise richtig
- 2 = Kernaussagen korrekt
- Bei Aufzählungsfragen ("Nennen Sie...", "Was gehört alles...") gilt ausdrücklich:
  - Wenn die geforderten/korrekten Punkte enthalten sind, KEIN Punktabzug für zusätzliche Nennungen.
  - Zusätzliche Nennungen sind erlaubt, solange sie die korrekten Kernaussagen nicht widersprechen.
  - Nur klare fachliche Falschaussagen oder fehlende Kernaussagen führen zu Abzug.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: prompt,
    }),
  })

  if (!response.ok) {
    return {
      score: heuristicScore(body.modelAnswer, userAnswer),
      mode: 'heuristic-fallback',
    }
  }

  const data: any = await response.json()
  const textFromOutput = (data?.output || [])
    .flatMap((o: any) => o?.content || [])
    .map((c: any) => c?.text || '')
    .join('\n')
    .trim()

  const rawText = (data?.output_text || textFromOutput || '').trim()

  let parsed: any = null
  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    }
    catch {
      const match = rawText.match(/\b([012])\b/)
      if (match) parsed = { score: Number(match[1]), reason: rawText }
    }
  }

  if (!parsed) {
    return {
      score: heuristicScore(body.modelAnswer, userAnswer),
      reason: rawText,
      mode: 'heuristic-fallback-parse',
    }
  }

  const score = Number(parsed?.score)
  const normalized = score === 2 ? 2 : score === 1 ? 1 : 0

  return {
    score: normalized,
    reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
    mode: 'llm',
  }
})
