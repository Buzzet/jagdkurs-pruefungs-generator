export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: true,
  nitro: {
    preset: 'static'
  },
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/'
  },
  runtimeConfig: {
    public: {
      appVersion: process.env.NUXT_APP_VERSION || 'v1.0.0',
      aiApiBase: process.env.NUXT_PUBLIC_AI_API_BASE || 'https://buzzet.de:8080'
    }
  },
  compatibilityDate: '2026-02-26'
})
