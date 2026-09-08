// Deckformat flashdeck/1: Erkennen, Einlesen (JSON, CSV), Prüfen mit klaren
// Fehlermeldungen, Dubletten, Datensätze für den Import, Export und Rundreise.
// Dazu: alle Beispieldateien unter docs/beispiele/ sind wirklich importierbar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DECK_SCHEMA, DeckFormatError, normalizeKey, cardKey, parseTags, validateCard, detectFormat, deckNameFromFile,
  parseDeckJson, parseDeckCsv, parseCsvRecords, parseDeck, expandCards, planImport, buildImportRecords,
  cardPreviewText, deckToFile, deckFileName, findElsewhere, deckGroup,
} from '../app/deckformat.js';
import { ROOT } from './helpers/repo.js';

const bytes = (text) => new TextEncoder().encode(text);
const example = (name) => readFileSync(join(ROOT, 'docs/beispiele', name));

test('normalizeKey/cardKey: Leerraum, Groß-/Kleinschreibung und Akzente zählen nicht', () => {
  assert.equal(normalizeKey('  Café   da MANHÃ '), 'cafe da manha');
  assert.equal(cardKey('Der Hund', 'o cachorro'), cardKey('der  hund', 'O Cachorro'));
  assert.notEqual(cardKey('der Hund', 'o cachorro'), cardKey('der Hund', 'o gato'));
  assert.deepEqual(parseTags('substantiv, tier  dia03'), ['substantiv', 'tier', 'dia03']);
  assert.deepEqual(parseTags(['a', ' b ']), ['a', 'b']);
  assert.deepEqual(parseTags(undefined), []);
  assert.equal(parseTags([1]), null);
});

test('validateCard: verständliche Fehlermeldungen mit Ortsangabe', () => {
  const err = (raw, where = 'Zeile 14') => validateCard(raw, where).error;
  assert.equal(err({ front: 'der Hund' }), 'Zeile 14: Feld back fehlt');
  assert.equal(err({ front: 'der Hund', back: '' }), 'Zeile 14: Feld back fehlt');
  assert.equal(err({ front: '   ', back: 'x' }), 'Zeile 14: Feld front ist leer');
  assert.equal(err({ back: 'o cachorro' }, 'Karte 3 (m2d03-003)'), 'Karte 3 (m2d03-003): Feld front fehlt');
  assert.match(err({ type: 'tier', front: 'a', back: 'b' }), /^Zeile 14: unbekannter Typ „tier" \(erlaubt: vocab, cloze, conjugation, sentence\)$/);
  assert.equal(err({ type: 'cloze' }), 'Zeile 14: Feld text fehlt');
  assert.match(err({ type: 'cloze', text: 'ohne Lücke' }), /Feld text braucht mindestens eine Lücke in der Form \{\{c1::Wort\}\}/);
  assert.equal(err({ type: 'conjugation', prompt: 'falar' }), 'Zeile 14: Feld answer fehlt');
  assert.equal(err({ type: 'conjugation', answer: 'falamos' }), 'Zeile 14: Feld prompt fehlt');
  assert.equal(err({ front: 1, back: 'b' }), 'Zeile 14: Feld front muss Text sein');
  assert.equal(err({ front: 'a', back: { x: 1 } }), 'Zeile 14: Feld back muss Text sein');
  assert.match(err({ front: 'a', back: 'b', tags: [1] }), /Feld tags muss eine Liste von Texten sein/);
  assert.equal(err({ front: 'a', back: 'b', example: 5 }), 'Zeile 14: Feld example muss Text sein');
  assert.match(err({ front: 'a', back: 'b', direction: 'hin' }), /Feld direction muss de-pt, pt-de oder both sein, nicht „hin"/);
  assert.equal(err({ type: 'sentence', front: 'a', back: 'b', direction: 'both' }), 'Zeile 14: Feld direction gibt es nur beim Typ vocab');
  assert.equal(err(null), 'Zeile 14: kein Karten-Objekt');
  assert.equal(err(['a']), 'Zeile 14: kein Karten-Objekt');
  assert.doesNotMatch(String(Object.values(validateCard({}, 'Zeile 1'))), /undefined/);
});

test('validateCard: gültige Karten aller Typen, Standardwerte und Aliasse', () => {
  const v = validateCard({ front: ' der  Hund ', back: 'o cachorro', tags: 'substantiv tier', example: 'O cachorro late.', id: 7 }).card;
  assert.deepEqual(v, { type: 'vocab', front: 'der Hund', back: 'o cachorro', example: 'O cachorro late.', hint: '', tags: ['substantiv', 'tier'], sourceId: '7', direction: 'de-pt' });
  const both = validateCard({ type: 'vocab', front: 'a', back: 'b', direction: 'both' }).card;
  assert.equal(both.direction, 'both');
  const cloze = validateCard({ type: 'cloze', text: 'Eu {{c1::fui}}.', note: 'ir' }).card;
  assert.deepEqual([cloze.front, cloze.back, cloze.hint, cloze.direction], ['Eu {{c1::fui}}.', '', 'ir', undefined]);
  const clozeCsv = validateCard({ type: 'cloze', front: 'Eu {{c1::fui}}.', back: '', hint: 'ir' }).card;
  assert.equal(clozeCsv.front, 'Eu {{c1::fui}}.');
  assert.equal(clozeCsv.hint, 'ir');
  const conj = validateCard({ type: 'conjugation', prompt: 'falar · nós', answer: 'falamos' }).card;
  assert.deepEqual([conj.front, conj.back], ['falar · nós', 'falamos']);
  const conjCsv = validateCard({ type: 'conjugation', front: 'falar · nós', back: 'falamos' }).card;
  assert.deepEqual([conjCsv.front, conjCsv.back], ['falar · nós', 'falamos']);
  const sentence = validateCard({ type: 'sentence', front: 'Guten Tag.', back: 'Bom dia.' }).card;
  assert.equal(sentence.direction, undefined);
});

test('detectFormat: JSON, Sicherung, ZIP, CSV mit Trennzeichen, Mehrdeutigkeit, Unbrauchbares', () => {
  assert.equal(detectFormat({ name: 'x.json', bytes: bytes('  {"schema":"flashdeck/1"}') }).format, 'json');
  assert.equal(detectFormat({ name: 'x.json', bytes: bytes('﻿{"schema":"flashdeck/1"}') }).format, 'json', 'BOM vor JSON');
  assert.equal(detectFormat({ name: 'x.json', bytes: bytes('{"schema":"estudar-backup/1","decks":[]}') }).format, 'backup');
  assert.equal(detectFormat({ name: 'x.zip', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]) }).format, 'zip');
  assert.deepEqual(detectFormat({ name: 'x.csv', bytes: bytes('front;back\na;b\n') }).separator, ';');
  assert.deepEqual(detectFormat({ name: 'x.txt', bytes: bytes('front\tback\na\tb\n') }).separator, '\t');
  assert.deepEqual(detectFormat({ name: 'x.csv', bytes: bytes('front,back\na,b\n') }).separator, ',');
  assert.deepEqual(detectFormat({ name: 'x.tsv', bytes: bytes('front\tback;x\n') }).separator, '\t', '.tsv ist immer Tabulator');
  const amb = detectFormat({ name: 'x.csv', bytes: bytes('front;back,type\na;b,c\n') });
  assert.equal(amb.format, 'csv');
  assert.deepEqual(amb.candidates, [';', ','], 'gleich viele Semikolons und Kommas → fragen');
  assert.equal(detectFormat({ name: 'x.csv', bytes: bytes('front\na\n') }).separator, ';', 'einspaltig: Semikolon');
  const notJson = detectFormat({ name: 'x.json', bytes: bytes('front;back\n') });
  assert.equal(notJson.format, 'unknown');
  assert.match(notJson.reason, /heißt \.json/);
  assert.equal(detectFormat({ name: 'x.csv', bytes: bytes('') }).format, 'unknown');
  assert.equal(detectFormat({ name: 'x.bin', bytes: new Uint8Array([0x61, 0x00, 0x01, 0x02]) }).format, 'unknown');
  assert.equal(deckNameFromFile('ordner/modulo2-dia03.JSON'), 'modulo2-dia03');
  assert.equal(deckNameFromFile(''), 'Import');
});

test('parseDeckJson: ganze Datei unbrauchbar → DeckFormatError mit klarer Meldung', () => {
  const throwsWith = (text, re) => assert.throws(() => parseDeckJson(text, { fileName: 'x.json' }), (e) => e instanceof DeckFormatError && re.test(e.message));
  throwsWith('{"schema": "flashdeck/1", "cards": [', /kein gültiges JSON – vermutlich abgeschnitten/);
  throwsWith('[1,2]', /kein JSON-Objekt/);
  throwsWith('{"schema":"estudar-backup/1"}', /Sicherung der ganzen App/);
  throwsWith('{"cards":[]}', /Feld schema fehlt – erwartet wird "flashdeck\/1"/);
  throwsWith('{"schema":"flashdeck/2","cards":[]}', /Feld schema ist „flashdeck\/2"/);
  throwsWith('{"schema":"flashdeck/1"}', /Feld cards fehlt oder ist keine Liste/);
  throwsWith('{"schema":"flashdeck/1","cards":[]}', /Die Liste cards ist leer/);
  throwsWith('{"schema":"flashdeck/1","deck":"x","cards":[{}]}', /Feld deck muss ein Objekt sein/);
  throwsWith('{"schema":"flashdeck/1","deck":{"name":5},"cards":[{}]}', /Feld deck\.name muss Text sein/);
  assert.doesNotThrow(() => parseDeckJson('{"schema":"flashdeck/1","deck":{"tags":"a b c d"},"cards":[{}]}'), 'Text als deck.tags ist erlaubt');
});

test('parseDeckJson: Fehler je Karte werden gesammelt, der Rest bleibt importierbar', () => {
  const p = parseDeckJson(JSON.stringify({
    schema: DECK_SCHEMA,
    deck: { name: '  Módulo 2  · Dia 03 ' },
    cards: [
      { id: 'a1', front: 'der Hund', back: 'o cachorro' },
      { id: 'a2', front: 'die Katze' },
      'kein Objekt',
      { type: 'cloze', text: 'Eu {{c1::fui}}.' },
    ],
  }), { fileName: 'egal.json' });
  assert.equal(p.format, 'json');
  assert.equal(p.deck.name, 'Módulo 2 · Dia 03');
  assert.equal(p.deck.nameFromFile, false);
  assert.equal(p.total, 4);
  assert.equal(p.cards.length, 2);
  assert.deepEqual(p.errors, ['Karte 2 (a2): Feld back fehlt', 'Karte 3: kein Karten-Objekt']);
  const noDeck = parseDeckJson(JSON.stringify({ schema: DECK_SCHEMA, cards: [{ front: 'a', back: 'b' }] }), { fileName: 'dia-04.json' });
  assert.equal(noDeck.deck.name, 'dia-04');
  assert.equal(noDeck.deck.nameFromFile, true);
});

test('parseCsvRecords: Anführungszeichen, "" als Zeichen, Zeilenumbruch im Feld, CRLF, Zeilennummern', () => {
  const r = parseCsvRecords('a;b\r\n"x;y";"sagt ""hallo"""\n"zwei\nZeilen";z\n\nq;w', ';');
  assert.deepEqual(r.map((x) => x.fields), [['a', 'b'], ['x;y', 'sagt "hallo"'], ['zwei\nZeilen', 'z'], [''], ['q', 'w']]);
  assert.deepEqual(r.map((x) => x.line), [1, 2, 3, 5, 6]);
  assert.deepEqual(parseCsvRecords('a\tb\n', '\t')[0].fields, ['a', 'b']);
  assert.deepEqual(parseCsvRecords('﻿a;b', ';')[0].fields, ['a', 'b'], 'BOM wird entfernt');
});

test('parseDeckCsv: Kopfzeile, Spalten in beliebiger Reihenfolge, Zeilennummer in der Fehlermeldung', () => {
  const text = [
    'back;front;type;tags;example',
    'o cachorro;der Hund;;substantiv tier;O cachorro late.',
    '',
    ';die Katze;vocab;;',
    'o gato;die Katze;;;',
    ';Ontem eu {{c1::fui}} ao mercado.;cloze;;',
    'o pássaro;der Vogel;vocab;;O pássaro canta; de manhã.',
    'a vaca;die Kuh;kuh;;',
  ].join('\n');
  const p = parseDeckCsv(text, { fileName: 'Tiere.csv', separator: ';' });
  assert.equal(p.format, 'csv');
  assert.equal(p.deck.name, 'Tiere');
  assert.equal(p.total, 6);
  assert.deepEqual(p.cards.map((c) => [c.front, c.back, c.type]), [['der Hund', 'o cachorro', 'vocab'], ['die Katze', 'o gato', 'vocab'], ['Ontem eu {{c1::fui}} ao mercado.', '', 'cloze']]);
  assert.deepEqual(p.cards[0].tags, ['substantiv', 'tier']);
  assert.deepEqual(p.errors, [
    'Zeile 4: Feld back fehlt',
    'Zeile 7: 6 Spalten statt 5 – enthält ein Feld das Trennzeichen „Semikolon"? Dann das Feld in Anführungszeichen setzen.',
    'Zeile 8: unbekannter Typ „kuh" (erlaubt: vocab, cloze, conjugation, sentence)',
  ]);
  const tsv = parseDeckCsv('front\tback\tdirection\nder Hund\to cachorro\tboth\n', { fileName: 'x.tsv', separator: '\t' });
  assert.equal(tsv.cards[0].direction, 'both');
  assert.throws(() => parseDeckCsv('der Hund;o cachorro\n', { separator: ';' }), /Kopfzeile fehlt: .*mindestens „front"/);
  assert.throws(() => parseDeckCsv('front;back\n', { separator: ';' }), /nach der Kopfzeile keine Karten/);
  assert.throws(() => parseDeckCsv('\n\n', { separator: ';' }), /leer/);
  assert.throws(() => parseDeck('x', { format: 'xlsx' }), /Unbekanntes Format/);
});

test('planImport: Dubletten gegen das Zieldeck und innerhalb der Datei, „both" wird zu zwei Karten', () => {
  const existing = [{ front: 'Der  Hund', back: 'o cachorro' }, { front: 'o gato', back: 'die Katze' }];
  const cards = [
    validateCard({ front: 'der hund', back: 'O CACHORRO' }).card,          // Dublette (Bestand)
    validateCard({ front: 'die Katze', back: 'o gato', direction: 'both' }).card, // de-pt neu, pt-de Dublette
    validateCard({ front: 'das Pferd', back: 'o cavalo' }).card,
    validateCard({ front: 'das  Pferd', back: 'o cávalo' }).card,          // Dublette (Datei)
    validateCard({ type: 'cloze', text: 'Eu {{c1::fui}}.' }).card,
  ];
  assert.equal(expandCards(cards).length, 6);
  const plan = planImport(cards, existing);
  assert.deepEqual(plan.fresh.map((c) => `${c.front}|${c.back}`), ['die Katze|o gato', 'das Pferd|o cavalo', 'Eu {{c1::fui}}.|']);
  assert.deepEqual(plan.duplicates.map((c) => `${c.front}|${c.back}`), ['der hund|O CACHORRO', 'o gato|die Katze', 'das Pferd|o cávalo']);
  assert.equal(plan.fresh[0].group, 1);
  // Alles neu, wenn das Zieldeck leer ist; zweiter Import derselben Datei: alles Dubletten
  const first = planImport(cards, []);
  assert.equal(first.fresh.length, 5);
  const second = planImport(cards, first.fresh);
  assert.equal(second.fresh.length, 0);
  assert.equal(second.duplicates.length, 6);
});

test('buildImportRecords: eindeutige Kennungen, gemeinsame noteId für Paare, createdAt in Dateireihenfolge', () => {
  const now = new Date('2026-09-08T20:00:00.000Z');
  const cards = [
    validateCard({ id: 'x-1', front: 'a', back: 'b', direction: 'both', tags: ['t'], example: 'e', hint: 'h' }).card,
    validateCard({ type: 'cloze', text: 'c {{c1::d}}' }).card,
  ];
  const records = buildImportRecords(planImport(cards).fresh, { deckId: 'deck-1', now, base: 'basis' });
  assert.deepEqual(records.map((r) => r.id), ['c-basis-0', 'c-basis-1', 'c-basis-2']);
  assert.equal(records[0].noteId, records[1].noteId, 'Paar teilt die noteId');
  assert.notEqual(records[1].noteId, records[2].noteId);
  assert.deepEqual(records.map((r) => r.createdAt), ['2026-09-08T20:00:00.000Z', '2026-09-08T20:00:00.001Z', '2026-09-08T20:00:00.002Z']);
  assert.deepEqual([records[0].direction, records[1].direction, records[2].direction], ['de-pt', 'pt-de', undefined]);
  assert.deepEqual([records[1].front, records[1].back], ['b', 'a']);
  assert.equal(records[0].sourceId, 'x-1');
  assert.equal(records[2].sourceId, undefined);
  for (const r of records) {
    assert.equal(r.deckId, 'deck-1');
    assert.equal(r.suspended, false);
    assert.equal(r.updatedAt, r.createdAt);
    assert.ok(Array.isArray(r.tags));
  }
  // Zwei Importe ohne feste Basis kollidieren nicht
  const a = buildImportRecords(planImport(cards).fresh, { deckId: 'd', now });
  const b = buildImportRecords(planImport(cards).fresh, { deckId: 'd', now });
  assert.equal(new Set([...a, ...b].map((r) => r.id)).size, 6);
});

test('cardPreviewText: Klartext je Typ', () => {
  assert.equal(cardPreviewText({ type: 'vocab', front: 'der Hund', back: 'o cachorro', direction: 'de-pt' }), 'der Hund → o cachorro');
  assert.equal(cardPreviewText({ type: 'vocab', front: 'der Hund', back: 'o cachorro', direction: 'both' }), 'der Hund ⇄ o cachorro');
  assert.equal(cardPreviewText({ type: 'cloze', front: 'Eu {{c1::fui::ir}} lá.', back: '' }), 'Eu [fui] lá.');
  assert.equal(cardPreviewText({ type: 'conjugation', front: 'falar · nós', back: 'falamos' }), 'falar · nós → falamos');
});

test('deckToFile + Rundreise: Export ist wieder importierbar, Paare werden zu „both", kein Lernzustand', () => {
  const deck = { id: 'd1', name: 'Módulo 2 · Dia 03', tags: ['modulo2'] };
  const cards = [
    { id: 'c1', noteId: 'n1', deckId: 'd1', type: 'vocab', direction: 'de-pt', front: 'vergessen', back: 'esquecer', example: 'Esqueci.', hint: '', tags: ['verb'], createdAt: '2026-09-01T00:00:00.000Z', sourceId: 'm2d03-004' },
    { id: 'c2', noteId: 'n1', deckId: 'd1', type: 'vocab', direction: 'pt-de', front: 'esquecer', back: 'vergessen', example: 'Esqueci.', hint: '', tags: ['verb'], createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'c3', noteId: 'n2', deckId: 'd1', type: 'vocab', direction: 'pt-de', front: 'o sono', back: 'der Schlaf', example: '', hint: 'Substantiv', tags: [], createdAt: '2026-09-01T00:00:01.000Z' },
    { id: 'c4', noteId: 'n3', deckId: 'd1', type: 'cloze', front: 'Eu {{c1::fui}}.', back: '', example: '', hint: 'ir', tags: ['pp'], createdAt: '2026-09-01T00:00:02.000Z' },
    { id: 'c5', noteId: 'n4', deckId: 'd1', type: 'conjugation', front: 'falar · nós', back: 'falamos', example: '', hint: '', tags: [], createdAt: '2026-09-01T00:00:03.000Z', suspended: true },
    { id: 'c6', noteId: 'n5', deckId: 'd1', type: 'sentence', front: 'Guten Tag.', back: 'Bom dia.', example: '', hint: '', tags: [], createdAt: '2026-09-01T00:00:04.000Z' },
  ];
  const file = deckToFile(deck, cards);
  assert.equal(file.schema, DECK_SCHEMA);
  assert.deepEqual(file.deck, { name: 'Módulo 2 · Dia 03', front_lang: 'de-DE', back_lang: 'pt-BR', tags: ['modulo2'] });
  assert.deepEqual(file.cards, [
    { id: 'm2d03-004', type: 'vocab', front: 'vergessen', back: 'esquecer', direction: 'both', example: 'Esqueci.', tags: ['verb'] },
    { type: 'vocab', front: 'o sono', back: 'der Schlaf', direction: 'pt-de', hint: 'Substantiv' },
    { type: 'cloze', text: 'Eu {{c1::fui}}.', note: 'ir', tags: ['pp'] },
    { type: 'conjugation', prompt: 'falar · nós', answer: 'falamos' },
    { type: 'sentence', front: 'Guten Tag.', back: 'Bom dia.' },
  ]);
  const json = JSON.stringify(file);
  assert.doesNotMatch(json, /due|stability|difficulty|reps|lapses|suspended|createdAt|noteId|deckId/, 'kein Lernzustand, keine internen Felder');
  // Rundreise
  const parsed = parseDeckJson(json, { fileName: 'x.json' });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.deck.name, deck.name);
  const plan = planImport(parsed.cards, cards);
  assert.equal(plan.fresh.length, 0, 'Reimport ins selbe Deck: alles Dubletten');
  assert.equal(plan.duplicates.length, 6);
  assert.equal(planImport(parsed.cards, []).fresh.length, 6, 'Reimport in ein leeres Deck: alle Karten wieder da');
  assert.equal(deckFileName(deck), 'deck-modulo-2-dia-03.json');
  assert.equal(deckFileName({ name: '···' }), 'deck-ohne-namen.json');
});

test('Beispieldateien unter docs/beispiele/ sind importierbar bzw. scheitern wie beschrieben', () => {
  const load = (name) => {
    const det = detectFormat({ name, bytes: new Uint8Array(example(name)) });
    return { det, parsed: parseDeck(det.text, { format: det.format, fileName: name, separator: det.separator }) };
  };
  const json = load('beispiel-vokabeln.json');
  assert.equal(json.det.format, 'json');
  assert.deepEqual(json.parsed.errors, []);
  assert.equal(json.parsed.total, 14);
  assert.equal(json.parsed.deck.name, 'Beispiel · Módulo 2 · Dia 03');
  assert.deepEqual([...new Set(json.parsed.cards.map((c) => c.type))].sort(), ['cloze', 'conjugation', 'sentence', 'vocab']);
  assert.equal(planImport(json.parsed.cards).fresh.length, 16, '14 Karten, zwei davon in beide Richtungen');

  const csv = load('beispiel-vokabeln.csv');
  assert.equal(csv.det.format, 'csv');
  assert.equal(csv.det.separator, ';');
  assert.deepEqual(csv.parsed.errors, []);
  assert.equal(csv.parsed.total, 12);
  assert.equal(csv.parsed.deck.name, 'beispiel-vokabeln');
  assert.equal(csv.parsed.cards.find((c) => c.front.startsWith('die Rechnung')).example, 'A conta, por favor!');
  assert.equal(csv.parsed.cards.filter((c) => c.type === 'cloze').length, 2);

  const big = load('test-300-karten.json');
  assert.deepEqual(big.parsed.errors, []);
  assert.equal(big.parsed.total, 300);
  assert.equal(big.parsed.cards.length, 300);
  assert.equal(planImport(big.parsed.cards).fresh.length, 300, 'keine Dubletten in der 300er-Datei');
  assert.equal(new Set(big.parsed.cards.map((c) => normalizeKey(c.front))).size, 300, 'jede Vorderseite nur einmal');
  assert.equal(big.parsed.cards[0].front, 'der Montag');

  const partly = load('teils-fehlerhaft.csv');
  assert.equal(partly.parsed.total, 6);
  assert.equal(partly.parsed.cards.length, 2);
  assert.equal(partly.parsed.errors.length, 4);
  assert.equal(partly.parsed.errors[0], 'Zeile 3: Feld back fehlt');

  const broken = detectFormat({ name: 'kaputt.json', bytes: new Uint8Array(example('kaputt.json')) });
  assert.equal(broken.format, 'json');
  assert.throws(() => parseDeck(broken.text, { format: 'json', fileName: 'kaputt.json' }), /kein gültiges JSON/);
});

test('Sammelform: decks-Liste → mehrere Quellen, Fehler nennen das Deck, Einzelform bleibt gültig', () => {
  const multi = parseDeckJson(JSON.stringify({
    schema: DECK_SCHEMA,
    decks: [
      { deck: { name: 'Módulo 2 · Dia 01', tags: ['m2'] }, cards: [{ front: 'a', back: 'b' }, { front: 'c' }] },
      { cards: [{ type: 'cloze', text: 'x {{c1::y}}' }] },
    ],
  }), { fileName: 'modul2.json' });
  assert.equal(multi.multi, true);
  assert.equal(multi.sources.length, 2);
  assert.equal(multi.sources[0].deck.name, 'Módulo 2 · Dia 01');
  assert.deepEqual(multi.sources[0].deck.tags, ['m2']);
  assert.equal(multi.sources[0].cards.length, 1);
  assert.deepEqual(multi.sources[0].errors, ['Deck 1, Karte 2: Feld back fehlt']);
  assert.equal(multi.sources[1].deck.name, 'modul2 2', 'ohne deck.name: Dateiname plus Nummer');
  assert.equal(multi.total, 3);
  assert.deepEqual(multi.errors, ['Deck 1, Karte 2: Feld back fehlt']);
  // Einzelform hat dieselbe Struktur mit genau einer Quelle
  const single = parseDeckJson(JSON.stringify({ schema: DECK_SCHEMA, deck: { name: 'X' }, cards: [{ front: 'a', back: 'b' }] }));
  assert.equal(single.multi, false);
  assert.equal(single.sources.length, 1);
  assert.equal(single.sources[0].deck.name, 'X');
  assert.deepEqual(single.sources[0].cards, single.cards);
  const csv = parseDeckCsv('front;back\na;b\n', { fileName: 'x.csv' });
  assert.equal(csv.multi, false);
  assert.equal(csv.sources[0].cards.length, 1);
  // Strukturfehler in der Sammelform
  const throwsWith = (obj, re) => assert.throws(() => parseDeckJson(JSON.stringify(obj)), (e) => e instanceof DeckFormatError && re.test(e.message));
  throwsWith({ schema: DECK_SCHEMA, decks: [] }, /Liste decks ist leer/);
  throwsWith({ schema: DECK_SCHEMA, decks: 'x' }, /Feld decks muss eine Liste/);
  throwsWith({ schema: DECK_SCHEMA, decks: [{ deck: { name: 'A' }, cards: [{ front: 'a', back: 'b' }] }], cards: [] }, /sowohl decks als auch cards/);
  throwsWith({ schema: DECK_SCHEMA, decks: [{ deck: { name: 'A' } }] }, /Deck 1 \(„A"\): Feld cards fehlt/);
  throwsWith({ schema: DECK_SCHEMA, decks: [{ deck: { name: 'A' }, cards: [] }] }, /Deck 1 \(„A"\): Die Liste cards ist leer/);
  throwsWith({ schema: DECK_SCHEMA, decks: ['x'] }, /Deck 1: kein Objekt/);
  throwsWith({ schema: DECK_SCHEMA, decks: [{ deck: { name: 5 }, cards: [{}] }] }, /Deck 1: Feld deck\.name muss Text sein/);
});

test('findElsewhere: Hinweis auf Karten in anderen Decks, mit dem ersten betroffenen Decknamen; deckGroup', () => {
  const other = [{ deckId: 'd2', front: 'der Hund', back: 'o cachorro' }, { deckId: 'd3', front: 'die Katze', back: 'o gato' }, { deckId: 'd1', front: 'die Katze', back: 'o gato' }];
  const names = new Map([['d1', 'Erstes'], ['d2', 'Zweites'], ['d3', 'Drittes']]);
  const fresh = planImport([validateCard({ front: 'DIE Katze', back: 'o  gato' }).card, validateCard({ front: 'der Hund', back: 'o cachorro' }).card, validateCard({ front: 'neu', back: 'novo' }).card]).fresh;
  assert.deepEqual(findElsewhere(fresh, other, names), { count: 2, firstDeckName: 'Drittes' });
  assert.deepEqual(findElsewhere(fresh, [], names), { count: 0, firstDeckName: null });
  assert.equal(findElsewhere(fresh, other).firstDeckName, 'd1', 'ohne Namen die Kennung – alphabetisch, unabhängig von der Reihenfolge');
  assert.equal(deckGroup('Módulo 2 · Dia 01'), 'Módulo 2');
  assert.equal(deckGroup('Probe (löschbar)'), null);
  assert.equal(deckGroup('a·b'), null, 'nur mit Leerzeichen um den Mittelpunkt');
  assert.equal(deckGroup(' · x'), null);
});

test('Beispiel-Sammeldatei: drei Decks einer Gruppe, alle Karten gültig', () => {
  const name = 'beispiel-sammeldatei.json';
  const det = detectFormat({ name, bytes: new Uint8Array(example(name)) });
  const p = parseDeck(det.text, { format: det.format, fileName: name });
  assert.equal(p.multi, true);
  assert.deepEqual(p.sources.map((s) => s.deck.name), ['Beispiel-Modul · Dia 01', 'Beispiel-Modul · Dia 02', 'Beispiel-Modul · Dia 03']);
  assert.deepEqual([...new Set(p.sources.map((s) => deckGroup(s.deck.name)))], ['Beispiel-Modul']);
  assert.deepEqual(p.errors, []);
  assert.equal(p.total, 10);
  assert.deepEqual(p.sources.map((s) => planImport(s.cards).fresh.length), [5, 3, 3]);
});
