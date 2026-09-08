// estudar – Sicherung: eine JSON-Datei mit Decks, Karten, Zuständen, Protokoll
// und Einstellungen. Reine Funktionen (kein IndexedDB, kein DOM), damit sie in
// Node testbar sind. Dateiverkehr (Teilen-Blatt, Dateiauswahl) steht in main.js.

export const BACKUP_SCHEMA = 'estudar-backup/1';

const pad = (n) => String(n).padStart(2, '0');

export function backupFileName(now = new Date()) {
  return `estudar-sicherung-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function buildBackup({ decks = [], cards = [], cardStates = [], reviews = [], settings = [], appVersion = '', now = new Date() }) {
  return {
    schema: BACKUP_SCHEMA,
    app: 'estudar',
    appVersion,
    exportedAt: now.toISOString(),
    counts: { decks: decks.length, cards: cards.length, cardStates: cardStates.length, reviews: reviews.length },
    decks, cards, cardStates, reviews, settings,
  };
}

/** Liest und prüft eine Sicherungsdatei. Wirft einen Error mit deutscher Meldung. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('Die Datei hat nicht den erwarteten Aufbau.');
  if (data.schema !== BACKUP_SCHEMA) throw new Error(`Unbekanntes Format „${data.schema ?? '?'}" – erwartet wird ${BACKUP_SCHEMA}.`);
  for (const key of ['decks', 'cards', 'cardStates', 'reviews', 'settings']) {
    if (!Array.isArray(data[key])) throw new Error(`In der Datei fehlt der Abschnitt „${key}".`);
  }
  const check = (rows, key, what) => {
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row[key] !== 'string' || !row[key]) throw new Error(`${what} in der Datei hat keine Kennung (${key}).`);
    }
  };
  check(data.decks, 'id', 'Ein Deck');
  check(data.cards, 'id', 'Eine Karte');
  check(data.cardStates, 'cardId', 'Ein Lernzustand');
  check(data.reviews, 'id', 'Ein Protokolleintrag');
  check(data.settings, 'key', 'Eine Einstellung');
  for (const c of data.cards) {
    if (typeof c.deckId !== 'string') throw new Error('Eine Karte in der Datei hat kein Deck.');
  }
  return data;
}

const byId = (rows, key) => new Map(rows.map((r) => [r[key], r]));
const newer = (a, b, field) => ((b?.[field] || '') > (a?.[field] || '') ? b : a);

/**
 * Vorschau: Was passiert beim Ersetzen bzw. Zusammenführen?
 * @param backup  geparste Datei
 * @param current aktueller Bestand (dumpAll)
 */
export function previewImport(backup, current) {
  const localCards = byId(current.cards, 'id');
  let newCards = 0, updatedCards = 0, unchangedCards = 0;
  for (const c of backup.cards) {
    const local = localCards.get(c.id);
    if (!local) newCards += 1;
    else if ((c.updatedAt || '') > (local.updatedAt || '')) updatedCards += 1;
    else unchangedCards += 1;
  }
  const fileIds = new Set(backup.cards.map((c) => c.id));
  const removedOnReplace = current.cards.filter((c) => !fileIds.has(c.id)).length;
  const localReviewIds = new Set(current.reviews.map((r) => r.id));
  const newReviews = backup.reviews.filter((r) => !localReviewIds.has(r.id)).length;
  return {
    file: { decks: backup.decks.length, cards: backup.cards.length, reviews: backup.reviews.length, exportedAt: backup.exportedAt || null },
    local: { decks: current.decks.length, cards: current.cards.length, reviews: current.reviews.length },
    merge: { newCards, updatedCards, unchangedCards, newReviews },
    replace: { removedCards: removedOnReplace, resultingCards: backup.cards.length, newReviews },
  };
}

/**
 * Berechnet, was beim Import geschrieben wird.
 * mode 'replace': Decks, Karten, Zustände, Einstellungen aus der Datei (clear=true).
 * mode 'merge':   Vereinigung nach Kennung, das jeweils Neuere gewinnt; Einstellungen bleiben lokal.
 * reviews enthält in beiden Fällen nur die Einträge, die lokal noch fehlen – das
 * Protokoll wird nie gelöscht oder überschrieben, nur ergänzt.
 * @returns {{ decks, cards, cardStates, reviews, settings, clear: boolean }}
 */
export function applyImport(backup, current, mode) {
  const localReviewIds = new Set(current.reviews.map((r) => r.id));
  const reviews = backup.reviews.filter((r) => !localReviewIds.has(r.id));
  if (mode === 'replace') {
    return {
      clear: true,
      decks: backup.decks,
      cards: backup.cards,
      cardStates: ensureStates(backup.cards, backup.cardStates),
      reviews,
      settings: backup.settings.filter((s) => s.key !== 'schemaVersion'),
    };
  }
  if (mode !== 'merge') throw new Error(`Unbekannter Importmodus: ${mode}`);
  const cards = mergeById(current.cards, backup.cards, (local, file) => newer(local, file, 'updatedAt') === file);
  const decks = mergeById(current.decks, backup.decks, (local, file) => newer(local, file, 'updatedAt') === file);
  const cardStates = mergeById(current.cardStates, backup.cardStates, (local, file) => stateIsNewer(file, local), 'cardId');
  return {
    clear: false,
    decks,
    cards,
    cardStates: ensureStates(cards, cardStates),
    reviews,
    settings: [],
  };
}

function stateIsNewer(file, local) {
  const f = file.last_review || '';
  const l = local.last_review || '';
  if (f !== l) return f > l;
  return (file.reps || 0) > (local.reps || 0);
}

/** Vereinigung zweier Listen nach Schlüssel; `fileWins(local, file)` entscheidet bei Doppeln. */
function mergeById(localRows, fileRows, fileWins, key = 'id') {
  const out = new Map(localRows.map((r) => [r[key], r]));
  for (const row of fileRows) {
    const local = out.get(row[key]);
    if (!local || fileWins(local, row)) out.set(row[key], row);
  }
  return [...out.values()];
}

/** Jede Karte braucht einen Zustand; fehlt er in der Datei, wird er als "neu, sofort fällig" ergänzt. */
function ensureStates(cards, states) {
  const ids = new Set(cards.map((c) => c.id));
  const have = new Set(states.map((s) => s.cardId));
  const out = states.filter((s) => ids.has(s.cardId)); // verwaiste Zustände (Karte gelöscht) fallen weg
  for (const c of cards) {
    if (!have.has(c.id)) {
      out.push({ cardId: c.id, due: c.createdAt || new Date(0).toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null });
    }
  }
  return out;
}
