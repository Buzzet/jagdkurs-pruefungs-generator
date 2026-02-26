<template>
  <main class="container">
    <h1>Jagdkurs Prüfungs Generator</h1>

    <section class="card">
      <div class="row">
        <button :class="{ active: mode === 'pdf' }" @click="mode = 'pdf'">Feature 1: PDF</button>
        <button :class="{ active: mode === 'mc' }" @click="switchToMc">Feature 2: MC-Simulation</button>
        <button :class="{ active: mode === 'ai' }" @click="switchToAi">Feature 3: KI-Modus</button>
      </div>
    </section>

    <section v-if="mode === 'pdf'" class="card">
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

    <section v-if="mode === 'mc'" class="card">
      <h2>MC-Simulation</h2>

      <div v-if="!mcStarted">
        <div class="row">
          <button :class="{ active: mcType === 'subject' }" @click="mcType = 'subject'">Ein Fach</button>
          <button :class="{ active: mcType === 'full' }" @click="mcType = 'full'">Gesamtprüfung (4 Fächer)</button>
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

        <h3>{{ mcCurrent.FrageFreitext || mcCurrent.Frage }}</h3>
        <p class="muted small">Mehrfachantworten möglich ({{ mcCurrent.correctAnswers.length }} richtige Antwort{{ mcCurrent.correctAnswers.length === 1 ? '' : 'en' }}).</p>

        <div class="options">
          <label v-for="opt in mcCurrent.options" :key="opt" class="option">
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

      <div v-else class="card-sub">
        <h3>Ergebnis</h3>
        <p><strong>{{ mcCorrectCount }} / {{ mcQuestions.length }}</strong> Fragen komplett richtig ({{ mcPercent }}%)</p>
        <p><strong>{{ mcPointsTotal }}</strong> / {{ mcMaxPoints }} Punkte ({{ mcPointsPercent }}%)</p>
        <p><strong>Note:</strong> {{ mcGrade }}</p>
        <button @click="resetMc">Neue Simulation</button>
      </div>
    </section>

    <section v-if="mode === 'ai'" class="card">
      <h2>KI-Modus (Freitextbewertung)</h2>

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
        <h3>{{ aiCurrent.FrageFreitext || aiCurrent.Frage }}</h3>
        <textarea v-model="aiUserAnswer" rows="6" class="freeform" placeholder="Deine Antwort im Prüfungsstil..."></textarea>

        <div class="row">
          <button :disabled="!aiUserAnswer.trim() || aiLoading || aiAnswered" @click="submitAiAnswer">Antwort bewerten</button>
          <button v-if="aiAnswered" @click="nextAiQuestion">{{ aiIndex + 1 === aiQuestions.length ? 'Auswertung' : 'Nächste Frage' }}</button>
        </div>

        <p v-if="aiAnswered" class="ok">Punkte für diese Frage: {{ aiLastScore }} / 2</p>
        <p v-if="aiReason" class="muted">Hinweis: {{ aiReason }}</p>
      </div>

      <div v-else class="card-sub">
        <h3>KI-Auswertung</h3>
        <p><strong>{{ aiPointsTotal }}</strong> / {{ aiMaxPoints }} Punkte ({{ aiPointsPercent }}%)</p>
        <p><strong>Note:</strong> {{ aiGrade }}</p>
        <button @click="resetAi">Neue KI-Session</button>
      </div>
    </section>

    <footer class="version">Version {{ appVersion }}</footer>
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

// Feature 2
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

// Feature 3 (AI free-text)
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

const startAi = () => {
  const set = generateMcSubject(aiSelectedSubject.value)
  aiQuestions.value = set.questions
  aiStarted.value = true
  aiIndex.value = 0
  aiUserAnswer.value = ''
  aiPointsTotal.value = 0
  aiLastScore.value = 0
  aiReason.value = ''
  aiAnswered.value = false
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
}

const switchToAi = () => {
  mode.value = 'ai'
  resetAi()
}
</script>

<style scoped>
.container { max-width: 980px; margin: 2rem auto; padding: 0 1rem; font-family: Inter, system-ui, sans-serif; }
.card { border: 1px solid #e6e6e6; border-radius: 10px; padding: 1rem; margin-top: 1rem; }
.card-sub { border: 1px solid #eee; border-radius: 10px; padding: 1rem; margin-top: .8rem; }
label { display: block; margin-bottom: .4rem; font-weight: 600; }
select { padding: .6rem; border-radius: 8px; min-width: 320px; border: 1px solid #ccc; }
.row { margin-top: 1rem; display: flex; gap: .6rem; flex-wrap: wrap; }
.spacer { margin-top: 1rem; }
button { padding: .6rem .9rem; border-radius: 8px; border: 1px solid #333; background: #111; color: white; cursor: pointer; }
button.active { background: #2f6fed; border-color: #2f6fed; }
button:disabled { opacity: .5; cursor: not-allowed; }
.options { display: grid; gap: .6rem; margin: 1rem 0; }
.option { border: 1px solid #ddd; border-radius: 8px; padding: .6rem; display: flex; gap: .6rem; align-items: center; font-weight: 500; }
.error { color: #b00020; margin-top: .8rem; }
.ok { color: #006400; margin-top: .8rem; }
.partial { color: #b26a00; margin-top: .8rem; }
.muted { color: #555; }
.small { font-size: .9rem; }
.freeform { width: 100%; margin-top: .8rem; border: 1px solid #ccc; border-radius: 8px; padding: .7rem; font: inherit; }
.version { margin-top: 2rem; color: #555; font-size: .9rem; text-align: center; }
</style>
