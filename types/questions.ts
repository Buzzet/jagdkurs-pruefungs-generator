export interface Question {
  Frage: string
  FrageFreitext?: string
  FrageMC?: string
  Antwort: string
  FalscheAntwort1: string
  FalscheAntwort2: string
  FalscheAntwort3: string
  Pruefungsfach: string
  Difficulty?: 'easy' | 'medium' | 'hard'
  Tags?: string[]
}

export interface GeneratedSet {
  subject: string
  createdAt: string
  questions: Question[]
}
