# Jagdkurs Prüfungs Generator

Nuxt app to generate hunting-course exam sheets from local JSON data.

## Implemented (Feature 1)
- Subject selection
- Random generation of 20 questions per subject
- PDF download: exam sheet **without solutions** (extra writing space)
- PDF download: matching sheet **with solutions**
- Regenerate anytime for a new subject/set
- Special rule prepared: `Wildkrankheiten & Hunde` = 10 Hunde + 10 Wildkrankheiten (requires matching tagged questions)

## Run locally
```bash
npm install
npm run dev
```

## Build for GitHub Pages
```bash
npm run generate
```

The GitHub Action in `.github/workflows/deploy.yml` deploys automatically on push to `main`.

## Monorepo structure
- `./` = Nuxt web app (GitHub Pages)
- `./api` = AI evaluation API (Docker deploy to your server)

## AI API deploy (server)
Workflow: `.github/workflows/deploy-api.yml`

Required repository secrets:
- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `API_DEPLOY_PATH` (e.g. `/opt/jagdkurs-pruefungs-generator/api`)

On the server, set `OPENAI_API_KEY` (or `CHATGPT_API_KEY`) in `${API_DEPLOY_PATH}/.env`.

Set web app API base URL at build/deploy time:
- `NUXT_PUBLIC_AI_API_BASE=https://<your-api-domain-or-ip>:8080`

## WhatsApp notification after each deploy
Configured in workflow with two options:

1. **Webhook mode (preferred)**
   - Set repo secret: `WHATSAPP_WEBHOOK_URL`
   - Endpoint must accept `POST` JSON body like `{ "message": "..." }`

2. **CallMeBot fallback**
   - Set repo secrets:
     - `WHATSAPP_PHONE` (international format, e.g. `+4917...`)
     - `WHATSAPP_APIKEY`

If `WHATSAPP_WEBHOOK_URL` is set, webhook mode is used.
Otherwise it falls back to CallMeBot when phone+apikey are present.
