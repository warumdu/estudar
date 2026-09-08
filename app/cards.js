// estudar – Kartenmodell: Anlegen, Lückentext, Anzeige.

import { newId } from './db.js';

export const TYPE_LABELS = Object.freeze({
  vocab: 'Vokabel', cloze: 'Lückentext', conjugation: 'Konjugation', sentence: 'Satz',
});

// Je Aufruf eine frische Regex: eine geteilte /g-Regex trüge lastIndex von Aufruf zu Aufruf.
const clozeRegex = () => /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

/** Zerlegt einen Lückentext in Segmente: { text } oder { cloze: 'fui', hint: 'ir' }. */
export function parseCloze(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text ?? '').matchAll(clozeRegex())) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ cloze: m[2], hint: m[3] || '' });
    last = m.index + m[0].length;
  }
  if (last < (text ?? '').length) parts.push({ text: text.slice(last) });
  return parts;
}

export function hasCloze(text) {
  return clozeRegex().test(String(text ?? ''));
}

/** Nur die Lösungen der Lücken, z. B. ['fui']. */
export function clozeAnswers(text) {
  return parseCloze(text).filter((p) => p.cloze !== undefined).map((p) => p.cloze);
}

/** Frage/Antwort für die Anzeige, unabhängig vom Typ. */
export function cardFaces(card) {
  if (card.type === 'cloze') {
    return { question: parseCloze(card.front), answer: clozeAnswers(card.front).join(' · ') };
  }
  return { question: card.front, answer: card.back };
}

/** Braucht die Karte in der Session ein Eingabefeld? */
export function needsTyping(card, settings) {
  if (card.type === 'conjugation') return true;
  if (card.type === 'vocab' && card.direction === 'de-pt' && settings?.typeAnswerVocab) return true;
  return false;
}

/** Erwartete Eingabe beim Tippen. */
export function typedSolution(card) {
  return card.type === 'cloze' ? clozeAnswers(card.front).join(' ') : card.back;
}

export function splitTags(text) {
  return String(text ?? '').split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * Baut aus der Eingabemaske eine oder zwei Karten. Bei vocab mit
 * bothDirections=true entstehen zwei Karten mit gemeinsamer noteId.
 * @returns {object[]} neue Kartenobjekte (ohne Zustand)
 */
export function createCards({ deckId, type, front, back = '', example = '', hint = '', tags = [], bothDirections = false, now = new Date() }) {
  const ts = now.toISOString();
  const noteId = newId('n-');
  const base = { noteId, deckId, type, example: canonicalMultiline(example), hint: hint.trim(), tags, createdAt: ts, updatedAt: ts, suspended: false };
  const f = canonicalMultiline(front);
  const b = canonicalMultiline(back);
  if (type === 'vocab') {
    const cards = [{ ...base, id: newId('c-'), front: f, back: b, direction: 'de-pt' }];
    if (bothDirections) cards.push({ ...base, id: newId('c-'), front: b, back: f, direction: 'pt-de' });
    return cards;
  }
  return [{ ...base, id: newId('c-'), front: f, back: b }];
}

function canonicalMultiline(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Prüft die Eingabemaske. Liefert eine Fehlermeldung oder null. */
export function validateCardInput({ type, front, back }) {
  const f = (front ?? '').trim();
  const b = (back ?? '').trim();
  if (type === 'cloze') {
    if (!f) return 'Bitte einen Text mit mindestens einer Lücke eingeben.';
    if (!hasCloze(f)) return 'Der Text braucht mindestens eine Lücke in der Form {{c1::Wort}}.';
    return null;
  }
  if (!f) return type === 'vocab' ? 'Bitte das deutsche Wort eingeben.' : 'Bitte die Vorderseite ausfüllen.';
  if (!b) return type === 'vocab' ? 'Bitte die portugiesische Übersetzung eingeben.' : 'Bitte die Rückseite ausfüllen.';
  return null;
}
