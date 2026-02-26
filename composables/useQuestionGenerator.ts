import type { GeneratedSet, Question } from '~/types/questions'
import allQuestions from '~/data/questions.final.tagged.json'

const WILDKRANKHEITEN_HUNDE = 'Wildkrankheiten & Hunde'

const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const pickN = <T>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n)

export const useQuestionGenerator = () => {
  const questions = allQuestions as Question[]

  const subjects = computed(() => {
    const base = new Set(questions.map(q => q.Pruefungsfach))
    return [WILDKRANKHEITEN_HUNDE, ...Array.from(base).sort()]
  })

  const generate = (subject: string): GeneratedSet => {
    if (subject === WILDKRANKHEITEN_HUNDE) {
      const hunde = questions.filter(q => q.Tags?.includes('hundewesen'))
      const krankheiten = questions.filter(q =>
        q.Tags?.includes('wildkrankheiten') ||
        /krank|seuche|parasiten|räude|staupe|trichinen/i.test(q.Frage + ' ' + q.Antwort)
      )

      if (hunde.length < 10 || krankheiten.length < 10) {
        throw new Error(`Nicht genug Fragen für Wildkrankheiten & Hunde (hunde=${hunde.length}, krankheiten=${krankheiten.length}).`)
      }

      return {
        subject,
        createdAt: new Date().toISOString(),
        questions: shuffle([...pickN(hunde, 10), ...pickN(krankheiten, 10)]),
      }
    }

    const pool = questions.filter(q => q.Pruefungsfach === subject)
    if (pool.length < 20) {
      throw new Error(`Nicht genug Fragen im Fach ${subject}. Vorhanden: ${pool.length}`)
    }

    return {
      subject,
      createdAt: new Date().toISOString(),
      questions: pickN(pool, 20),
    }
  }

  return {
    subjects,
    generate,
  }
}
