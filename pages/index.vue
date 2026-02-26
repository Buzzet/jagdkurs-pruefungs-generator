<template>
  <main class="container">
    <h1>Jagdkurs Prüfungs Generator</h1>

    <section class="card">
      <div class="row">
        <button :class="{ active: mode === 'pdf' }" @click="mode = 'pdf'">Feature 1: PDF</button>
        <button :class="{ active: mode === 'mc' }" @click="switchToMc">Feature 2: MC-Simulation</button>
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

        <h3>{{ mcCurrent.FrageMC || mcCurrent.FrageFreitext || mcCurrent.Frage }}</h3>
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

        <p v-if="showFeedback" :class="isCurrentCorrect ? 'ok' : 'error'">
          {{
            isCurrentCorrect
              ? `Richtig ✅ (+${lastPointsAwarded} Punkt)`
              : `Falsch ❌ (+${lastPointsAwarded} Punkte) · Richtige Antwort(en): ${mcCurrent.correctAnswers.join(', ')}`
          }}
        </p>
      </div>

      <div v-else class="card-sub">
        <h3>Ergebnis</h3>
        <p><strong>{{ mcCorrectCount }} / {{ mcQuestions.length }}</strong> Fragen komplett richtig ({{ mcPercent }}%)</p>
        <p><strong>{{ mcPointsTotal }}</strong> / {{ mcQuestions.length }} Punkte</p>
        <button @click="resetMc">Neue Simulation</button>
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
const { public: { appVersion } } = useRuntimeConfig()

const mode = ref<'pdf' | 'mc'>('pdf')

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

const toMcQuestion = (q: Question): McQuestion => {
  const alternatives = (q.AlternativeAntworten || []).filter(Boolean)
  const trueOptions = [q.Antwort]

  // Use up to 2 alternative true answers when available (Mehrfachantworten)
  const extraTrue = shuffle(alternatives).slice(0, Math.min(2, alternatives.length))
  trueOptions.push(...extraTrue)

  const wrongPool = [q.FalscheAntwort1, q.FalscheAntwort2, q.FalscheAntwort3].filter(Boolean)
  const options = shuffle([...trueOptions, ...wrongPool]).slice(0, 4)

  // Ensure at least one wrong option remains in set if possible
  if (trueOptions.length === 4 && wrongPool.length > 0) {
    options[3] = wrongPool[0]
  }

  const dedupOptions = Array.from(new Set(options))
  while (dedupOptions.length < 4) {
    const fallback = shuffle(wrongPool)[0] || q.FalscheAntwort1
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
  isCurrentCorrect.value = sameSet(selectedOptions.value, mcCurrent.value.correctAnswers)
  lastPointsAwarded.value = isCurrentCorrect.value ? 1 : 0

  if (isCurrentCorrect.value) mcCorrectCount.value += 1
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
.muted { color: #555; }
.small { font-size: .9rem; }
.version { margin-top: 2rem; color: #555; font-size: .9rem; text-align: center; }
</style>
