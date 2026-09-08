// estudar – toleranter Antwortvergleich für Tastatureingaben.
//
// Akzente und Groß-/Kleinschreibung werden für das Urteil ignoriert; eine nur
// in den Akzenten falsche Antwort gilt als richtig. Die Abweichung wird aber
// markiert: marks[i].differs = true für jedes Zeichen der Lösung, das nicht
// exakt so getippt wurde.

const STRIP_MARKS = /[\u0300-\u036f]/g;

/** Kanonische Form: getrimmt, Leerraum zusammengefasst. */
export function canonical(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Vergleichsform: kanonisch, ohne Akzente, klein. */
export function normalizeAnswer(text) {
  return canonical(text).normalize('NFD').replace(STRIP_MARKS, '').toLowerCase();
}

function baseChar(ch) {
  return ch.normalize('NFD').replace(STRIP_MARKS, '').toLowerCase();
}

/**
 * @returns {{ verdict: 'exact'|'accents'|'wrong', correct: boolean, marks: {char: string, differs: boolean}[] }}
 * verdict: exact = Zeichen für Zeichen gleich · accents = nur Akzente/Groß-Klein
 * weichen ab (zählt als richtig) · wrong = falsch
 */
export function compareAnswer(typed, solution) {
  const t = canonical(typed);
  const s = canonical(solution);
  const tChars = Array.from(t);
  const sChars = Array.from(s);
  let verdict;
  if (t === s) verdict = 'exact';
  else if (normalizeAnswer(t) === normalizeAnswer(s)) verdict = 'accents';
  else verdict = 'wrong';

  const marks = sChars.map((char, i) => {
    if (verdict === 'exact') return { char, differs: false };
    const typedChar = tChars[i];
    if (verdict === 'accents') {
      // Gleiche Länge nach Kanonisierung; abweichend ist, was nicht exakt so getippt wurde.
      return { char, differs: typedChar !== char };
    }
    return { char, differs: typedChar === undefined || baseChar(typedChar) !== baseChar(char) };
  });
  return { verdict, correct: verdict !== 'wrong', marks };
}

/** Zeichen, die die Akzentleiste über der Tastatur anbietet. */
export const ACCENT_CHARS = Object.freeze(['á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç']);
