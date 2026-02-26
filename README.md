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
