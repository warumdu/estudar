// Bedienabläufe im Chromium entlang der Abnahmeliste aus docs/phase-2.md:
// Import mit Vorschau · zweiter Import = alles Dubletten · kaputte Datei, Bestand
// unverändert · 300 Karten, „Heute" zeigt 10 neue · inaktives Deck liefert nichts ·
// Deckexport und Reimport. Dazu: CSV mit Rückfrage zum Trennzeichen, fehlerhafte
// Zeilen werden übersprungen, Karte pausieren, Erinnerung an die Sicherung.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.js';
import { ROOT } from './helpers/repo.js';

let server, browser, context, page;
const consoleErrors = [];
const beispiel = (name) => join(ROOT, 'docs/beispiele', name);

before(async () => {
  server = await startStaticServer();
  browser = await chromium.launch();
  context = await browser.newContext({ serviceWorkers: 'allow', acceptDownloads: true });
  page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const count = (store) => page.evaluate((s) => window.estudar.db.count(s), store);
const dump = () => page.evaluate(() => window.estudar.db.dumpAll());
async function waitForApp() {
  await page.waitForFunction(() => /^\d+$/.test(document.getElementById('heute-count').textContent), null, { timeout: 15000 });
  return Number(await page.locator('#heute-count').textContent());
}
const resetCount = () => page.evaluate(() => { document.getElementById('heute-count').textContent = '…'; });
async function open(hash = '') {
  await page.goto(server.base + hash);
  await page.waitForFunction(() => window.estudar && window.estudar.db, null, { timeout: 15000 });
  if (!hash || hash === '#heute') await waitForApp();
}
async function heuteCount() {
  await resetCount();
  await page.evaluate(() => { location.hash = '#heute'; window.estudar.route(); });
  return waitForApp();
}
async function goImport() {
  await page.evaluate(() => { location.hash = '#decks'; window.estudar.route(); });
  await page.waitForSelector('#screen-decks:not([hidden])');
  await page.click('#btn-importieren');
  await page.waitForSelector('#screen-importieren:not([hidden])');
}
async function pick(file) {
  await page.setInputFiles('#imp-file', file);
}
const previewNumbers = async () => ({
  total: await page.locator('#imp-total').textContent(),
  fresh: await page.locator('#imp-new').textContent(),
  dupes: await page.locator('#imp-dupes').textContent(),
  faulty: await page.locator('#imp-faulty').textContent(),
});
const deckIdByName = (name) => page.evaluate(async (n) => (await window.estudar.db.listDecks()).find((d) => d.name === n)?.id ?? null, name);

test('Start: Importieren ist von Decks aus erreichbar, ohne Datei ist nichts zu sehen', async () => {
  await open();
  await goImport();
  assert.ok(await page.locator('#imp-preview').isHidden());
  assert.ok(await page.locator('#imp-error').isHidden());
  assert.equal(await page.locator('#imp-file').getAttribute('accept'), '.json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain');
});

test('1. JSON-Datei: Vorschau vor dem Schreiben, Zieldeck vorbelegt, Import in EINER Transaktion, Deck inaktiv', async () => {
  const cardsBefore = await count('cards');
  await pick(beispiel('beispiel-vokabeln.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.equal(await count('cards'), cardsBefore, 'Vorschau schreibt nichts');
  assert.deepEqual(await previewNumbers(), { total: '14', fresh: '16', dupes: '0', faulty: '0' });
  assert.match(await page.locator('#imp-source').textContent(), /^beispiel-vokabeln\.json · JSON$/);
  assert.equal(await page.locator('#imp-deck').inputValue(), '__new__');
  assert.equal(await page.inputValue('#imp-deck-name'), 'Beispiel · Módulo 2 · Dia 03', 'Name aus der Datei vorbelegt');
  const sample = await page.$$eval('#imp-sample li', (els) => els.map((e) => e.querySelector('.front').textContent));
  assert.equal(sample.length, 10, 'die ersten zehn Karten');
  assert.equal(sample[0], 'der Schlaf → o sono');
  assert.equal(sample[3], 'vergessen ⇄ esquecer');
  assert.equal(sample[7], 'Ontem eu [fui] para o trabalho de ônibus.');
  assert.equal(await page.locator('#imp-sample-title').textContent(), 'Die ersten zehn Karten');
  assert.ok(await page.locator('#imp-errors').isHidden());
  assert.equal(await page.locator('#btn-imp-confirm').textContent(), '16 Karten importieren');
  assert.match(await page.locator('#imp-deck-note').textContent(), /zunächst inaktiv/);

  // Alle Schreibvorgänge laufen über db.write in einer Transaktion
  await page.evaluate(() => {
    const db = window.estudar.db;
    window.__writes = [];
    const orig = db.write.bind(db);
    db.write = async (ops) => { window.__writes.push(Object.keys(ops.adds || {}).sort()); return orig(ops); };
  });
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.deepEqual(await page.evaluate(() => window.__writes), [['cardStates', 'cards', 'decks']], 'Deck, Karten und Zustände in einer Transaktion');
  await page.evaluate(() => { window.estudar.db.write = Object.getPrototypeOf(window.estudar.db).write; });
  assert.equal(await count('cards'), cardsBefore + 16);
  assert.equal(await count('cardStates'), cardsBefore + 16);
  const deckId = await deckIdByName('Beispiel · Módulo 2 · Dia 03');
  assert.ok(deckId);
  const node = page.locator(`.deck[data-deck-id="${deckId}"]`);
  await node.waitFor();
  assert.equal(await node.getAttribute('data-active'), 'false', 'frisch importiertes Deck ist inaktiv');
  assert.equal(await node.locator('.meta').textContent(), '16 Karten · inaktiv');
  assert.ok(!(await node.locator('.deck-body').isHidden()), 'Deck ist aufgeklappt');
  const imported = await page.evaluate((id) => window.estudar.db.listCards(id), deckId);
  const pair = imported.filter((c) => c.sourceId === 'm2d03-004');
  assert.equal(pair.length, 2, '„both" ergibt zwei Karten');
  assert.equal(pair[0].noteId, pair[1].noteId);
  const cloze = imported.find((c) => c.sourceId === 'm2d03-010');
  assert.equal(cloze.type, 'cloze');
  assert.equal(cloze.hint, 'Der Hinweis hinter :: erscheint in der Lücke.');
  assert.ok(imported.every((c) => c.suspended === false && Array.isArray(c.tags)));
  // Heute: inaktives Deck liefert nichts – die 10 sind die Probekarten
  assert.equal(await heuteCount(), 10);
  assert.equal(await page.locator('#heute-new').textContent(), '10 von 20');
});

test('2. Dieselbe Datei ein zweites Mal ins selbe Deck: alles Dubletten, nichts zu importieren', async () => {
  const deckId = await deckIdByName('Beispiel · Módulo 2 · Dia 03');
  const before = await count('cards');
  await goImport();
  await pick(beispiel('beispiel-vokabeln.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.deepEqual(await previewNumbers(), { total: '14', fresh: '16', dupes: '0', faulty: '0' }, 'gegen ein neues Deck ist alles neu');
  assert.match(await page.locator('#imp-deck-note').textContent(), /Ein Deck „Beispiel · Módulo 2 · Dia 03" gibt es schon/);
  await page.selectOption('#imp-deck', deckId);
  await page.waitForFunction(() => document.getElementById('imp-dupes').textContent === '16');
  assert.deepEqual(await previewNumbers(), { total: '14', fresh: '0', dupes: '16', faulty: '0' });
  assert.ok(await page.locator('#imp-deck-name-field').isHidden(), 'bestehendes Deck: kein Namensfeld');
  assert.match(await page.locator('#imp-deck-note').textContent(), /ist inaktiv/);
  assert.equal(await page.locator('#btn-imp-confirm').textContent(), 'Nichts zu importieren');
  assert.ok(await page.locator('#btn-imp-confirm').isDisabled());
  assert.equal(await count('cards'), before);
  // Dublette trotz anderer Schreibung: Leerzeichen, Groß-/Kleinschreibung, Akzente
  await pick({ name: 'variante.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 'flashdeck/1', cards: [{ front: 'DER  schlaf', back: 'O Sono' }, { front: 'das Fruhstuck', back: 'o cafe da manha' }, { front: 'ganz neu', back: 'novo' }] })) });
  await page.waitForSelector('#imp-preview:not([hidden])');
  await page.selectOption('#imp-deck', deckId);
  await page.waitForFunction(() => document.getElementById('imp-dupes').textContent === '2');
  assert.deepEqual(await previewNumbers(), { total: '3', fresh: '1', dupes: '2', faulty: '0' });
  assert.equal(await page.locator('#btn-imp-confirm').textContent(), '1 Karte importieren');
  await page.click('#btn-imp-cancel');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await count('cards'), before, 'Abbrechen schreibt nichts');
});

test('3. Kaputte Datei: klare Meldung, Bestand unverändert – auch bei Abbruch der Transaktion', async () => {
  const before = await dump();
  await goImport();
  await pick(beispiel('kaputt.json'));
  await page.waitForSelector('#imp-error:not([hidden])');
  assert.match(await page.locator('#imp-error').textContent(), /kein gültiges JSON – vermutlich abgeschnitten/);
  assert.ok(await page.locator('#imp-preview').isHidden());

  // Sicherung statt Deck, ZIP, .json ohne JSON, Textmüll
  await pick({ name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"estudar-backup/1","decks":[],"cards":[],"cardStates":[],"reviews":[],"settings":[]}') });
  await page.waitForFunction(() => /Sicherung der ganzen App/.test(document.getElementById('imp-error').textContent));
  await pick({ name: 'archiv.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) });
  await page.waitForFunction(() => /ZIP- und XLSX-Dateien kann die App noch nicht lesen/.test(document.getElementById('imp-error').textContent));
  await pick({ name: 'falsch.json', mimeType: 'application/json', buffer: Buffer.from('front;back\na;b\n') });
  await page.waitForFunction(() => /heißt \.json, beginnt aber nicht/.test(document.getElementById('imp-error').textContent));
  await pick({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"anki","cards":[{"front":"a","back":"b"}]}') });
  await page.waitForFunction(() => /Feld schema ist „anki"/.test(document.getElementById('imp-error').textContent));
  assert.deepEqual(await dump(), before, 'nichts geschrieben');

  // Fehlerhafte Zeilen: einzeln mit Grund gelistet, übersprungen, brechen den Import nicht ab
  await pick(beispiel('teils-fehlerhaft.csv'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.deepEqual(await previewNumbers(), { total: '6', fresh: '2', dupes: '0', faulty: '4' });
  assert.ok(!(await page.locator('#imp-errors').isHidden()));
  const errors = await page.$$eval('#imp-errors li', (els) => els.map((e) => e.textContent));
  assert.equal(errors.length, 4);
  assert.equal(errors[0], 'Zeile 3: Feld back fehlt');
  assert.match(errors[1], /^Zeile 4: unbekannter Typ „tier"/);
  assert.match(errors[2], /^Zeile 5: .*Lücke/);
  assert.match(errors[3], /^Zeile 6: 6 Spalten statt 5/);
  assert.equal(await page.inputValue('#imp-deck-name'), 'teils-fehlerhaft', 'CSV: Name aus dem Dateinamen');
  assert.equal(await page.locator('#imp-sample-title').textContent(), 'Alle 2 Karten');

  // Transaktion bricht ab (nachgestellt): Meldung, Bestand unverändert, Vorschau bleibt
  await page.evaluate(() => {
    const db = window.estudar.db;
    window.__origWrite = db.write;
    db.write = async () => { throw new Error('Speicher voll (Test)'); };
  });
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#imp-error:not([hidden])');
  assert.match(await page.locator('#imp-error').textContent(), /^Import fehlgeschlagen, nichts wurde geändert: Speicher voll \(Test\)/);
  assert.ok(!(await page.locator('#imp-preview').isHidden()), 'Vorschau bleibt stehen, Import kann wiederholt werden');
  assert.ok(!(await page.locator('#btn-imp-confirm').isDisabled()));
  assert.deepEqual(await dump(), before, 'Bestand unverändert');
  await page.evaluate(() => { window.estudar.db.write = window.__origWrite; });

  // Echt: add() lehnt vorhandene Schlüssel ab – die ganze Transaktion fällt, auch das Deck
  const decksBefore = await count('decks');
  await page.evaluate(() => {
    const db = window.estudar.db;
    const orig = db.write.bind(db);
    db.write = async (ops) => {
      const first = ops.adds?.cards?.[0];
      if (first) await orig({ puts: { cards: [{ ...first, front: 'schon da' }] } }); // Schlüssel vorab belegen
      db.write = orig;
      return orig(ops);
    };
  });
  await page.click('#btn-imp-confirm');
  await page.waitForFunction(() => /Import fehlgeschlagen, nichts wurde geändert/.test(document.getElementById('imp-error').textContent) && !document.getElementById('imp-error').hidden);
  assert.equal(await count('decks'), decksBefore, 'kein halbes Deck');
  const stray = await page.evaluate(async () => (await window.estudar.db.listCards()).filter((c) => c.front === 'schon da'));
  assert.equal(stray.length, 1);
  await page.evaluate(async (id) => { await window.estudar.db.deleteCard(id); }, stray[0].id);
  assert.deepEqual(await dump(), before);

  // Jetzt klappt es: 2 Karten, Fehlerzeilen übersprungen
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await count('cards'), before.cards.length + 2);
  assert.equal(await count('decks'), decksBefore + 1);
});

test('CSV mit unklarem Trennzeichen: die App fragt, dann Vorschau', async () => {
  await goImport();
  await pick({ name: 'komisch.csv', mimeType: 'text/csv', buffer: Buffer.from('front;back;type,tags,example\nder Hund;o cachorro;vocab,tier,\n') });
  await page.waitForSelector('#imp-ask:not([hidden])');
  assert.ok(await page.locator('#imp-preview').isHidden());
  const options = await page.$$eval('#imp-ask-options button', (els) => els.map((e) => e.textContent));
  assert.deepEqual(options, ['Semikolon', 'Komma']);
  await page.click('#imp-ask-options button:has-text("Semikolon")');
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.match(await page.locator('#imp-source').textContent(), /CSV, Trennzeichen Semikolon/);
  assert.deepEqual(await previewNumbers(), { total: '1', fresh: '1', dupes: '0', faulty: '0' });
  assert.equal(await page.$eval('#imp-sample li .front', (e) => e.textContent), 'der Hund → o cachorro');
  await page.click('#btn-imp-cancel');
  await page.waitForSelector('#screen-decks:not([hidden])');
});

test('4. 300 Karten: danach zeigt „Heute" nur 10 neue, in Dateireihenfolge; Limit ist einstellbar', async () => {
  // Probe-Deck weg, damit nur die 300 zählen
  await page.evaluate(() => window.estudar.db.deleteDeck('deck-probe'));
  await goImport();
  await pick(beispiel('test-300-karten.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.deepEqual(await previewNumbers(), { total: '300', fresh: '300', dupes: '0', faulty: '0' });
  assert.equal(await page.inputValue('#imp-deck-name'), 'Test · 300 Karten (löschbar)');
  const t0 = Date.now();
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.ok(Date.now() - t0 < 5000, 'Import von 300 Karten dauert nicht ewig');
  const deckId = await deckIdByName('Test · 300 Karten (löschbar)');
  assert.equal(await page.locator(`.deck[data-deck-id="${deckId}"] .meta`).textContent(), '300 Karten · inaktiv');

  // Inaktiv: nichts. Dann einschalten.
  assert.equal(await heuteCount(), 0);
  assert.equal(await page.locator('#heute-new').textContent(), '0');
  await page.evaluate(() => { location.hash = '#decks'; window.estudar.route(); });
  await page.waitForSelector(`.deck[data-deck-id="${deckId}"] .switch`);
  await page.click(`.deck[data-deck-id="${deckId}"] .deck-head .name`); // frisch importiert = aufgeklappt → zuklappen
  await page.waitForFunction((id) => !document.querySelector(`.deck[data-deck-id="${id}"] .deck-body`), deckId);
  await page.click(`.deck[data-deck-id="${deckId}"] .switch`);
  await page.waitForFunction((id) => document.querySelector(`.deck[data-deck-id="${id}"]`)?.dataset.active === 'true', deckId);
  assert.equal(await page.locator(`.deck[data-deck-id="${deckId}"] .meta`).textContent(), '300 Karten · 300 fällig');
  assert.equal(await page.$(`.deck[data-deck-id="${deckId}"] .deck-body`), null, 'Schalter klappt das Deck nicht auf');

  assert.equal(await heuteCount(), 10, 'nur 10 neue Karten am ersten Tag');
  assert.equal(await page.locator('#heute-new').textContent(), '10 von 300');
  assert.equal(await page.locator('#heute-reviews').textContent(), '0');
  assert.match(await page.locator('#heute-note').textContent(), /Von 300 neuen Karten kommen heute 10/);
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.equal(await page.locator('#session-progress').textContent(), '1 / 10');
  assert.equal(await page.locator('#q-text').textContent(), 'der Montag', 'Importreihenfolge, nicht Zufall');
  await page.click('#session-card');
  await page.waitForSelector('#grade-bar:not([hidden])');
  await page.click('[data-grade="4"]');
  await page.waitForFunction(() => document.getElementById('session-progress').textContent === '2 / 10');
  assert.equal(await page.locator('#q-text').textContent(), 'der Dienstag');
  await page.click('#btn-session-abbrechen');
  await page.waitForSelector('#session-summary:not([hidden])');
  await resetCount();
  await page.click('#btn-sum-heute');
  assert.equal(await waitForApp(), 9, 'eine neue Karte bewertet, neun bleiben für heute');
  assert.equal(await page.locator('#heute-new').textContent(), '9 von 299');

  // Einstellung: 25 neue pro Tag
  await page.click('#tabs a[data-tab="einstellungen"]');
  await page.waitForFunction(() => document.getElementById('s-new-limit').value === '10');
  await page.fill('#s-new-limit', '25');
  await page.press('#s-new-limit', 'Tab');
  await page.waitForFunction(async () => (await window.estudar.db.getSettings()).newLimit === 25);
  assert.equal(await heuteCount(), 24);
  await page.click('#tabs a[data-tab="einstellungen"]');
  await page.fill('#s-new-limit', 'quatsch');
  await page.press('#s-new-limit', 'Tab');
  await page.waitForFunction(() => document.getElementById('s-new-limit').value === '10');
  assert.equal(await heuteCount(), 9);
});

test('5. Inaktives Deck liefert keine Karten, behält aber seinen Zustand; Karte pausieren', async () => {
  const deckId = await deckIdByName('Test · 300 Karten (löschbar)');
  const stateBefore = await page.evaluate(async (id) => (await window.estudar.db.listCards(id))[0].id, deckId).then((id) => page.evaluate((i) => window.estudar.db.getState(i), id));
  await page.evaluate(() => { location.hash = '#decks'; window.estudar.route(); });
  await page.waitForSelector(`.deck[data-deck-id="${deckId}"] .switch`);
  await page.click(`.deck[data-deck-id="${deckId}"] .switch`);
  await page.waitForFunction((id) => document.querySelector(`.deck[data-deck-id="${id}"]`)?.dataset.active === 'false', deckId);
  assert.equal(await heuteCount(), 0);
  assert.equal(await page.locator('#heute-label').textContent(), 'Nichts fällig');
  assert.ok(await page.locator('#btn-lernen').isHidden());
  assert.ok(await page.locator('#btn-ueben').isHidden(), 'auch „Trotzdem üben" bietet nichts aus inaktiven Decks');
  assert.ok(await page.locator('#heute-empty').isHidden(), 'nicht „Noch keine Karten" – es gibt welche');
  assert.match(await page.locator('#heute-note').textContent(), /Alle Karten liegen in inaktiven Decks/);
  await page.reload();
  await open('#decks');
  await page.waitForSelector(`.deck[data-deck-id="${deckId}"]`);
  assert.equal(await page.locator(`.deck[data-deck-id="${deckId}"]`).getAttribute('data-active'), 'false', 'Schalter überlebt den Neustart');
  const first = await page.evaluate(async (id) => (await window.estudar.db.listCards(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0], deckId);
  assert.deepEqual(await page.evaluate((i) => window.estudar.db.getState(i), first.id), stateBefore, 'Zustand bleibt');
  await page.click(`.deck[data-deck-id="${deckId}"] .switch`);
  await page.waitForFunction((id) => document.querySelector(`.deck[data-deck-id="${id}"]`)?.dataset.active === 'true', deckId);
  assert.equal(await heuteCount(), 9);

  // Einzelne Karte pausieren: „der Dienstag" (die zweite) – sie fällt aus der Liste, die nächste rückt nach
  const second = await page.evaluate(async (id) => (await window.estudar.db.listCards(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[1], deckId);
  assert.equal(second.front, 'der Dienstag');
  await open(`#karte/${second.id}`);
  await page.waitForFunction(() => document.getElementById('f-front').value === 'der Dienstag');
  assert.ok(!(await page.locator('#f-suspended-field').isHidden()));
  await page.check('#f-suspended');
  await page.click('#btn-card-save');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal((await page.evaluate((i) => window.estudar.db.getCard(i), second.id)).suspended, true);
  await page.waitForSelector(`.deck[data-deck-id="${deckId}"] .deck-head`);
  await page.click(`.deck[data-deck-id="${deckId}"] .deck-head .name`);
  await page.waitForSelector(`.deck[data-deck-id="${deckId}"] li.paused`);
  assert.match(await page.locator(`.deck[data-deck-id="${deckId}"] .meta`).textContent(), /· 1 pausiert$/);
  assert.equal(await heuteCount(), 9);
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.equal(await page.locator('#q-text').textContent(), 'der Mittwoch', 'pausierte Karte kommt nicht');
  await page.click('#btn-session-abbrechen');
  await waitForApp();
  // Neue Karte: kein Pausieren-Feld
  await open('#karte');
  assert.ok(await page.locator('#f-suspended-field').isHidden());
});

test('6. Deckexport im Deckformat über das Teilen-Blatt, ohne Lernzustand – und Reimport', async () => {
  await open('#decks');
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data; };
  });
  const deckId = await deckIdByName('Beispiel · Módulo 2 · Dia 03');
  await page.click(`.deck[data-deck-id="${deckId}"] .deck-head`);
  await page.click(`.deck[data-deck-id="${deckId}"] .deck-actions button:has-text("Exportieren")`);
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(async () => ({ name: window.__shared.files[0].name, type: window.__shared.files[0].type, text: await window.__shared.files[0].text() }));
  assert.equal(shared.name, 'deck-beispiel-modulo-2-dia-03.json');
  assert.equal(shared.type, 'application/json');
  const file = JSON.parse(shared.text);
  assert.equal(file.schema, 'flashdeck/1');
  assert.equal(file.deck.name, 'Beispiel · Módulo 2 · Dia 03');
  assert.deepEqual(file.deck.tags, ['modulo2', 'dia03', 'beispiel']);
  assert.equal(file.cards.length, 14, 'Paare sind wieder eine Karte mit direction both');
  assert.equal(file.cards.filter((c) => c.direction === 'both').length, 2);
  assert.deepEqual(file.cards[0], { id: 'm2d03-001', type: 'vocab', front: 'der Schlaf', back: 'o sono', example: 'O sono também é treino.', tags: ['substantiv'] });
  assert.doesNotMatch(shared.text, /"(due|stability|difficulty|reps|state|suspended|createdAt|deckId|noteId)"/, 'kein Lernzustand, keine internen Felder');
  assert.match(await page.locator('#toast').textContent(), /Deck exportiert: 14 Karten/);
  const lastBackup = await page.evaluate(() => window.estudar.settings.lastBackupAt);
  assert.equal(lastBackup, undefined, 'Deckexport ist keine Sicherung');

  // Reimport ins selbe Deck: alles Dubletten. In ein neues Deck: alle 16 Karten.
  const path = join(mkdtempSync(join(tmpdir(), 'estudar-')), shared.name);
  writeFileSync(path, shared.text);
  await goImport();
  await pick(path);
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.equal(await page.inputValue('#imp-deck-name'), 'Beispiel · Módulo 2 · Dia 03');
  await page.selectOption('#imp-deck', deckId);
  await page.waitForFunction(() => document.getElementById('imp-dupes').textContent === '16');
  assert.deepEqual(await previewNumbers(), { total: '14', fresh: '0', dupes: '16', faulty: '0' });
  await page.selectOption('#imp-deck', '__new__');
  await page.waitForFunction(() => document.getElementById('imp-new').textContent === '16');
  await page.fill('#imp-deck-name', 'Kopie');
  const before = await count('cards');
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await count('cards'), before + 16);
  const copyId = await deckIdByName('Kopie');
  assert.equal(await page.locator(`.deck[data-deck-id="${copyId}"] .meta`).textContent(), '16 Karten · inaktiv');
  // Leerer Name wird nicht angenommen
  await goImport();
  await pick(path);
  await page.waitForSelector('#imp-preview:not([hidden])');
  await page.fill('#imp-deck-name', '   ');
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.locator('#toast').textContent(), /Namen/);
  assert.equal(await count('cards'), before + 16);
  await page.click('#btn-imp-cancel');
});

test('Import in ein bestehendes AKTIVES Deck: Deck bleibt aktiv, Karten kommen ab sofort (höchstens Tageslimit)', async () => {
  await page.evaluate(() => { location.hash = '#decks'; window.estudar.route(); });
  await page.waitForSelector('#btn-deck-neu');
  await page.click('#btn-deck-neu');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.fill('#dialog-input', 'Aktiv');
  await page.click('#dialog-ok');
  const aktivId = await page.waitForFunction(async () => (await window.estudar.db.listDecks()).find((d) => d.name === 'Aktiv')?.id).then((h) => h.jsonValue());
  await page.waitForSelector(`.deck[data-deck-id="${aktivId}"]`);
  assert.equal(await page.locator(`.deck[data-deck-id="${aktivId}"]`).getAttribute('data-active'), 'true', 'von Hand angelegte Decks sind aktiv');
  // Das 300er-Deck pausieren, damit nur „Aktiv" zählt
  const bigId = await deckIdByName('Test · 300 Karten (löschbar)');
  await page.click(`.deck[data-deck-id="${bigId}"] .switch`);
  await page.waitForFunction((id) => document.querySelector(`.deck[data-deck-id="${id}"]`)?.dataset.active === 'false', bigId);
  await goImport();
  await pick(beispiel('beispiel-vokabeln.csv'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.match(await page.locator('#imp-source').textContent(), /CSV, Trennzeichen Semikolon/);
  assert.deepEqual(await previewNumbers(), { total: '12', fresh: '12', dupes: '0', faulty: '0' });
  await page.selectOption('#imp-deck', aktivId);
  await page.waitForFunction(() => /ist aktiv/.test(document.getElementById('imp-deck-note').textContent));
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await page.locator(`.deck[data-deck-id="${aktivId}"]`).getAttribute('data-active'), 'true', 'bleibt aktiv');
  assert.equal(await page.locator(`.deck[data-deck-id="${aktivId}"] .meta`).textContent(), '12 Karten · 12 fällig');
  assert.equal(await heuteCount(), 9, 'Tageslimit für neue Karten gilt auch hier (eine neue Karte wurde heute schon bewertet)');
  assert.equal(await page.locator('#heute-new').textContent(), '9 von 12');
});

test('8. Sammeldatei mit drei Decks: je Deck eine Zeile, eine Transaktion, alle inaktiv und gruppiert', async () => {
  const before = await count('cards');
  const decksBefore = await count('decks');
  await goImport();
  await pick(beispiel('beispiel-sammeldatei.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.match(await page.locator('#imp-source').textContent(), /JSON, Sammeldatei mit 3 Decks/);
  assert.deepEqual(await previewNumbers(), { total: '10', fresh: '11', dupes: '0', faulty: '0' });
  assert.ok(await page.locator('#imp-target').isHidden(), 'kein Zieldeck bei einer Sammeldatei');
  assert.ok(!(await page.locator('#imp-decks').isHidden()));
  const rows = await page.$$eval('#imp-decks li', (els) => els.map((e) => `${e.querySelector('.label').textContent} | ${e.querySelector('.value').textContent}`));
  assert.deepEqual(rows, [
    'Beispiel-Modul · Dia 01 | 5 neu · 0 Dubletten · 0 fehlerhaft',
    'Beispiel-Modul · Dia 02 | 3 neu · 0 Dubletten · 0 fehlerhaft',
    'Beispiel-Modul · Dia 03 | 3 neu · 0 Dubletten · 0 fehlerhaft',
    'Gesamt, 3 Decks – alle zunächst inaktiv | 11 neu · 0 Dubletten · 0 fehlerhaft',
  ]);
  assert.equal(await page.locator('#btn-imp-confirm').textContent(), '11 Karten in 3 Decks importieren');
  assert.equal(await page.$$eval('#imp-sample li', (els) => els.length), 10);

  // Bricht ein Deck ab, wird nichts geschrieben – eine Transaktion für alles
  await page.evaluate(() => {
    const db = window.estudar.db;
    const orig = db.write.bind(db);
    db.write = async (ops) => {
      const lastDeck = ops.adds?.decks?.at(-1);
      if (lastDeck) await orig({ puts: { decks: [{ ...lastDeck, name: 'Belegt' }] } }); // Schlüssel des dritten Decks vorab belegen
      db.write = orig;
      return orig(ops);
    };
  });
  await page.click('#btn-imp-confirm');
  await page.waitForFunction(() => /Import fehlgeschlagen, nichts wurde geändert/.test(document.getElementById('imp-error').textContent) && !document.getElementById('imp-error').hidden);
  assert.equal(await count('cards'), before, 'keine Karte geschrieben');
  assert.equal(await count('decks'), decksBefore + 1, 'nur das vorab belegte Deck');
  const stray = await page.evaluate(async () => (await window.estudar.db.listDecks()).find((d) => d.name === 'Belegt').id);
  await page.evaluate((id) => window.estudar.db.deleteDeck(id), stray);

  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await count('cards'), before + 11);
  assert.equal(await count('decks'), decksBefore + 3);
  assert.match(await page.locator('#toast').textContent(), /11 Karten in 3 Decks importiert – alle noch inaktiv/);
  const group = page.locator('.deck-group[data-group="Beispiel-Modul"]');
  await group.waitFor();
  assert.equal(await group.locator('.group-head .meta').textContent(), '3 Decks · 11 Karten · 0 fällig · inaktiv');
  const names = await group.locator('.deck .name').allTextContents();
  assert.deepEqual(names, ['Dia 01', 'Dia 02', 'Dia 03'], 'in der Gruppe ohne den Gruppenteil');
  assert.deepEqual(await group.locator('.deck').evaluateAll((els) => els.map((e) => e.dataset.active)), ['false', 'false', 'false']);
  // Decks ohne Trennzeichen stehen einzeln darüber
  const order = await page.$$eval('#deck-list > *', (els) => els.map((e) => e.className.split(' ')[0]));
  assert.ok(order.indexOf('deck') < order.indexOf('deck-group'), `einzelne Decks vor den Gruppen: ${order}`);
  assert.ok(await page.$('.deck-group[data-group="Beispiel"]'), 'auch „Beispiel · Módulo 2 · Dia 03" bildet eine Gruppe');
  // Zuklappen und aufklappen
  await group.locator('.group-head .name').click();
  await page.waitForFunction(() => document.querySelector('.deck-group[data-group="Beispiel-Modul"]')?.dataset.open === 'false');
  assert.equal(await page.$$eval('.deck-group[data-group="Beispiel-Modul"] .deck', (els) => els.length), 0);
  await page.click('.deck-group[data-group="Beispiel-Modul"] .group-head .name');
  await page.waitForFunction(() => document.querySelector('.deck-group[data-group="Beispiel-Modul"]')?.dataset.open === 'true');
});

test('9. Gruppe per Schalter aktivieren, Hinweis beim Einschalten, Einzelschalter in der Gruppe', async () => {
  await page.evaluate(async () => { await window.estudar.db.setSetting('newLimit', 4); window.estudar.settings.newLimit = 4; });
  await page.evaluate(() => { location.hash = '#decks'; window.estudar.route(); });
  const group = page.locator('.deck-group[data-group="Beispiel-Modul"]');
  await group.waitFor();
  await group.locator('.group-head .switch').click();
  await page.waitForFunction(() => document.querySelector('.deck-group[data-group="Beispiel-Modul"] .group-head .meta')?.textContent === '3 Decks · 11 Karten · 11 fällig');
  assert.deepEqual(await group.locator('.deck').evaluateAll((els) => els.map((e) => e.dataset.active)), ['true', 'true', 'true']);
  assert.match(await page.locator('#toast').textContent(), /^Gruppe „Beispiel-Modul" ist aktiv \(3 Decks\)\. 11 neue Karten, bei 4 pro Tag rund 3 Tage\.$/);
  assert.ok(await page.locator('#dialog').isHidden(), 'kein Dialog');
  await group.locator('.group-head .switch').click();
  await page.waitForFunction(() => /· inaktiv$/.test(document.querySelector('.deck-group[data-group="Beispiel-Modul"] .group-head .meta')?.textContent || ''));
  assert.deepEqual(await group.locator('.deck').evaluateAll((els) => els.map((e) => e.dataset.active)), ['false', 'false', 'false']);
  // Einzelnes Deck in der Gruppe: 3 neue Karten ≤ Limit 4 → kein Hinweis
  await group.locator('.deck').nth(1).locator('.switch').click();
  await page.waitForFunction(() => /1 von 3 aktiv$/.test(document.querySelector('.deck-group[data-group="Beispiel-Modul"] .group-head .meta')?.textContent || ''));
  assert.equal(await page.locator('#toast').textContent(), '„Beispiel-Modul · Dia 02" ist aktiv.');
  // Einzelnes Deck über dem Limit: 5 neue Karten, bei 4 pro Tag rund 2 Tage
  await group.locator('.deck').nth(0).locator('.switch').click();
  await page.waitForFunction(() => /2 von 3 aktiv$/.test(document.querySelector('.deck-group[data-group="Beispiel-Modul"] .group-head .meta')?.textContent || ''));
  assert.equal(await page.locator('#toast').textContent(), '„Beispiel-Modul · Dia 01" ist aktiv. 5 neue Karten, bei 4 pro Tag rund 2 Tage.');
  await page.evaluate(async () => { await window.estudar.db.setSetting('newLimit', 10); window.estudar.settings.newLimit = 10; });
});

test('10. Einzeldatei funktioniert unverändert – mit Hinweis auf Karten in anderen Decks', async () => {
  const before = await count('cards');
  await goImport();
  await pick(beispiel('beispiel-vokabeln.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.ok(!(await page.locator('#imp-target').isHidden()), 'Einzelform: Zieldeck wählbar');
  assert.ok(await page.locator('#imp-decks').isHidden());
  assert.deepEqual(await previewNumbers(), { total: '14', fresh: '16', dupes: '0', faulty: '0' });
  assert.equal(await page.locator('#imp-elsewhere').textContent(), '16 (zuerst in „Beispiel · Módulo 2 · Dia 03")');
  await page.fill('#imp-deck-name', 'Einzel');
  await page.click('#btn-imp-confirm');
  await page.waitForSelector('#screen-decks:not([hidden])');
  assert.equal(await count('cards'), before + 16, 'trotzdem importiert – Hinweis, keine Sperre');
  // Ins bestehende Deck: Dubletten dort, „anderes Deck" zählt nur die übrigen
  await goImport();
  await pick(beispiel('beispiel-sammeldatei.json'));
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.equal(await page.locator('#imp-elsewhere').textContent(), '11 (zuerst in „Beispiel-Modul · Dia 01")');
  await page.click('#btn-imp-cancel');
  await goImport();
  await pick({ name: 'neu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 'flashdeck/1', cards: [{ front: 'ganz neu', back: 'novo' }] })) });
  await page.waitForSelector('#imp-preview:not([hidden])');
  assert.equal(await page.locator('#imp-elsewhere').textContent(), '0');
  await page.click('#btn-imp-cancel');
});

test('7. Erinnerung an die Sicherung: ruhige Zeile nach sieben Tagen, verschwindet nach dem Sichern', async () => {
  await open();
  // Es gibt inzwischen Bewertungen (300er-Test), aber noch keine Sicherung → Erinnerung
  assert.ok((await count('reviews')) > 0);
  await page.waitForSelector('#heute-backup:not([hidden])');
  assert.equal(await page.locator('#heute-backup-text').textContent(), 'Noch keine Sicherung.');
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  await page.evaluate(async (ts) => { await window.estudar.db.setSetting('lastBackupAt', ts); }, eightDaysAgo);
  await page.reload();
  await open();
  await page.waitForSelector('#heute-backup:not([hidden])');
  assert.equal(await page.locator('#heute-backup-text').textContent(), 'Letzte Sicherung vor 8 Tagen.');
  assert.ok(await page.locator('#dialog').isHidden(), 'kein Dialog');
  // In der Session ist die Zeile nicht zu sehen (Heute ist ausgeblendet)
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.ok(await page.locator('#heute-backup').isHidden());
  await page.click('#btn-session-abbrechen');
  await waitForApp();
  await page.waitForSelector('#heute-backup:not([hidden])');
  // Knopf → Teilen-Blatt → Zeile weg
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data; };
  });
  await page.click('#btn-heute-backup');
  await page.waitForFunction(() => window.__shared && /^estudar-sicherung-/.test(window.__shared.files[0].name));
  await page.waitForFunction(() => document.getElementById('heute-backup').hidden);
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await page.evaluate(async (ts) => { await window.estudar.db.setSetting('lastBackupAt', ts); }, twoDaysAgo);
  await page.reload();
  await open();
  assert.ok(await page.locator('#heute-backup').isHidden(), 'nach zwei Tagen keine Erinnerung');
});

test('Sicherung enthält die neuen Felder und lässt sich mit Deckschaltern wiederherstellen', async () => {
  await open('#einstellungen');
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data; };
  });
  await page.click('#btn-export');
  await page.waitForFunction(() => window.__shared && /^estudar-sicherung-/.test(window.__shared.files[0].name));
  const backup = JSON.parse(await page.evaluate(() => window.__shared.files[0].text()));
  assert.equal(backup.appVersion, '0.2.1');
  assert.ok(backup.decks.some((d) => d.active === false), 'inaktive Decks sind in der Sicherung');
  assert.ok(backup.cards.some((c) => c.sourceId === 'm2d03-001'));
  assert.ok(backup.cards.some((c) => c.suspended === true));
  assert.ok(backup.settings.some((s) => s.key === 'newLimit'));
});

test('keine Konsolenfehler', () => {
  assert.deepEqual(consoleErrors, []);
});
