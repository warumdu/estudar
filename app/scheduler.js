// estudar – Terminierung über ts-fsrs (vendor/ts-fsrs, exakt gepinnt).
//
// Hier steht kein eigener Algorithmus, nur die Anbindung: gespeicherter Zustand
// ↔ ts-fsrs-Karte, Vorschau der vier Intervalle, Anwenden einer Bewertung und
// der Aufbau der Tagesliste (Tageslimit, Überfällige zuerst, Geschwisterkarten).
// Alle Funktionen sind rein (kein IndexedDB), damit sie in Node testbar sind.

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs/index.js';

export { Rating, State };

export const GRADES = Object.freeze([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);
export const GRADE_LABELS = Object.freeze({ [Rating.Again]: 'Nochmal', [Rating.Hard]: 'Schwer', [Rating.Good]: 'Gut', [Rating.Easy]: 'Leicht' });

const DAY_MS = 86_400_000;

/** Ein FSRS-Rechner für die aktuellen Einstellungen. */
export function makeScheduler(settings = {}) {
  const request_retention = clampRetention(settings.requestRetention);
  return fsrs(generatorParameters({ request_retention }));
}

export function clampRetention(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.9;
  return Math.min(0.99, Math.max(0.7, n));
}

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

/** ts-fsrs-Karte → gespeicherter Zustand (nur Klartextwerte, ISO-Zeiten). */
export function toStoredState(cardId, card) {
  return {
    cardId,
    due: iso(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? iso(card.last_review) : null,
  };
}

/** Gespeicherter Zustand → Eingabe für ts-fsrs. */
export function toFsrsCard(stored) {
  return {
    due: new Date(stored.due),
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps ?? 0,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  };
}

/** Zustand einer neuen Karte: sofort fällig. */
export function newState(cardId, now = new Date()) {
  return toStoredState(cardId, createEmptyCard(now));
}

/** Vorschau: für jede Bewertung Fälligkeit und Klartext-Intervall. */
export function previewGrades(scheduler, stored, now = new Date()) {
  const preview = scheduler.repeat(toFsrsCard(stored), now);
  const out = {};
  for (const g of GRADES) {
    const due = preview[g].card.due;
    out[g] = { due, text: intervalText(now, due), scheduledDays: preview[g].card.scheduled_days };
  }
  return out;
}

/**
 * Wendet eine Bewertung an. Liefert den neuen Zustand und den Protokolleintrag
 * (cardId, Zeitstempel, Bewertung, Intervall davor/danach in Tagen, Dauer in ms).
 */
export function applyGrade(scheduler, stored, grade, now = new Date(), durationMs = 0) {
  const { card, log } = scheduler.next(toFsrsCard(stored), now, grade);
  const ts = iso(now);
  const state = toStoredState(stored.cardId, card);
  const review = {
    id: `${stored.cardId}:${ts}`,
    cardId: stored.cardId,
    ts,
    rating: grade,
    state: log.state,                       // Zustand VOR der Bewertung (New/Learning/Review/Relearning)
    intervalBefore: log.scheduled_days,     // Intervall davor in Tagen
    intervalAfter: card.scheduled_days,     // Intervall danach in Tagen
    durationMs: Math.max(0, Math.round(durationMs)),
  };
  return { state, review };
}

/* ---- Zeit & Klartext ---- */

export function startOfDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(now = new Date()) {
  const d = startOfDay(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Fällig? Karten im Wiederholungszustand zählen tagesgenau (was heute noch fällig
 * wird, ist heute dran). Lern- und neue Karten zählen minutengenau.
 */
export function isDue(stored, now = new Date()) {
  const due = new Date(stored.due).getTime();
  if (stored.state === State.Review) return due < endOfDay(now).getTime();
  return due <= now.getTime();
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "in 10 Min.", "in 3 Std.", "in 2 Tagen", "in 3 Wochen", "in 4 Monaten", "in 1,5 Jahren" */
export function intervalText(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'jetzt';
  if (minutes < 60) return `in ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} Std.`;
  const days = Math.round(ms / DAY_MS);
  if (days < 7) return `in ${plural(days, 'Tag', 'Tagen')}`;
  if (days < 30) return `in ${plural(Math.round(days / 7), 'Woche', 'Wochen')}`;
  if (days < 365) return `in ${plural(Math.round(days / 30), 'Monat', 'Monaten')}`;
  const years = Math.round(days / 36.5) / 10;
  if (years === 1) return 'in 1 Jahr';
  return `in ${String(years).replace('.', ',')} Jahren`;
}

/** Nächste Fälligkeit als Satzteil: "heute um 21:15", "morgen", "in 3 Tagen", "am 14.10." */
export function nextDueText(due, now = new Date()) {
  const d = new Date(due);
  if (d.getTime() <= now.getTime()) return 'jetzt';
  if (d < endOfDay(now)) return `heute um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (days === 1) return 'morgen';
  if (days < 7) return `in ${days} Tagen`;
  return `am ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
}

/* ---- Tagesliste ---- */

/**
 * Baut die Reihenfolge für heute.
 *
 * - Nur Karten, die es gibt und die nicht pausiert sind.
 * - Zuerst Lernkarten (Learning/Relearning), dann Wiederholungen (Review) nach
 *   Fälligkeit – die am längsten überfälligen zuerst –, dann neue Karten.
 * - Das Tageslimit gilt für Wiederholungen: Was heute schon als Wiederholung
 *   bewertet wurde, zehrt vom Limit; der Rest bleibt fällig und kommt an den
 *   Folgetagen als Erstes dran.
 * - Geschwisterkarten (gleiche noteId) kommen nie am selben Tag: Wurde heute
 *   schon eine Karte der Note bewertet oder steht sie weiter vorn in der Liste,
 *   wird die andere zurückgestellt.
 *
 * @returns {{ queue: object[], dueTotal: number, backlog: number, deferredSiblings: number }}
 */
export function buildQueue({ cards, states, reviewsToday = [], settings = {}, now = new Date() }) {
  const limit = Math.max(0, Number(settings.dailyLimit ?? 40) | 0);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const reviewedToday = new Set();
  const reviewsCountedToday = new Set();
  const seenNotes = new Map(); // noteId → Karte, die die Note heute belegt
  for (const r of reviewsToday) {
    reviewedToday.add(r.cardId);
    if (r.state === State.Review) reviewsCountedToday.add(r.cardId);
    const card = cardById.get(r.cardId);
    if (card?.noteId && !seenNotes.has(card.noteId)) seenNotes.set(card.noteId, card.id);
  }

  const learning = [];
  const review = [];
  const fresh = [];
  for (const s of states) {
    const card = cardById.get(s.cardId);
    if (!card || card.suspended || !isDue(s, now)) continue;
    const entry = { card, state: s };
    if (s.state === State.Review) review.push(entry);
    else if (s.state === State.New) fresh.push(entry);
    else learning.push(entry);
  }
  const byDue = (a, b) => a.state.due.localeCompare(b.state.due) || a.card.id.localeCompare(b.card.id);
  learning.sort(byDue);
  review.sort(byDue);
  fresh.sort((a, b) => (a.card.createdAt || '').localeCompare(b.card.createdAt || '') || a.card.id.localeCompare(b.card.id));

  let budget = Math.max(0, limit - reviewsCountedToday.size);
  const queue = [];
  let backlog = 0;
  let deferredSiblings = 0;
  const take = (entries, limited) => {
    for (const e of entries) {
      const note = e.card.noteId;
      // Geschwister zurückstellen – aber eine Karte ist nicht ihr eigenes Geschwister
      // (Lernschritt derselben Karte, der heute erneut fällig wird).
      if (note && seenNotes.has(note) && seenNotes.get(note) !== e.card.id) { deferredSiblings += 1; continue; }
      if (limited) {
        if (budget <= 0) { backlog += 1; continue; }
        budget -= 1;
      }
      if (note && !seenNotes.has(note)) seenNotes.set(note, e.card.id);
      queue.push(e.card);
    }
  };
  take(learning, false);
  take(review, true);
  take(fresh, false);

  return { queue, dueTotal: learning.length + review.length + fresh.length, backlog, deferredSiblings, reviewedToday: reviewedToday.size };
}

/** Übungsliste ohne Terminierung: die am ehesten fälligen Karten, höchstens `limit`. */
export function buildPracticeQueue({ cards, states, limit = 40 }) {
  const stateById = new Map(states.map((s) => [s.cardId, s]));
  return cards
    .filter((c) => !c.suspended)
    .map((c) => ({ card: c, due: stateById.get(c.id)?.due || '' }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.card.id.localeCompare(b.card.id))
    .slice(0, Math.max(1, limit))
    .map((e) => e.card);
}

/** Früheste Fälligkeit unter den noch nicht fälligen Karten, oder null. */
export function nextDue({ cards, states, now = new Date() }) {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  let best = null;
  for (const s of states) {
    const card = cardById.get(s.cardId);
    if (!card || card.suspended) continue;
    if (isDue(s, now)) continue;
    if (!best || s.due < best) best = s.due;
  }
  return best ? new Date(best) : null;
}
