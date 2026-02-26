# QUESTION_FORMAT.md

## Ziel
Fragen im Stil der vorhandenen **Fragerunden** und **alten Prüfungsfragen** erzeugen.

## Beobachteter Aufbau (Bestandsmaterial)

### 1) Fragerunden (WTK)
- Titelzeile, z. B. `13. Fragerunde Wildtierkunde ...`
- **20 nummerierte Fragen** (`1` bis `20`)
- Schwerpunkt: kurze, mündlich/schriftlich gut prüfbare Wissensfragen
- Überwiegend **offene Fragen** (Freitextantwort)
- Teilweise Unterfragen, z. B. `a) ... b) ...`
- Selten Multiple-Choice-ähnliche Formulierungen im Fragetext

### 2) Tests/Prüfungen
- Kopfbereich häufig mit:
  - `Name`
  - `Datum`
  - `Punkte`
  - `Note`
  - ggf. Fach-/Themenzeile
- Ebenfalls meist **20 Fragen**
- Gemischte Schwierigkeit (Grundwissen + Transfer)
- Häufig fallbezogene Formulierungen („Was tun Sie, wenn ...?“)
- In Lernversionen teils direkt mit Lösungen; in Prüfungsversion ohne Lösungen

## Standardformat für neue Fragen (ab jetzt)

### Prüfungsbogen (ohne Lösungen)
1. Kopfbereich: Name, Datum, Punkte, Note, Fach
2. Genau 20 Fragen
3. Nummerierung 1–20
4. Mischung:
   - 70–80% offene Wissensfragen
   - 20–30% fallbezogene/Anwendungsfragen
5. Optional max. 2 Fragen mit Unterpunkten (`a)`, `b)`, `c)`)
6. Keine unnötig langen Antwortoptionen; klar und präzise formulieren

### Lösungsschlüssel (separate Ansicht)
- Gleiche Nummerierung 1–20
- Pro Frage kurze Musterlösung (1–3 Zeilen)
- Bei Fallfragen stichpunktartige Kernpunkte

## Qualitätsregeln
- Keine Dubletten innerhalb eines 20er-Sets
- Fachbegriffe jagdlich korrekt und konsistent
- Keine Trickfragen ohne Lernwert
- Schwierigkeitsmix pro Set:
  - leicht: 30%
  - mittel: 50%
  - schwer: 20%

## JSON-Felder (für Generator)
Empfohlene Struktur pro Frage:
- `id`
- `topic` (z. B. `wildtierkunde`, `waffenkunde`, `jagdrecht`, `hunde_jagdbetrieb`)
- `question`
- `type` (`open`, `case`, `mc-single`, `mc-multi`)
- `difficulty` (`easy`, `medium`, `hard`)
- `answer_key` (Musterlösung)
- `tags` (z. B. `rehwild`, `brunft`, `waidgerechtes_handeln`)
