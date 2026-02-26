import express from 'express'
import nodemailer from 'nodemailer'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 8080

const log = (...args) => {
  console.log(new Date().toISOString(), ...args)
}

app.use((req, _res, next) => {
  log('[REQ]', req.method, req.path)
  next()
})

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

app.post('/report-question', async (req, res) => {
  const payload = req.body || {}
  const webhook = process.env.REPORT_WEBHOOK_URL

  log('[REPORT] payload', {
    mode: payload?.mode,
    subject: payload?.subject,
    hasQuestion: Boolean(payload?.question),
    reasonLen: (payload?.reason || '').length,
  })

  const reportText = `⚠️ Jagdkurs Frage gemeldet\nFach: ${payload.subject || '-'}\nModus: ${payload.mode || '-'}\nFrage: ${payload.question || '-'}\nAntwort: ${payload.answer || '-'}\nAlternativen: ${(payload.alternatives || []).join(', ') || '-'}\nGrund: ${payload.reason || '-'}\nZeit: ${payload.createdAt || new Date().toISOString()}`

  let webhookSent = false
  let webhookError = ''
  log('[REPORT] channels', {
    webhookConfigured: Boolean(webhook),
    reportEmailToConfigured: Boolean(process.env.REPORT_EMAIL_TO),
    smtpUserConfigured: Boolean(process.env.SMTP_USER),
    smtpPassConfigured: Boolean(process.env.SMTP_PASS),
  })
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reportText, payload }),
      })
      webhookSent = true
      log('[REPORT] webhook sent')
    }
    catch (e) {
      webhookError = e?.message || 'webhook send failed'
      log('[REPORT] webhook error', webhookError)
    }
  }

  const reportEmailTo = process.env.REPORT_EMAIL_TO
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  let emailSent = false
  let emailError = ''

  if (reportEmailTo && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      })

      await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: reportEmailTo,
        subject: `Jagdkurs Meldung: ${payload.subject || 'Unbekanntes Fach'}`,
        text: reportText,
      })
      emailSent = true
      log('[REPORT] email sent', { to: reportEmailTo })
    }
    catch (e) {
      emailError = e?.message || 'email send failed'
      log('[REPORT] email error', emailError)
    }
  }

  log('[REPORT] result', { emailSent, webhookSent })
  return res.json({ ok: true, emailSent, emailError, webhookSent, webhookError })
})

app.use((err, _req, res, _next) => {
  log('[ERROR]', err?.message || err)
  res.status(500).json({ error: 'internal_error' })
})

app.post('/ai-evaluate', async (req, res) => {
  const { question, modelAnswer, userAnswer, alternativeAnswers = [] } = req.body || {}
  log('[AI] payload', {
    hasQuestion: Boolean(question),
    hasModelAnswer: Boolean(modelAnswer),
    userAnswerLen: (userAnswer || '').length,
    alternativeCount: Array.isArray(alternativeAnswers) ? alternativeAnswers.length : 0,
  })

  if (!question || !modelAnswer) {
    log('[AI] 400 missing required fields')
    return res.status(400).json({ error: 'question and modelAnswer are required' })
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY
  if (!apiKey) {
    log('[AI] no OPENAI key configured -> heuristic mode')
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
      log('[AI] OpenAI non-OK', response.status)
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
      log('[AI] parse fallback used', { rawText: rawText.slice(0, 180) })
      return res.json({
        score: heuristicScore(modelAnswer, userAnswer),
        reason: rawText,
        mode: 'heuristic-fallback-parse',
      })
    }

    log('[AI] llm score', { score: normalized })
    return res.json({ score: normalized, reason: parsed?.reason || '', mode: 'llm' })
  }
  catch (e) {
    log('[AI] exception -> heuristic fallback', e?.message || e)
    return res.json({ score: heuristicScore(modelAnswer, userAnswer), mode: 'heuristic-fallback' })
  }
})

app.post('/ai-followup', async (req, res) => {
  const { question, modelAnswer, userAnswer, followupQuestion } = req.body || {}
  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY

  if (!followupQuestion || !question || !modelAnswer) {
    return res.status(400).json({ error: 'question, modelAnswer and followupQuestion are required' })
  }

  if (!apiKey) {
    return res.json({
      answer: 'Hinweis: Rückfrage-Antworten sind nicht garantiert korrekt. Bitte orientiere dich primär an der Musterlösung.',
      mode: 'fallback',
    })
  }

  const prompt = `Du bist Tutor für Jagdkurs-Prüfungsfragen.
Wichtig: Deine Antwort kann unvollständig sein. Formuliere daher vorsichtig.

Originalfrage: ${question}
Musterlösung: ${modelAnswer}
Nutzerantwort: ${userAnswer || '-'}
Rückfrage des Nutzers: ${followupQuestion}

Antworte kurz (max 4 Sätze), sachlich und auf Deutsch.
Beginne zwingend mit: "Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt."`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', input: prompt }),
    })

    if (!response.ok) {
      return res.json({
        answer: 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Ich kann die Rückfrage gerade nicht sicher beantworten.',
        mode: 'fallback',
      })
    }

    const data = await response.json()
    const textFromOutput = (data?.output || [])
      .flatMap(o => o?.content || [])
      .map(c => c?.text || '')
      .join('\n')
      .trim()
    const answer = (data?.output_text || textFromOutput || '').trim()

    return res.json({
      answer: answer || 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Keine Antwort erhalten.',
      mode: 'llm',
    })
  }
  catch (e) {
    log('[AI-FOLLOWUP] exception', e?.message || e)
    return res.json({
      answer: 'Hinweis: Die folgende Antwort ist nicht mit Sicherheit korrekt. Rückfrage konnte gerade nicht beantwortet werden.',
      mode: 'fallback',
    })
  }
})

app.listen(PORT, () => {
  console.log(`jagdkurs-ai-api listening on :${PORT}`)
})
