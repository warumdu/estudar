// Toleranter Antwortvergleich für Tastatureingaben.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareAnswer, normalizeAnswer, canonical, ACCENT_CHARS } from '../app/compare.js';

test('normalizeAnswer entfernt Akzente, Groß-/Kleinschreibung und überflüssigen Leerraum', () => {
  assert.equal(normalizeAnswer('  Está   bem '), 'esta bem');
  assert.equal(normalizeAnswer('AÇÃO'), 'acao');
  assert.equal(canonical('  o  sono '), 'o sono');
});

test('exakt richtig', () => {
  const r = compareAnswer('está', 'está');
  assert.equal(r.verdict, 'exact');
  assert.ok(r.correct);
  assert.ok(r.marks.every((m) => !m.differs));
});

test('nur Akzente falsch gilt als richtig, die Abweichung wird markiert', () => {
  const r = compareAnswer('esta', 'está');
  assert.equal(r.verdict, 'accents');
  assert.ok(r.correct);
  assert.deepEqual(r.marks.map((m) => `${m.char}${m.differs ? '*' : ''}`), ['e', 's', 't', 'á*']);
  const r2 = compareAnswer('Cafe da manha', 'café da manhã');
  assert.equal(r2.verdict, 'accents');
  assert.deepEqual(r2.marks.filter((m) => m.differs).map((m) => m.char), ['c', 'é', 'ã']);
  const r3 = compareAnswer('comecar', 'começar');
  assert.equal(r3.verdict, 'accents');
});

test('falsch: Urteil und Markierung der abweichenden Zeichen', () => {
  const r = compareAnswer('falamos', 'falaram');
  assert.equal(r.verdict, 'wrong');
  assert.ok(!r.correct);
  assert.deepEqual(r.marks.map((m) => m.differs), [false, false, false, false, true, true, true]);
  const r2 = compareAnswer('', 'fui');
  assert.equal(r2.verdict, 'wrong');
  assert.ok(r2.marks.every((m) => m.differs));
  const r3 = compareAnswer('fui ao', 'fui');
  assert.equal(r3.verdict, 'wrong');
});

test('Akzentleiste enthält genau die geforderten Zeichen', () => {
  assert.deepEqual([...ACCENT_CHARS], ['á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç']);
});
