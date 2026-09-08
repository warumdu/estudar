// Terminierung: Anbindung an ts-fsrs, Klartext-Intervalle, Tagesliste.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as S from '../app/scheduler.js';

const NOW = new Date('2026-09-08T20:00:00'); // lokale Zeit, abends
const iso = (d) => new Date(d).toISOString();

function card(id, extra = {}) {
  return { id, noteId: id, deckId: 'd', type: 'vocab', front: id, back: id, tags: [], createdAt: iso(NOW), updatedAt: iso(NOW), suspended: false, ...extra };
}

test('Zustand einer neuen Karte ist sofort fällig und enthält den vollen FSRS-Zustand', () => {
  const s = S.newState('c1', NOW);
  assert.deepEqual(Object.keys(s).sort(), ['cardId', 'difficulty', 'due', 'elapsed_days', 'lapses', 'last_review', 'learning_steps', 'reps', 'scheduled_days', 'stability', 'state'].sort());
  assert.equal(s.due, iso(NOW));
  assert.equal(s.state, S.State.New);
  assert.equal(s.last_review, null);
  assert.ok(S.isDue(s, NOW));
  // Hin und zurück ohne Verlust
  assert.deepEqual(S.toStoredState('c1', S.toFsrsCard(s)), s);
});

test('Vorschau liefert vier steigende Intervalle aus ts-fsrs, als Klartext', () => {
  const sched = S.makeScheduler({ requestRetention: 0.9 });
  const p = S.previewGrades(sched, S.newState('c1', NOW), NOW);
  const dues = S.GRADES.map((g) => p[g].due.getTime());
  assert.ok(dues[0] < dues[1] && dues[1] < dues[2] && dues[2] < dues[3]);
  assert.equal(p[1].text, 'in 1 Min.');
  assert.equal(p[3].text, 'in 10 Min.');
  assert.match(p[4].text, /^in \d+ (Tagen|Woche)$/);
});

test('Zielretention 0,95 verkürzt das Intervall gegenüber 0,90', () => {
  let state = S.newState('c1', NOW);
  const s90 = S.makeScheduler({ requestRetention: 0.9 });
  // Zwei Mal „Gut": erst Lernschritt, dann Wiederholung mit Tagesintervall
  state = S.applyGrade(s90, state, S.Rating.Good, NOW).state;
  state = S.applyGrade(s90, state, S.Rating.Good, new Date(NOW.getTime() + 10 * 60000)).state;
  assert.equal(state.state, S.State.Review);
  const later = new Date(state.due);
  const p90 = S.previewGrades(s90, state, later);
  const p95 = S.previewGrades(S.makeScheduler({ requestRetention: 0.95 }), state, later);
  assert.ok(p95[3].due < p90[3].due, 'höhere Zielretention muss früher wiederholen');
  assert.notEqual(p95[3].text, p90[3].text);
});

test('clampRetention hält den Bereich 0,70–0,99 ein', () => {
  assert.equal(S.clampRetention('0.95'), 0.95);
  assert.equal(S.clampRetention(1.5), 0.99);
  assert.equal(S.clampRetention(0.1), 0.7);
  assert.equal(S.clampRetention('quatsch'), 0.9);
});

test('Bewertung schreibt neuen Zustand und Protokolleintrag mit allen Pflichtfeldern', () => {
  const sched = S.makeScheduler({ requestRetention: 0.9 });
  const before = S.newState('c1', NOW);
  const { state, review } = S.applyGrade(sched, before, S.Rating.Easy, NOW, 2345.6);
  assert.equal(state.cardId, 'c1');
  assert.equal(state.reps, 1);
  assert.equal(state.state, S.State.Review);
  assert.equal(state.last_review, iso(NOW));
  assert.ok(state.scheduled_days >= 1);
  assert.deepEqual(review, {
    id: `c1:${iso(NOW)}`, cardId: 'c1', ts: iso(NOW), rating: 4, state: S.State.New,
    intervalBefore: 0, intervalAfter: state.scheduled_days, durationMs: 2346,
  });
  // Der Zustand lässt sich als JSON sichern und wieder benutzen
  const again = S.previewGrades(sched, JSON.parse(JSON.stringify(state)), new Date(state.due));
  assert.ok(again[3].due > new Date(state.due));
});

test('intervalText: Minuten, Stunden, Tage, Wochen, Monate, Jahre', () => {
  const t = (min) => S.intervalText(NOW, new Date(NOW.getTime() + min * 60000));
  assert.equal(t(0), 'jetzt');
  assert.equal(t(1), 'in 1 Min.');
  assert.equal(t(10), 'in 10 Min.');
  assert.equal(t(180), 'in 3 Std.');
  assert.equal(t(60 * 24), 'in 1 Tag');
  assert.equal(t(60 * 24 * 2), 'in 2 Tagen');
  assert.equal(t(60 * 24 * 7), 'in 1 Woche');
  assert.equal(t(60 * 24 * 20), 'in 3 Wochen');
  assert.equal(t(60 * 24 * 45), 'in 2 Monaten');
  assert.equal(t(60 * 24 * 365), 'in 1 Jahr');
  assert.equal(t(60 * 24 * 730), 'in 2 Jahren');
});

test('isDue: Wiederholungen tagesgenau, Lern- und neue Karten minutengenau', () => {
  const laterToday = new Date(NOW.getTime() + 2 * 3600000); // 22:00
  const review = { ...S.newState('r', NOW), state: S.State.Review, due: iso(laterToday) };
  assert.ok(S.isDue(review, NOW), 'was heute noch fällig wird, ist heute dran');
  const tomorrow = new Date(NOW); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  assert.ok(!S.isDue({ ...review, due: iso(tomorrow) }, NOW));
  const learning = { ...S.newState('l', NOW), state: S.State.Learning, due: iso(laterToday) };
  assert.ok(!S.isDue(learning, NOW));
  assert.ok(S.isDue(learning, laterToday));
});

test('Tagesliste: Lernkarten zuerst, dann die am längsten überfälligen, dann neue; Tageslimit nur für Wiederholungen', () => {
  const day = (n) => iso(new Date(NOW.getTime() - n * 86400000));
  const cards = [];
  const states = [];
  for (let i = 0; i < 10; i++) { // Wiederholungen, i Tage überfällig
    cards.push(card(`r${i}`));
    states.push({ ...S.newState(`r${i}`, NOW), state: S.State.Review, due: day(i) });
  }
  cards.push(card('l1')); states.push({ ...S.newState('l1', NOW), state: S.State.Learning, due: day(0) });
  cards.push(card('n1', { createdAt: '2026-09-01T00:00:00.000Z' })); states.push(S.newState('n1', NOW));
  cards.push(card('n0', { createdAt: '2026-08-01T00:00:00.000Z' })); states.push(S.newState('n0', NOW));
  cards.push(card('p1', { suspended: true })); states.push(S.newState('p1', NOW));
  cards.push(card('f1')); states.push({ ...S.newState('f1', NOW), state: S.State.Review, due: iso(new Date(NOW.getTime() + 5 * 86400000)) });

  const q = S.buildQueue({ cards, states, settings: { dailyLimit: 4 }, now: NOW });
  assert.deepEqual(q.queue.map((c) => c.id), ['l1', 'r9', 'r8', 'r7', 'r6', 'n0', 'n1']);
  assert.equal(q.dueTotal, 13);
  assert.equal(q.backlog, 6);

  // Heute schon bewertete Wiederholungen zehren vom Limit
  const reviewsToday = [{ cardId: 'x1', state: S.State.Review, ts: iso(NOW) }, { cardId: 'x2', state: S.State.Review, ts: iso(NOW) }, { cardId: 'x2', state: S.State.Relearning, ts: iso(NOW) }];
  const q2 = S.buildQueue({ cards, states, reviewsToday, settings: { dailyLimit: 4 }, now: NOW });
  assert.deepEqual(q2.queue.map((c) => c.id), ['l1', 'r9', 'r8', 'n0', 'n1']);
  assert.equal(q2.reviewedToday, 2);

  // Limit 0: keine Wiederholungen, aber Lern- und neue Karten
  const q3 = S.buildQueue({ cards, states, settings: { dailyLimit: 0 }, now: NOW });
  assert.deepEqual(q3.queue.map((c) => c.id), ['l1', 'n0', 'n1']);
});

test('Geschwisterkarten (gleiche noteId) kommen nie am selben Tag', () => {
  const a = card('a', { noteId: 'note1' });
  const b = card('b', { noteId: 'note1' });
  const c = card('c', { noteId: 'note2' });
  const states = [S.newState('a', NOW), S.newState('b', NOW), S.newState('c', NOW)];
  const q = S.buildQueue({ cards: [a, b, c], states, settings: { dailyLimit: 40 }, now: NOW });
  assert.deepEqual(q.queue.map((x) => x.id), ['a', 'c']);
  assert.equal(q.deferredSiblings, 1);
  // Wurde „a" heute schon bewertet und ist „a" nicht mehr fällig, bleibt „b" trotzdem zurück
  const laterA = { ...states[0], state: S.State.Review, due: iso(new Date(NOW.getTime() + 5 * 86400000)) };
  const q2 = S.buildQueue({ cards: [a, b, c], states: [laterA, states[1], states[2]], reviewsToday: [{ cardId: 'a', state: S.State.New }], settings: { dailyLimit: 40 }, now: NOW });
  assert.deepEqual(q2.queue.map((x) => x.id), ['c']);
  assert.equal(q2.deferredSiblings, 1);
  // … aber „a" selbst darf wiederkommen (Lernschritt derselben Karte wird heute erneut fällig)
  const learningA = { ...states[0], state: S.State.Learning, due: iso(new Date(NOW.getTime() - 60000)) };
  const q3 = S.buildQueue({ cards: [a, b, c], states: [learningA, states[1], states[2]], reviewsToday: [{ cardId: 'a', state: S.State.New }], settings: { dailyLimit: 40 }, now: NOW });
  assert.deepEqual(q3.queue.map((x) => x.id), ['a', 'c']);
  assert.equal(q3.deferredSiblings, 1);
});

test('Übungsliste ohne Terminierung: die am ehesten fälligen zuerst, begrenzt', () => {
  const cards = [card('a'), card('b'), card('c'), card('p', { suspended: true })];
  const states = [
    { ...S.newState('a', NOW), due: '2026-09-20T00:00:00.000Z' },
    { ...S.newState('b', NOW), due: '2026-09-10T00:00:00.000Z' },
    { ...S.newState('c', NOW), due: '2026-09-15T00:00:00.000Z' },
    { ...S.newState('p', NOW), due: '2026-09-01T00:00:00.000Z' },
  ];
  assert.deepEqual(S.buildPracticeQueue({ cards, states, limit: 2 }).map((c) => c.id), ['b', 'c']);
});

test('nextDue und nextDueText', () => {
  const cards = [card('a'), card('b')];
  const in2h = new Date(NOW.getTime() + 2 * 3600000);
  const in3d = new Date(NOW.getTime() + 3 * 86400000);
  const states = [
    { ...S.newState('a', NOW), state: S.State.Learning, due: iso(in2h) },
    { ...S.newState('b', NOW), state: S.State.Review, due: iso(in3d) },
  ];
  assert.equal(S.nextDue({ cards, states, now: NOW }).getTime(), in2h.getTime());
  assert.equal(S.nextDueText(in2h, NOW), 'heute um 22:00');
  assert.equal(S.nextDueText(in3d, NOW), 'in 3 Tagen');
  const tomorrow = new Date(NOW.getTime() + 86400000);
  assert.equal(S.nextDueText(tomorrow, NOW), 'morgen');
  assert.equal(S.nextDue({ cards: [], states: [], now: NOW }), null);
});

test('Tagesliste bei 5.000 Karten in unter 100 ms', () => {
  const cards = [];
  const states = [];
  for (let i = 0; i < 5000; i++) {
    cards.push(card(`c${i}`));
    states.push({ ...S.newState(`c${i}`, NOW), state: i % 3 === 0 ? S.State.Review : S.State.New, due: iso(new Date(NOW.getTime() - (i % 50) * 86400000)) });
  }
  const t0 = performance.now();
  const q = S.buildQueue({ cards, states, settings: { dailyLimit: 40 }, now: NOW });
  const ms = performance.now() - t0;
  assert.ok(q.queue.length > 40);
  assert.ok(ms < 100, `buildQueue brauchte ${ms.toFixed(1)} ms`);
});
