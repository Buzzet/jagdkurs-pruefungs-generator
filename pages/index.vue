<template>
  <main class="container">
    <h1>Jagdkurs Prüfungs Generator</h1>
    <p>Feature 1: PDF-Generierung im Fragerunden-/Prüfungsstil</p>

    <section class="card">
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
      <p v-if="generated" class="ok">
        {{ generated.questions.length }} Fragen für „{{ generated.subject }}“ erzeugt.
      </p>
    </section>

    <section v-if="generated" class="card">
      <h2>Vorschau</h2>
      <ol>
        <li v-for="q in generated.questions.slice(0, 5)" :key="q.Frage">{{ q.FrageFreitext || q.Frage }}</li>
      </ol>
      <small>Es werden nur die ersten 5 Fragen angezeigt.</small>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { GeneratedSet } from '~/types/questions'

const { subjects, generate } = useQuestionGenerator()
const { downloadExamPdf, downloadSolutionsPdf } = usePdfExport()

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
</script>

<style scoped>
.container { max-width: 980px; margin: 2rem auto; padding: 0 1rem; font-family: Inter, system-ui, sans-serif; }
.card { border: 1px solid #e6e6e6; border-radius: 10px; padding: 1rem; margin-top: 1rem; }
label { display: block; margin-bottom: .4rem; font-weight: 600; }
select { padding: .6rem; border-radius: 8px; min-width: 320px; border: 1px solid #ccc; }
.row { margin-top: 1rem; display: flex; gap: .6rem; flex-wrap: wrap; }
button { padding: .6rem .9rem; border-radius: 8px; border: 1px solid #333; background: #111; color: white; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.error { color: #b00020; margin-top: .8rem; }
.ok { color: #006400; margin-top: .8rem; }
</style>
