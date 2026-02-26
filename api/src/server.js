import express from 'express'

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 8080

const heuristicScore = (modelAnswer, userAnswer) => {
  const m = (modelAnswer || '').toLowerCase().trim()
  const u = (userAnswer || '').toLowerCase().trim()
  if (!u) return 0
  if (u === m) return 2

  const tokens = m.split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 3)
  if (!tokens.length) return 0

  const hits = tokens.filter(t => u.includes(t)).length
  const ratio = hits / tokens.length
  if (ratio >= 0.75) return 2
  if (ratio >= 0.3) return 1
  return 0
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/ai-evaluate', async (req, res) => {
  const { question, modelAnswer, userAnswer, alternativeAnswers = [] } = req.body || {}
  if (!question || !modelAnswer) {
    return res.status(400).json({ error: 'question and modelAnswer are required' })
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY
  if (!apiKey) {
    return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic' })
  }

  const accepted = [modelAnswer, ...(alternativeAnswers || [])].filter(Boolean)
  const prompt = `Bewerte eine Jagdkurs-Prüfungsantwort.\n\nFrage: ${question}\nMusterantwort: ${modelAnswer}\nWeitere akzeptierte Antworten: ${accepted.join(', ')}\nNutzerantwort: ${userAnswer || ''}\n\nGib ausschließlich JSON zurück mit:\n{"score":0|1|2,"reason":"kurz"}\n\nRegeln:\n- 0 = falsch\n- 1 = teilweise richtig\n- 2 = Kernaussagen korrekt\n- Bei Aufzählungsfragen ("Nennen Sie...", "Was gehört alles..."):\n  - 2 nur, wenn ausschließlich korrekte Beispiele genannt sind\n  - 1, wenn Mischung aus korrekten und falschen Beispielen\n  - 0, wenn nur falsche Beispiele`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        input: prompt,
      }),
    })

    if (!response.ok) {
      return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic-fallback' })
    }

    const data = await response.json()

    const textFromOutput = (data?.output || [])
      .flatMap(o => o?.content || [])
      .map(c => c?.text || '')
      .join('\n')
      .trim()

    const rawText = (data?.output_text || textFromOutput || '').trim()

    let parsed = null
    if (rawText) {
      try {
        parsed = JSON.parse(rawText)
      }
      catch {
        const match = rawText.match(/\b([012])\b/)
        if (match) {
          parsed = { score: Number(match[1]), reason: rawText }
        }
      }
    }

    const score = Number(parsed?.score)
    const normalized = score === 2 ? 2 : score === 1 ? 1 : 0

    if (!parsed) {
      return res.json({
        score: heuristicScore(modelAnswer, userAnswer),
        reason: rawText,
        mode: 'heuristic-fallback-parse',
      })
    }

    return res.json({ score: normalized, reason: parsed?.reason || '', mode: 'llm' })
  }
  catch {
    return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic-fallback' })
  }
})

app.listen(PORT, () => {
  console.log(`jagdkurs-ai-api listening on :${PORT}`)
})
