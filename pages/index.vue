<template>
  <main class="app" :class="{ dark: darkMode, light: !darkMode }">
    <div class="bg-orb orb-1" />
    <div class="bg-orb orb-2" />

    <section class="hero liquid">
      <div>
        <h1>Jagdkurs Trainer</h1>
        <p class="muted">Prüfungsfragen als PDF, Multiple Choice und KI-Freitext</p>
      </div>
      <div class="hero-actions">
        <div class="pill">{{ appVersion }}</div>
      </div>
    </section>

    <section v-if="mode === 'pdf'" class="card liquid">
      <h2>PDF</h2>
      <label for="subject">Prüfungsfach</label>
      <select id="subject" v-model="selectedSubject">
        <option disabled value="">Bitte wählen</option>
        <option v-for="subject in subjects" :key="subject" :value="subject">{{ subject }}</option>
      </select>

      <div class="row">
        <button :disabled="!selectedSubject" @click="generateSet">20 Fragen erzeugen</button>
        <button :disabled="!generated" @click="downloadExamPdf(generated!)">PDF ohne Lösungen</button>
        <button :disabled="!generated" @click="downloadSolutionsPdf(generated!)">PDF mit Lösungen</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="generated" class="ok">{{ generated.questions.length }} Fragen für „{{ generated.subject }}“ erzeugt.</p>
    </section>

    <section v-if="mode === 'mc'" class="card liquid">
      <h2>Multiple Choice</h2>

      <div v-if="!mcStarted">
        <div class="row">
          <button :class="{ active: mcType === 'subject' }" @click="mcType = 'subject'">Ein Fach</button>
          <button :class="{ active: mcType === 'full' }" @click="mcType = 'full'">Gesamtprüfung</button>
        </div>

        <div v-if="mcType === 'subject'" class="spacer">
          <label for="mc-subject">Fach wählen</label>
          <select id="mc-subject" v-model="mcSelectedSubject">
            <option disabled value="">Bitte wählen</option>
            <option v-for="subject in subjects" :key="subject" :value="subject">{{ subject }}</option>
          </select>
        </div>

        <div class="row spacer">
          <button :disabled="mcType === 'subject' && !mcSelectedSubject" @click="startMc">Simulation starten</button>
        </div>
      </div>

      <div v-else-if="mcCurrent">
        <p class="muted">
          {{ mcType === 'subject' ? mcCurrent.Pruefungsfach : `${mcCurrent.Pruefungsfach} · Gesamtprüfung` }}
          — Frage {{ mcIndex + 1 }} / {{ mcQuestions.length }}
        </p>

        <div class="question-head">
          <h3>{{ mcCurrent.FrageFreitext || mcCurrent.Frage }}</h3>
          <button class="report-inline" @click="openReportModal">⚠︎ Frage melden</button>
        </div>
        <p class="muted small">Mehrfachantworten möglich ({{ mcCurrent.correctAnswers.length }} richtige Antwort{{ mcCurrent.correctAnswers.length === 1 ? '' : 'en' }}).</p>

        <div class="options">
          <label v-for="opt in mcCurrent.options" :key="opt" class="option liquid-soft">
            <input v-model="selectedOptions" type="checkbox" :value="opt" :disabled="showFeedback">
            <span>{{ opt }}</span>
          </label>
        </div>

        <div class="row">
          <button :disabled="selectedOptions.length === 0 || showFeedback" @click="confirmAnswer">Antwort bestätigen</button>
          <button v-if="showFeedback" @click="nextQuestion">{{ mcIndex + 1 === mcQuestions.length ? 'Auswertung' : 'Nächste Frage' }}</button>
        </div>

        <p v-if="showFeedback" :class="isCurrentCorrect ? 'ok' : (lastPointsAwarded > 0 ? 'partial' : 'error')">
          {{
            isCurrentCorrect
              ? `Genau richtig ✅ (+${lastPointsAwarded} Punkte)`
              : (lastPointsAwarded > 0
                ? `Teilweise richtig 🟡 (+${lastPointsAwarded} Punkt) · Richtige Antwort(en): ${mcCurrent.correctAnswers.join(', ')}`
                : `Falsch ❌ (+0 Punkte) · Richtige Antwort(en): ${mcCurrent.correctAnswers.join(', ')}`)
          }}
        </p>
      </div>

      <div v-else class="card-sub liquid-soft">
        <h3>Ergebnis</h3>
        <p><strong>{{ mcCorrectCount }} / {{ mcQuestions.length }}</strong> Fragen komplett richtig ({{ mcPercent }}%)</p>
        <p><strong>{{ mcPointsTotal }}</strong> / {{ mcMaxPoints }} Punkte ({{ mcPointsPercent }}%)</p>
        <p><strong>Note:</strong> {{ mcGrade }}</p>
        <button @click="resetMc">Neue Simulation</button>
      </div>
    </section>

    <section v-if="mode === 'ai'" class="card liquid">
      <h2>KI-Modus</h2>

      <div v-if="!aiStarted">
        <label for="ai-subject">Prüfungsfach</label>
        <select id="ai-subject" v-model="aiSelectedSubject">
          <option disabled value="">Bitte wählen</option>
          <option v-for="subject in subjects" :key="subject" :value="subject">{{ subject }}</option>
        </select>
        <div class="row spacer">
          <button :disabled="!aiSelectedSubject" @click="startAi">KI-Session starten (20 Fragen)</button>
        </div>
      </div>

      <div v-else-if="aiCurrent">
        <p class="muted">{{ aiCurrent.Pruefungsfach }} — Frage {{ aiIndex + 1 }} / {{ aiQuestions.length }}</p>
        <div class="question-head">
          <h3>{{ aiCurrent.FrageFreitext || aiCurrent.Frage }}</h3>
          <button class="report-inline" @click="openReportModal">⚠︎ Frage melden</button>
        </div>
        <textarea v-model="aiUserAnswer" rows="6" class="freeform" placeholder="Deine Antwort im Prüfungsstil..." />

        <div class="row">
          <button :disabled="!aiUserAnswer.trim() || aiLoading || aiAnswered" @click="submitAiAnswer">Antwort bewerten</button>
          <button v-if="aiAnswered" @click="nextAiQuestion">{{ aiIndex + 1 === aiQuestions.length ? 'Auswertung' : 'Nächste Frage' }}</button>
        </div>

        <p v-if="aiAnswered" class="ok">Punkte für diese Frage: {{ aiLastScore }} / 2</p>
        <p v-if="aiReason" class="muted">Hinweis: {{ aiReason }}</p>

        <div v-if="aiAnswered && aiLastScore < 2" class="solution-box liquid-soft">
          <strong>Musterlösung:</strong>
          <p>{{ aiCurrent.Antwort }}</p>
          <p v-if="(aiCurrent.AlternativeAntworten || []).length" class="muted small">
            Weitere akzeptierte Antworten: {{ aiCurrent.AlternativeAntworten?.join(', ') }}
          </p>

          <div class="followup-box">
            <p class="warn">Hinweis: Antworten auf Rückfragen können fehlerhaft sein und sind nicht garantiert korrekt.</p>
            <textarea
              v-model="aiFollowupQuestion"
              rows="3"
              class="freeform"
              placeholder="Rückfrage zur Musterlösung stellen..."
            />
            <div class="row">
              <button :disabled="!aiFollowupQuestion.trim() || aiFollowupLoading" @click="submitAiFollowup">Rückfrage senden</button>
            </div>
            <p v-if="aiFollowupAnswer" class="muted">{{ aiFollowupAnswer }}</p>
          </div>
        </div>
      </div>

      <div v-else class="card-sub liquid-soft">
        <h3>KI-Auswertung</h3>
        <p><strong>{{ aiPointsTotal }}</strong> / {{ aiMaxPoints }} Punkte ({{ aiPointsPercent }}%)</p>
        <p><strong>Note:</strong> {{ aiGrade }}</p>
        <button @click="resetAi">Neue KI-Session</button>
      </div>
    </section>

    <nav class="mode-bar liquid">
      <button :class="{ active: mode === 'pdf' }" @click="switchToPdf">PDF</button>
      <button :class="{ active: mode === 'mc' }" @click="switchToMc">Multiple Choice</button>
      <button :class="{ active: mode === 'ai' }" @click="switchToAi">KI-Modus</button>
      <button class="ghost" @click="toggleTheme">{{ darkMode ? '☀️' : '🌙' }}</button>
    </nav>

    <div v-if="reportOpen" class="modal-backdrop" @click.self="reportOpen = false">
      <div class="modal liquid">
        <h3>Frage melden</h3>
        <p class="muted">Soll diese Frage gemeldet werden, weil sie unklar oder falsch ist?</p>
        <p class="quote">{{ reportQuestion?.FrageFreitext || reportQuestion?.Frage }}</p>
        <textarea v-model="reportReason" rows="4" class="freeform" placeholder="Warum ist die Frage aus deiner Sicht falsch/irreführend?" />
        <div class="row">
          <button :disabled="reportSending" @click="reportOpen = false">Abbrechen</button>
          <button :disabled="reportSending" @click="submitReport">Melden</button>
        </div>
        <p v-if="reportMessage" class="ok">{{ reportMessage }}</p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { GeneratedSet, Question } from '~/types/questions'

type McType = 'subject' | 'full'
interface McQuestion extends Question {
  options: string[]
  correctAnswers: string[]
}

const { subjects, generate, generateMcSubject, generateMcFull } = useQuestionGenerator()
const { downloadExamPdf, downloadSolutionsPdf } = usePdfExport()
const { public: { appVersion, aiApiBase } } = useRuntimeConfig()

const darkMode = ref(true)
const toggleTheme = () => {
  darkMode.value = !darkMode.value
}

const mode = ref<'pdf' | 'mc' | 'ai'>('pdf')

const selectedSubject = ref('')
const generated = ref<GeneratedSet | null>(null)
const error = ref('')

const generateSet = () => {
  error.value = ''
  generated.value = null
  try {
    generated.value = generate(selectedSubject.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Unbekannter Fehler bei der Generierung.'
  }
}

const mcType = ref<McType>('subject')
const mcSelectedSubject = ref('')
const mcStarted = ref(false)
const mcQuestions = ref<McQuestion[]>([])
const mcIndex = ref(0)
const mcCorrectCount = ref(0)
const mcPointsTotal = ref(0)
const selectedOptions = ref<string[]>([])
const showFeedback = ref(false)
const isCurrentCorrect = ref(false)
const lastPointsAwarded = ref(0)

const mcCurrent = computed(() => mcQuestions.value[mcIndex.value] || null)
const mcPercent = computed(() => {
  if (!mcQuestions.value.length) return 0
  return Math.round((mcCorrectCount.value / mcQuestions.value.length) * 100)
})
const mcMaxPoints = computed(() => mcQuestions.value.length * 2)
const mcPointsPercent = computed(() => {
  if (!mcMaxPoints.value) return 0
  return Math.round((mcPointsTotal.value / mcMaxPoints.value) * 100)
})
const mcGrade = computed(() => {
  const p = mcPointsPercent.value
  if (p >= 90) return '1'
  if (p >= 80) return '2'
  if (p >= 67) return '3'
  if (p >= 50) return '4'
  if (p >= 30) return '5'
  return '6'
})

const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const sameSet = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const as = new Set(a)
  return b.every(x => as.has(x))
}

const isMultiCandidate = (q: Question) => {
  const text = (q.FrageFreitext || q.Frage || '').toLowerCase()
  return /(nennen sie|welche .* gehören|welche .* gehört|zu welcher gruppe)/i.test(text)
}

const toMcQuestion = (q: Question): McQuestion => {
  const alternatives = (q.AlternativeAntworten || []).filter(Boolean)
  const trueOptions = [q.Antwort]

  if (isMultiCandidate(q) && alternatives.length > 0) {
    const extraTrue = shuffle(alternatives).slice(0, Math.min(2, alternatives.length))
    trueOptions.push(...extraTrue)
  }

  const wrongPool = [q.FalscheAntwort1, q.FalscheAntwort2, q.FalscheAntwort3].filter(Boolean)
  const options = shuffle([...trueOptions, ...wrongPool]).slice(0, 4)

  if (trueOptions.length >= 4 && wrongPool.length > 0) {
    options[3] = wrongPool[0]
  }

  const dedupOptions = Array.from(new Set(options))
  while (dedupOptions.length < 4) {
    const fallback = shuffle([...wrongPool, ...alternatives])[0] || q.FalscheAntwort1
    if (!dedupOptions.includes(fallback)) dedupOptions.push(fallback)
    else break
  }

  const correctAnswers = dedupOptions.filter(opt => trueOptions.includes(opt))

  return {
    ...q,
    options: shuffle(dedupOptions).slice(0, 4),
    correctAnswers,
  }
}

const startMc = () => {
  const sets = mcType.value === 'subject'
    ? [generateMcSubject(mcSelectedSubject.value)]
    : generateMcFull()

  mcQuestions.value = sets.flatMap(set => set.questions.map(toMcQuestion))
  mcStarted.value = true
  mcIndex.value = 0
  mcCorrectCount.value = 0
  mcPointsTotal.value = 0
  selectedOptions.value = []
  showFeedback.value = false
  isCurrentCorrect.value = false
  lastPointsAwarded.value = 0
}

const confirmAnswer = () => {
  if (!mcCurrent.value) return

  const selected = new Set(selectedOptions.value)
  const hasAnyCorrectSelected = mcCurrent.value.correctAnswers.some(a => selected.has(a))

  isCurrentCorrect.value = sameSet(selectedOptions.value, mcCurrent.value.correctAnswers)

  if (isCurrentCorrect.value) {
    lastPointsAwarded.value = 2
    mcCorrectCount.value += 1
  }
  else if (hasAnyCorrectSelected) {
    lastPointsAwarded.value = 1
  }
  else {
    lastPointsAwarded.value = 0
  }

  mcPointsTotal.value += lastPointsAwarded.value
  showFeedback.value = true
}

const nextQuestion = () => {
  if (mcIndex.value + 1 >= mcQuestions.value.length) {
    mcIndex.value = mcQuestions.value.length
    return
  }
  mcIndex.value += 1
  selectedOptions.value = []
  showFeedback.value = false
  isCurrentCorrect.value = false
  lastPointsAwarded.value = 0
}

const resetMc = () => {
  mcStarted.value = false
  mcQuestions.value = []
  mcIndex.value = 0
  mcCorrectCount.value = 0
  mcPointsTotal.value = 0
  selectedOptions.value = []
  showFeedback.value = false
  lastPointsAwarded.value = 0
}

const switchToMc = () => {
  mode.value = 'mc'
  resetMc()
}

const aiSelectedSubject = ref('')
const aiStarted = ref(false)
const aiQuestions = ref<Question[]>([])
const aiIndex = ref(0)
const aiUserAnswer = ref('')
const aiPointsTotal = ref(0)
const aiLastScore = ref(0)
const aiReason = ref('')
const aiLoading = ref(false)
const aiAnswered = ref(false)
const aiFollowupQuestion = ref('')
const aiFollowupAnswer = ref('')
const aiFollowupLoading = ref(false)

const aiCurrent = computed(() => aiQuestions.value[aiIndex.value] || null)
const aiMaxPoints = computed(() => aiQuestions.value.length * 2)
const aiPointsPercent = computed(() => {
  if (!aiMaxPoints.value) return 0
  return Math.round((aiPointsTotal.value / aiMaxPoints.value) * 100)
})
const aiGrade = computed(() => {
  const p = aiPointsPercent.value
  if (p >= 90) return '1'
  if (p >= 80) return '2'
  if (p >= 67) return '3'
  if (p >= 50) return '4'
  if (p >= 30) return '5'
  return '6'
})

const isAiEligible = (q: Question) => {
  const t = (q.FrageFreitext || q.Frage || '').toLowerCase()
  return !/(wann gilt folgendes|was ist über .+ korrekt\?|welche antwort ist fachlich richtig\?)/i.test(t)
}

const startAi = () => {
  const set = generateMcSubject(aiSelectedSubject.value)
  const preferred = set.questions.filter(isAiEligible)
  const fallback = set.questions.filter(q => !preferred.includes(q))

  // Always keep exactly 20 questions per run.
  aiQuestions.value = [...preferred, ...fallback].slice(0, 20)

  aiStarted.value = true
  aiIndex.value = 0
  aiUserAnswer.value = ''
  aiPointsTotal.value = 0
  aiLastScore.value = 0
  aiReason.value = ''
  aiAnswered.value = false
  aiFollowupQuestion.value = ''
  aiFollowupAnswer.value = ''
}

const localHeuristicScore = (modelAnswer: string, userAnswer: string) => {
  const m = modelAnswer.toLowerCase().trim()
  const u = userAnswer.toLowerCase().trim()
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

const submitAiAnswer = async () => {
  if (!aiCurrent.value || !aiUserAnswer.value.trim()) return
  aiLoading.value = true
  aiReason.value = ''

  try {
    const endpoint = aiApiBase ? `${aiApiBase.replace(/\/$/, '')}/ai-evaluate` : '/api/ai-evaluate'
    const result = await $fetch<{ score: number, reason?: string }>(endpoint, {
      method: 'POST',
      body: {
        question: aiCurrent.value.FrageFreitext || aiCurrent.value.Frage,
        modelAnswer: aiCurrent.value.Antwort,
        alternativeAnswers: aiCurrent.value.AlternativeAntworten || [],
        userAnswer: aiUserAnswer.value,
      },
    })

    aiLastScore.value = Math.max(0, Math.min(2, Number(result.score) || 0))
    aiPointsTotal.value += aiLastScore.value
    aiReason.value = result.reason || ''
    aiAnswered.value = true
  }
  catch {
    aiLastScore.value = localHeuristicScore(aiCurrent.value.Antwort, aiUserAnswer.value)
    aiPointsTotal.value += aiLastScore.value
    aiReason.value = 'API nicht erreichbar — lokale Heuristik verwendet.'
    aiAnswered.value = true
  }
  finally {
    aiLoading.value = false
  }
}

const submitAiFollowup = async () => {
  if (!aiCurrent.value || !aiFollowupQuestion.value.trim() || aiFollowupLoading.value) return
  aiFollowupLoading.value = true
  try {
    const endpoint = aiApiBase ? `${aiApiBase.replace(/\/$/, '')}/ai-followup` : '/api/ai-followup'
    const result = await $fetch<{ answer: string }>(endpoint, {
      method: 'POST',
      body: {
        question: aiCurrent.value.FrageFreitext || aiCurrent.value.Frage,
        modelAnswer: aiCurrent.value.Antwort,
        userAnswer: aiUserAnswer.value,
        followupQuestion: aiFollowupQuestion.value,
      },
    })
    aiFollowupAnswer.value = result.answer || 'Keine Antwort erhalten.'
  }
  catch {
    aiFollowupAnswer.value = 'Rückfrage konnte gerade nicht beantwortet werden.'
  }
  finally {
    aiFollowupLoading.value = false
  }
}

const nextAiQuestion = () => {
  if (aiIndex.value + 1 >= aiQuestions.value.length) {
    aiIndex.value = aiQuestions.value.length
    return
  }
  aiIndex.value += 1
  aiUserAnswer.value = ''
  aiLastScore.value = 0
  aiReason.value = ''
  aiAnswered.value = false
  aiFollowupQuestion.value = ''
  aiFollowupAnswer.value = ''
}

const resetAi = () => {
  aiStarted.value = false
  aiQuestions.value = []
  aiIndex.value = 0
  aiUserAnswer.value = ''
  aiPointsTotal.value = 0
  aiLastScore.value = 0
  aiReason.value = ''
  aiAnswered.value = false
  aiFollowupQuestion.value = ''
  aiFollowupAnswer.value = ''
}

const switchToAi = () => {
  mode.value = 'ai'
  resetAi()
}

const switchToPdf = () => {
  mode.value = 'pdf'
}

// Report flow
const reportOpen = ref(false)
const reportReason = ref('')
const reportSending = ref(false)
const reportMessage = ref('')

const reportQuestion = computed<Question | null>(() => {
  if (mode.value === 'mc' && mcCurrent.value) return mcCurrent.value
  if (mode.value === 'ai' && aiCurrent.value) return aiCurrent.value
  if (mode.value === 'pdf' && generated.value?.questions?.length) return generated.value.questions[0]
  return null
})

const openReportModal = () => {
  if (!reportQuestion.value) return
  reportOpen.value = true
  reportReason.value = ''
  reportMessage.value = ''
}

const submitReport = async () => {
  if (!reportQuestion.value) return
  reportSending.value = true
  reportMessage.value = ''
  try {
    const endpoint = aiApiBase ? `${aiApiBase.replace(/\/$/, '')}/report-question` : '/api/report-question'
    await $fetch(endpoint, {
      method: 'POST',
      body: {
        mode: mode.value,
        subject: reportQuestion.value.Pruefungsfach,
        question: reportQuestion.value.FrageFreitext || reportQuestion.value.Frage,
        answer: reportQuestion.value.Antwort,
        alternatives: reportQuestion.value.AlternativeAntworten || [],
        reason: reportReason.value,
        createdAt: new Date().toISOString(),
      },
    })
    reportMessage.value = 'Danke! Die Meldung wurde gesendet und wird geprüft.'
  }
  catch {
    reportMessage.value = 'Meldung konnte gerade nicht gesendet werden.'
  }
  finally {
    reportSending.value = false
  }
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  padding: 1.2rem 1rem 6.8rem;
  max-width: 980px;
  margin: 0 auto;
  position: relative;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
}
.dark { background: #090b10; color: #eef2ff; }
.light { background: #f2f5fb; color: #0f172a; }

.bg-orb {
  position: fixed;
  border-radius: 9999px;
  filter: blur(64px);
  opacity: .25;
  z-index: 0;
}
.orb-1 { width: 320px; height: 320px; left: -90px; top: -60px; background: #5b8cff; }
.orb-2 { width: 360px; height: 360px; right: -120px; bottom: 120px; background: #7f5bff; }

.hero, .card, .mode-bar { position: relative; z-index: 1; }
.hero {
  margin-top: .5rem;
  padding: 1rem 1.1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero h1 { margin: 0; font-size: 1.6rem; }
.hero p { margin: .25rem 0 0; }
.hero-actions { display: flex; gap: .5rem; align-items: center; }
.pill {
  border: 1px solid rgba(255,255,255,.2);
  padding: .35rem .7rem;
  border-radius: 999px;
  font-size: .85rem;
}
.question-head {
  display: flex;
  gap: .8rem;
  align-items: flex-start;
  justify-content: space-between;
}
.question-head h3 { margin: 0; }
.report-inline {
  white-space: nowrap;
  font-size: .88rem;
  padding: .45rem .65rem;
  border-radius: 10px;
  border: 1px solid rgba(255,180,120,.45);
  background: rgba(255,150,80,.12);
}

.liquid {
  border: 1px solid rgba(255,255,255,.06);
  background: rgba(255,255,255,.10);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  box-shadow: 0 12px 34px rgba(0,0,0,.22);
  border-radius: 18px;
}
.light .liquid {
  border-color: rgba(15,23,42,.12);
  background: rgba(255,255,255,.8);
  box-shadow: 0 10px 24px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.75);
}
.liquid-soft {
  border: 1px solid rgba(255,255,255,.06);
  background: rgba(255,255,255,.06);
  border-radius: 14px;
}
.light .liquid-soft { border-color: rgba(15,23,42,.12); background: rgba(255,255,255,.7); }
.light .report-inline {
  border-color: rgba(180,95,20,.35);
  background: rgba(255,188,120,.35);
}

.card { margin-top: 1rem; padding: 1rem 1.1rem; }
.card h2 { margin: 0 0 .75rem; }
.card-sub { padding: .9rem 1rem; margin-top: .8rem; }

label { display: block; margin-bottom: .45rem; font-weight: 600; }
select, .freeform {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.2);
  background: rgba(0,0,0,.25);
  color: inherit;
  padding: .68rem .78rem;
  font: inherit;
}
.light select, .light .freeform {
  border-color: rgba(15,23,42,.14);
  background: rgba(255,255,255,.95);
}

.row { margin-top: .9rem; display: flex; gap: .6rem; flex-wrap: wrap; }
.spacer { margin-top: .95rem; }
button {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.12);
  color: inherit;
  padding: .58rem .9rem;
  cursor: pointer;
}
button.active { background: rgba(91,140,255,.65); border-color: rgba(91,140,255,.9); }
button:disabled { opacity: .5; cursor: not-allowed; }
button.ghost { min-width: 2.6rem; }

.options { display: grid; gap: .6rem; margin: .95rem 0; }
.option { padding: .65rem .72rem; display: flex; gap: .6rem; align-items: center; }

.error { color: #ff8d8d; margin-top: .8rem; }
.ok { color: #8cf2b7; margin-top: .8rem; }
.partial { color: #ffd27a; margin-top: .8rem; }
.muted { opacity: .8; }
.small { font-size: .9rem; }

.mode-bar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: .8rem;
  width: min(960px, calc(100% - 1rem));
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: .5rem;
  padding: .55rem;
  z-index: 20;
}
.mode-bar button { margin: 0; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: grid;
  place-items: center;
  z-index: 40;
}
.modal {
  width: min(640px, calc(100% - 1.2rem));
  padding: 1rem;
}
.quote {
  padding: .7rem;
  border-radius: 12px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.15);
  margin: .6rem 0;
}
.solution-box {
  margin-top: .8rem;
  padding: .7rem .8rem;
  border-radius: 12px;
}
.solution-box p { margin: .35rem 0 0; }
.followup-box { margin-top: .8rem; }
.warn {
  color: #ffd27a;
  font-size: .9rem;
  margin: 0 0 .5rem;
}
.light .quote { background: rgba(255,255,255,.9); border-color: rgba(15,23,42,.12); }
</style>
