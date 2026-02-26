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
  const { question, modelAnswer, userAnswer } = req.body || {}
  if (!question || !modelAnswer) {
    return res.status(400).json({ error: 'question and modelAnswer are required' })
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY
  if (!apiKey) {
    return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic' })
  }

  const prompt = `Bewerte eine Jagdkurs-Prüfungsantwort.\n\nFrage: ${question}\nMusterantwort: ${modelAnswer}\nNutzerantwort: ${userAnswer || ''}\n\nGib ausschließlich JSON zurück mit:\n{"score":0|1|2,"reason":"kurz"}\n\nRegeln:\n- 0 = falsch\n- 1 = teilweise richtig\n- 2 = Kernaussagen korrekt`

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
        text: { format: { type: 'json_object' } },
      }),
    })

    if (!response.ok) {
      return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic-fallback' })
    }

    const data = await response.json()
    const raw = data?.output?.[0]?.content?.[0]?.text || '{}'
    let parsed = {}
    try {
      parsed = JSON.parse(raw)
    }
    catch {
      parsed = {}
    }

    const score = Number(parsed?.score)
    const normalized = score === 2 ? 2 : score === 1 ? 1 : 0
    return res.json({ score: normalized, reason: parsed?.reason || '', mode: 'llm' })
  }
  catch {
    return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic-fallback' })
  }
})

app.listen(PORT, () => {
  console.log(`jagdkurs-ai-api listening on :${PORT}`)
})
