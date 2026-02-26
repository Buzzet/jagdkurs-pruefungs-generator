import { jsPDF } from 'jspdf'
import type { GeneratedSet } from '~/types/questions'

const line = (doc: jsPDF, text: string, x: number, y: number, maxWidth = 180) => {
  const lines = doc.splitTextToSize(text, maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * 6
}

const ensurePage = (doc: jsPDF, y: number, needed = 30) => {
  if (y + needed > 285) {
    doc.addPage()
    return 20
  }
  return y
}

const isMcStyleQuestion = (text: string) =>
  /^(Wie lautet die korrekte Antwort\?|Welche Aussage ist richtig\?|Welche Antwort ist richtig\?|Was trifft zu\?|Bitte wählen Sie)/i.test(text.trim())

export const usePdfExport = () => {
  const downloadExamPdf = (set: GeneratedSet) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'normal')

    let y = 16
    doc.setFontSize(14)
    doc.text(`Jagdkurs - ${set.subject}`, 15, y)
    y += 8
    doc.setFontSize(10)
    doc.text('Name: ______________________   Datum: ______________________', 15, y)
    y += 8

    set.questions.forEach((q, idx) => {
      const questionText = q.FrageFreitext || q.Frage
      const isMc = isMcStyleQuestion(questionText)

      y = ensurePage(doc, y, isMc ? 40 : 45)
      doc.setFontSize(11)
      y = line(doc, `${idx + 1}) ${questionText}`, 15, y)

      doc.setFontSize(9)
      if (isMc) {
        const options = [q.Antwort, q.FalscheAntwort1, q.FalscheAntwort2, q.FalscheAntwort3]
        for (const [optIndex, opt] of options.entries()) {
          y = ensurePage(doc, y, 8)
          y = line(doc, `${String.fromCharCode(65 + optIndex)}) ${opt}`, 18, y)
        }
      }
      else {
        for (let i = 0; i < 4; i++) {
          y = ensurePage(doc, y, 8)
          doc.line(18, y + 2, 192, y + 2)
          y += 7
        }
      }
      y += 2
    })

    doc.save(`pruefungsbogen-${set.subject}.pdf`)
  }

  const downloadSolutionsPdf = (set: GeneratedSet) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'normal')

    let y = 16
    doc.setFontSize(14)
    doc.text(`Jagdkurs - Lösungen - ${set.subject}`, 15, y)
    y += 8

    doc.setFontSize(10)
    set.questions.forEach((q, idx) => {
      y = ensurePage(doc, y, 22)
      y = line(doc, `${idx + 1}) ${q.FrageFreitext || q.Frage}`, 15, y)
      doc.setFont('helvetica', 'bold')
      y = line(doc, `Lösung: ${q.Antwort}`, 18, y)
      doc.setFont('helvetica', 'normal')
      y += 2
    })

    doc.save(`loesungen-${set.subject}.pdf`)
  }

  return {
    downloadExamPdf,
    downloadSolutionsPdf,
  }
}
