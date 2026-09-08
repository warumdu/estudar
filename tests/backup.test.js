// Sicherung: Aufbau, Prüfung, Vorschau, Ersetzen und Zusammenführen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_SCHEMA, backupFileName, buildBackup, parseBackup, previewImport, applyImport } from '../app/backup.js';

const card = (id, updatedAt = '2026-09-01T00:00:00.000Z') => ({ id, noteId: id, deckId: 'd1', type: 'vocab', front: id, back: id, tags: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt, suspended: false });
const state = (cardId, last_review = null, reps = 0) => ({ cardId, due: '2026-09-01T00:00:00.000Z', stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps, lapses: 0, state: 0, last_review });
const review = (cardId, ts) => ({ id: `${cardId}:${ts}`, cardId, ts, rating: 3, state: 0, intervalBefore: 0, intervalAfter: 1, durationMs: 1000 });

const local = {
  decks: [{ id: 'd1', name: 'Alt', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
  cards: [card('a'), card('b', '2026-09-05T00:00:00.000Z'), card('c')],
  cardStates: [state('a', '2026-09-03T00:00:00.000Z', 2), state('b'), state('c')],
  reviews: [review('a', '2026-09-03T00:00:00.000Z')],
  settings: [{ key: 'requestRetention', value: 0.9 }, { key: 'schemaVersion', value: 1 }],
};

const file = buildBackup({
  decks: [{ id: 'd1', name: 'Neu', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' }, { id: 'd2', name: 'Zweites', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }],
  cards: [card('a', '2026-09-07T00:00:00.000Z'), card('b', '2026-09-02T00:00:00.000Z'), card('x')],
  cardStates: [state('a', '2026-09-06T00:00:00.000Z', 3), state('b', '2026-09-02T00:00:00.000Z', 1)],
  reviews: [review('a', '2026-09-03T00:00:00.000Z'), review('a', '2026-09-06T00:00:00.000Z')],
  settings: [{ key: 'requestRetention', value: 0.95 }, { key: 'dailyLimit', value: 20 }],
  appVersion: '0.1.0',
  now: new Date('2026-09-08T10:00:00Z'),
});

test('Dateiname trägt das Datum, Datei trägt Schema und Zählung', () => {
  assert.equal(backupFileName(new Date(2026, 8, 8, 23, 0)), 'estudar-sicherung-2026-09-08.json');
  assert.equal(file.schema, BACKUP_SCHEMA);
  assert.equal(file.app, 'estudar');
  assert.deepEqual(file.counts, { decks: 2, cards: 3, cardStates: 2, reviews: 2 });
  assert.equal(file.exportedAt, '2026-09-08T10:00:00.000Z');
});

test('parseBackup: Rundreise und klare Fehlermeldungen', () => {
  const parsed = parseBackup(JSON.stringify(file));
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(file)));
  assert.throws(() => parseBackup('kein json'), /kein gültiges JSON/);
  assert.throws(() => parseBackup('{"schema":"anders"}'), /Unbekanntes Format/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, reviews: undefined })), /fehlt der Abschnitt „reviews"/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, cards: [{ front: 'x' }] })), /Eine Karte .* keine Kennung/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, cardStates: [null] })), /Ein Lernzustand .* keine Kennung/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, cardStates: [{ due: 'x' }] })), /Ein Lernzustand .* keine Kennung \(cardId\)/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, settings: [{ value: 1 }] })), /Eine Einstellung/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, decks: [{ name: 'x' }] })), /Ein Deck/);
  assert.throws(() => parseBackup(JSON.stringify({ ...file, reviews: [{ cardId: 'a' }] })), /Ein Protokolleintrag/);
});

test('previewImport zählt, was betroffen ist', () => {
  const p = previewImport(file, local);
  assert.deepEqual(p.file, { decks: 2, cards: 3, reviews: 2, exportedAt: '2026-09-08T10:00:00.000Z' });
  assert.deepEqual(p.local, { decks: 1, cards: 3, reviews: 1 });
  assert.deepEqual(p.merge, { newCards: 1, updatedCards: 1, unchangedCards: 1, newReviews: 1 });
  assert.deepEqual(p.replace, { removedCards: 1, resultingCards: 3, newReviews: 1 });
});

test('Zusammenführen: nach Kennung vereinigt, das Neuere gewinnt, Einstellungen bleiben lokal', () => {
  const r = applyImport(file, local, 'merge');
  assert.equal(r.clear, false);
  const ids = (rows, key = 'id') => rows.map((x) => x[key]).sort();
  assert.deepEqual(ids(r.cards), ['a', 'b', 'c', 'x']);
  assert.equal(r.cards.find((c) => c.id === 'a').updatedAt, '2026-09-07T00:00:00.000Z', 'Datei ist neuer');
  assert.equal(r.cards.find((c) => c.id === 'b').updatedAt, '2026-09-05T00:00:00.000Z', 'lokal ist neuer');
  assert.deepEqual(ids(r.decks), ['d1', 'd2']);
  assert.equal(r.decks.find((d) => d.id === 'd1').name, 'Neu');
  assert.deepEqual(ids(r.cardStates, 'cardId'), ['a', 'b', 'c', 'x']);
  assert.equal(r.cardStates.find((s) => s.cardId === 'a').reps, 3, 'Zustand mit späterer Bewertung gewinnt');
  assert.equal(r.cardStates.find((s) => s.cardId === 'b').reps, 1);
  assert.equal(r.cardStates.find((s) => s.cardId === 'x').state, 0, 'fehlender Zustand wird als neu ergänzt');
  assert.deepEqual(ids(r.reviews), ['a:2026-09-06T00:00:00.000Z'], 'nur Protokolleinträge, die lokal fehlen, werden geschrieben');
  assert.deepEqual(r.settings, []);
});

test('Ersetzen: Bestand aus der Datei, Protokoll bleibt vollständig', () => {
  const r = applyImport(file, local, 'replace');
  assert.equal(r.clear, true);
  assert.deepEqual(r.cards.map((c) => c.id).sort(), ['a', 'b', 'x']);
  assert.deepEqual(r.decks.map((d) => d.name).sort(), ['Neu', 'Zweites']);
  assert.deepEqual(r.cardStates.map((s) => s.cardId).sort(), ['a', 'b', 'x']);
  assert.deepEqual(r.reviews.map((x) => x.id), ['a:2026-09-06T00:00:00.000Z'], 'Protokoll: nur ergänzen, lokal bleibt unangetastet');
  assert.deepEqual(r.settings, [{ key: 'requestRetention', value: 0.95 }, { key: 'dailyLimit', value: 20 }]);
  assert.throws(() => applyImport(file, local, 'x'), /Unbekannter Importmodus/);
});
