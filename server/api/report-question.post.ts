import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const payload = await readBody(event)
  const webhook = process.env.REPORT_WEBHOOK_URL

  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `⚠️ Jagdkurs Frage gemeldet\nFach: ${payload?.subject || '-'}\nModus: ${payload?.mode || '-'}\nFrage: ${payload?.question || '-'}\nAntwort: ${payload?.answer || '-'}\nGrund: ${payload?.reason || '-'}\nZeit: ${payload?.createdAt || new Date().toISOString()}`,
          payload,
        }),
      })
    }
    catch {
      // best effort
    }
  }

  return { ok: true }
})
