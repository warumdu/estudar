// Kartenmodell: Lückentext, Anlegen in beide Richtungen, Prüfung der Eingabe.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCloze, clozeAnswers, hasCloze, cardFaces, needsTyping, typedSolution, createCards, validateCardInput, splitTags } from '../app/cards.js';

test('parseCloze zerlegt Text und Lücken, auch mit Hinweis', () => {
  assert.deepEqual(parseCloze('Ontem eu {{c1::fui}} ao mercado.'), [{ text: 'Ontem eu ' }, { cloze: 'fui', hint: '' }, { text: ' ao mercado.' }]);
  assert.deepEqual(parseCloze('{{c1::Eu}} {{c2::fiz::fazer}}'), [{ cloze: 'Eu', hint: '' }, { text: ' ' }, { cloze: 'fiz', hint: 'fazer' }]);
  assert.deepEqual(clozeAnswers('{{c1::a}} e {{c2::b}}'), ['a', 'b']);
  assert.ok(hasCloze('x {{c1::y}}'));
  assert.ok(!hasCloze('kein Lückentext'));
  assert.ok(hasCloze('a {{c1::b}}') && hasCloze('c {{c1::d}}'), 'wiederholte Aufrufe dürfen sich nicht beeinflussen');
});

test('cardFaces und typedSolution je Typ', () => {
  const cloze = { type: 'cloze', front: 'Nós {{c1::comemos}} feijoada.', back: '' };
  assert.equal(cardFaces(cloze).answer, 'comemos');
  assert.equal(typedSolution(cloze), 'comemos');
  const vocab = { type: 'vocab', front: 'der Schlaf', back: 'o sono', direction: 'de-pt' };
  assert.deepEqual(cardFaces(vocab), { question: 'der Schlaf', answer: 'o sono' });
  assert.equal(typedSolution(vocab), 'o sono');
});

test('needsTyping: Konjugation immer, Vokabel DE→PT nur wahlweise', () => {
  assert.ok(needsTyping({ type: 'conjugation' }, {}));
  assert.ok(!needsTyping({ type: 'vocab', direction: 'de-pt' }, { typeAnswerVocab: false }));
  assert.ok(needsTyping({ type: 'vocab', direction: 'de-pt' }, { typeAnswerVocab: true }));
  assert.ok(!needsTyping({ type: 'vocab', direction: 'pt-de' }, { typeAnswerVocab: true }));
  assert.ok(!needsTyping({ type: 'cloze' }, { typeAnswerVocab: true }));
});

test('createCards: „beide Richtungen" erzeugt zwei Karten mit gemeinsamer noteId', () => {
  const now = new Date('2026-09-08T20:00:00Z');
  const cards = createCards({ deckId: 'd1', type: 'vocab', front: ' der  Schlaf ', back: 'o sono', example: 'O sono também é treino.', tags: ['a'], bothDirections: true, now });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].noteId, cards[1].noteId);
  assert.notEqual(cards[0].id, cards[1].id);
  assert.deepEqual([cards[0].front, cards[0].back, cards[0].direction], ['der Schlaf', 'o sono', 'de-pt']);
  assert.deepEqual([cards[1].front, cards[1].back, cards[1].direction], ['o sono', 'der Schlaf', 'pt-de']);
  for (const c of cards) {
    assert.equal(c.deckId, 'd1');
    assert.equal(c.type, 'vocab');
    assert.equal(c.createdAt, now.toISOString());
    assert.equal(c.updatedAt, now.toISOString());
    assert.equal(c.suspended, false);
    assert.equal(c.example, 'O sono também é treino.');
    assert.deepEqual(c.tags, ['a']);
  }
  const single = createCards({ deckId: 'd1', type: 'vocab', front: 'x', back: 'y', now });
  assert.equal(single.length, 1);
  const cloze = createCards({ deckId: 'd1', type: 'cloze', front: 'Eu {{c1::fui}}.', now });
  assert.equal(cloze.length, 1);
  assert.equal(cloze[0].direction, undefined);
});

test('validateCardInput und splitTags', () => {
  assert.equal(validateCardInput({ type: 'vocab', front: 'a', back: 'b' }), null);
  assert.match(validateCardInput({ type: 'vocab', front: '', back: 'b' }), /deutsche/);
  assert.match(validateCardInput({ type: 'vocab', front: 'a', back: ' ' }), /portugiesische/);
  assert.match(validateCardInput({ type: 'cloze', front: 'ohne Lücke' }), /\{\{c1::Wort\}\}/);
  assert.equal(validateCardInput({ type: 'cloze', front: 'mit {{c1::Lücke}}' }), null);
  assert.match(validateCardInput({ type: 'sentence', front: 'a', back: '' }), /Rückseite/);
  assert.deepEqual(splitTags(' substantiv, modulo2  dia03 '), ['substantiv', 'modulo2', 'dia03']);
});
