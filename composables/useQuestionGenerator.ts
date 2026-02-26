import type { GeneratedSet, Question } from '~/types/questions'
import allQuestions from '~/data/questions.final.tagged.json'

const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const normalizeQuestion = (q: Question): string => {
  const raw = (q.FrageFreitext || q.Frage || '')
    .normalize('NFKC')
    .toLowerCase()
    // remove common MC wrappers/prefixes to avoid duplicate stems in one run
    .replace(/^(wie lautet die korrekte antwort\?|welche aussage ist richtig\?|welche antwort ist richtig\?|was trifft zu\?|bitte wählen sie[^:]*:?\s*)/i, '')
    // unify quote variants and punctuation noise
    .replace(/[„“”\"'`´]/g, '')
    .replace(/[?!.,;:()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return raw
}

const uniqueByQuestion = (arr: Question[]): Question[] => {
  const seen = new Set<string>()
  const out: Question[] = []
  for (const q of arr) {
    const key = normalizeQuestion(q)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
  }
  return out
}

const isMcStyleQuestion = (q: Question): boolean => {
  const text = (q.FrageFreitext || q.Frage || '').trim()
  return /^(Wie lautet die korrekte Antwort\?|Welche Aussage ist richtig\?|Welche Antwort ist richtig\?|Was trifft zu\?|Bitte wählen Sie)/i.test(text)
}

const pickWithMcCap = (arr: Question[], total = 20, mcCap = 5): Question[] => {
  const mc = shuffle(arr.filter(isMcStyleQuestion))
  const open = shuffle(arr.filter(q => !isMcStyleQuestion(q)))

  const pickedMc = mc.slice(0, Math.min(mcCap, total))
  const needOpen = total - pickedMc.length
  const pickedOpen = open.slice(0, needOpen)

  const combined = [...pickedMc, ...pickedOpen]

  if (combined.length < total) {
    const remainder = shuffle(arr.filter(q => !combined.includes(q))).slice(0, total - combined.length)
    combined.push(...remainder)
  }

  return shuffle(combined).slice(0, total)
}

export const useQuestionGenerator = () => {
  const questions = allQuestions as Question[]

  const subjects = computed(() => {
    const base = new Set(questions.map(q => q.Pruefungsfach))
    return Array.from(base).sort()
  })

  const generate = (subject: string): GeneratedSet => {
    const pool = uniqueByQuestion(questions.filter(q => q.Pruefungsfach === subject && q.PdfEligible !== false))
    if (pool.length < 20) {
      throw new Error(`Nicht genug Fragen im Fach ${subject}. Vorhanden: ${pool.length}`)
    }

    return {
      subject,
      createdAt: new Date().toISOString(),
      questions: pickWithMcCap(pool, 20, 5),
    }
  }

  const generateMcSubject = (subject: string): GeneratedSet => {
    const pool = uniqueByQuestion(questions.filter(q => q.Pruefungsfach === subject))
    if (pool.length < 20) {
      throw new Error(`Nicht genug MC-Fragen im Fach ${subject}. Vorhanden: ${pool.length}`)
    }

    const multiCandidates = shuffle(pool.filter(q => (q.AlternativeAntworten || []).length > 0)).slice(0, 5)
    const restPool = pool.filter(q => !multiCandidates.includes(q))
    const picked = [...multiCandidates, ...shuffle(restPool).slice(0, 20 - multiCandidates.length)]

    return {
      subject,
      createdAt: new Date().toISOString(),
      questions: shuffle(picked).slice(0, 20),
    }
  }

  const generateMcFull = (): GeneratedSet[] => {
    return subjects.value.map(subject => generateMcSubject(subject))
  }

  return {
    subjects,
    generate,
    generateMcSubject,
    generateMcFull,
  }
}
