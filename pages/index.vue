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
        <option v-for="subject in subjects" :key="subject" :value="subject">
          {{ subject }}
        </option>
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

        <div class="options">
          <label v-for="opt in mcOptions" :key="opt.value" class="option">
            <input v-model="selectedOption" type="radio" :value="opt.value" :disabled="showFeedback">
            <span>{{ opt.label }}</span>
          </label>
        </div>

        <div class="row">
          <button :disabled="!selectedOption || showFeedback" @click="confirmAnswer">Antwort bestätigen</button>
          <button v-if="showFeedback" @click="nextQuestion">{{ mcIndex + 1 === mcQuestions.length ? 'Auswertung' : 'Nächste Frage' }}</button>
        </div>

        <p v-if="showFeedback" :class="isCurrentCorrect ? 'ok' : 'error'">
          {{ isCurrentCorrect ? 'Richtig ✅' : `Falsch ❌ (richtig: ${mcCurrent.Antwort})` }}
        </p>
      </div>

      <div v-else class="card-sub">
        <h3>Ergebnis</h3>
        <p><strong>{{ mcCorrectCount }} / {{ mcQuestions.length }}</strong> richtig ({{ mcPercent }}%)</p>
        <button @click="resetMc">Neue Simulation</button>
      </div>
    </section>

    <footer class="version">Version {{ appVersion }}</footer>
  </main>
</template>

<script setup lang="ts">
import type { GeneratedSet, Question } from '~/types/questions'

type McType = 'subject' | 'full'

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
const mcQuestions = ref<Question[]>([])
const mcIndex = ref(0)
const mcCorrectCount = ref(0)
const selectedOption = ref('')
const showFeedback = ref(false)
const isCurrentCorrect = ref(false)

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

const mcOptions = computed(() => {
  if (!mcCurrent.value) return []
  return shuffle([
    { label: mcCurrent.value.Antwort, value: mcCurrent.value.Antwort },
    { label: mcCurrent.value.FalscheAntwort1, value: mcCurrent.value.FalscheAntwort1 },
    { label: mcCurrent.value.FalscheAntwort2, value: mcCurrent.value.FalscheAntwort2 },
    { label: mcCurrent.value.FalscheAntwort3, value: mcCurrent.value.FalscheAntwort3 },
  ])
})

const startMc = () => {
  const sets = mcType.value === 'subject'
    ? [generateMcSubject(mcSelectedSubject.value)]
    : generateMcFull()

  mcQuestions.value = sets.flatMap(set => set.questions)
  mcStarted.value = true
  mcIndex.value = 0
  mcCorrectCount.value = 0
  selectedOption.value = ''
  showFeedback.value = false
  isCurrentCorrect.value = false
}

const confirmAnswer = () => {
  if (!mcCurrent.value) return
  isCurrentCorrect.value = selectedOption.value === mcCurrent.value.Antwort
  if (isCurrentCorrect.value) mcCorrectCount.value += 1
  showFeedback.value = true
}

const nextQuestion = () => {
  if (mcIndex.value + 1 >= mcQuestions.value.length) {
    // done
    mcIndex.value = mcQuestions.value.length
    return
  }
  mcIndex.value += 1
  selectedOption.value = ''
  showFeedback.value = false
  isCurrentCorrect.value = false
}

const resetMc = () => {
  mcStarted.value = false
  mcQuestions.value = []
  mcIndex.value = 0
  mcCorrectCount.value = 0
  selectedOption.value = ''
  showFeedback.value = false
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
.version { margin-top: 2rem; color: #555; font-size: .9rem; text-align: center; }
</style>
