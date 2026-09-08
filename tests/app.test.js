// Bedienabläufe im Chromium: entlang der Abnahmeliste aus docs/phase-1.md.
// 1 Karte anlegen, neu starten – 2 Session bis zum Ende – (3 offline: browser.test.js)
// – 4 Export, Deck löschen, Import – 5 Zielretention ändert die Intervalle.
// Dazu: Übung ohne Terminierung, Tippen mit Akzentleiste, Update erst nach Antippen.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.js';
import { readText } from './helpers/repo.js';

let server, browser, context, page;
const consoleErrors = [];

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
async function waitForApp() {
  await page.waitForFunction(() => /^\d+$/.test(document.getElementById('heute-count').textContent), null, { timeout: 15000 });
  return Number(await page.locator('#heute-count').textContent());
}
/** Setzt die Heute-Zahl zurück, damit waitForApp() erst nach dem nächsten Rendern zurückkommt. */
const resetCount = () => page.evaluate(() => { document.getElementById('heute-count').textContent = '…'; });
async function open(hash = '') {
  await page.goto(server.base + hash);
  await page.waitForFunction(() => window.estudar && window.estudar.db, null, { timeout: 15000 });
  if (!hash || hash === '#heute') await waitForApp();
}
/** Wechselt nach Heute und liefert die frisch gerenderte Zahl der fälligen Karten. */
async function heuteCount() {
  await resetCount();
  await page.evaluate(() => { location.hash = '#heute'; window.estudar.route(); });
  return waitForApp();
}
/** Deckt die Lösung auf und bewertet; liefert die Intervalltexte der vier Knöpfe. */
async function answer(grade) {
  await page.waitForSelector('#session-card:not([hidden])');
  const before = await page.locator('#session-progress').textContent();
  await page.click('#session-card');
  await page.waitForSelector('#grade-bar:not([hidden])');
  const ivls = await page.$$eval('#grade-bar .ivl', (els) => els.map((e) => e.textContent));
  await page.click(`[data-grade="${grade}"]`);
  await page.waitForFunction((b) => document.getElementById('session-progress').textContent !== b || !document.getElementById('session-summary').hidden, before);
  return ivls;
}

test('Start: Probe-Deck mit 20 Karten, alle fällig – aber nur 10 neue pro Tag', async () => {
  await open();
  assert.equal(await heuteCount(), 10, 'Standard: 10 neue Karten pro Tag');
  assert.equal(await page.locator('#heute-reviews').textContent(), '0');
  assert.equal(await page.locator('#heute-new').textContent(), '10 von 20');
  assert.match(await page.locator('#heute-note').textContent(), /Von 20 neuen Karten kommen heute 10/);
  assert.equal(await page.locator('#heute-done').textContent(), '0 Karten');
  assert.ok(await page.locator('#heute-backup').isHidden(), 'ohne Lernfortschritt keine Erinnerung an die Sicherung');
  // Für die Abläufe aus Phase 1 das Limit für neue Karten aufheben (Import-Tests prüfen es getrennt).
  await page.evaluate(async () => { await window.estudar.db.setSetting('newLimit', 999); window.estudar.settings.newLimit = 999; });
  assert.equal(await heuteCount(), 20);
  assert.equal(await page.locator('#heute-new').textContent(), '20');
  await page.click('#tabs a[data-tab="decks"]');
  await page.waitForSelector('.deck');
  assert.match(await page.locator('.deck .name').first().textContent(), /^Probe \(löschbar\)$/);
  assert.equal(await page.locator('.deck .meta').first().textContent(), '20 Karten · 20 fällig');
  assert.equal(await count('cardStates'), 20);
});

test('1. Karte anlegen (beide Richtungen), App neu starten – Karte ist noch da', async () => {
  await page.click('#tabs a[data-tab="karte"]');
  await page.waitForSelector('#screen-karte:not([hidden])');
  assert.equal(await page.locator('#f-front-label').textContent(), 'Deutsch');
  await page.fill('#f-front', 'die Reise');
  await page.fill('#f-back', 'a viagem');
  await page.fill('#f-example', 'A viagem foi longa.');
  await page.fill('#f-tags', 'test, substantiv');
  await page.check('#f-both');
  await page.click('#btn-card-save');
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.locator('#toast').textContent(), /Gespeichert \(2 Karten\)/);
  // Maske bleibt offen und leer, Deck und Ankreuzfeld bleiben stehen
  assert.ok(!(await page.locator('#screen-karte').isHidden()));
  assert.equal(await page.inputValue('#f-front'), '');
  assert.equal(await page.inputValue('#f-back'), '');
  assert.equal(await page.isChecked('#f-both'), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-front');
  // Pflichtfeld leer → Fehlermeldung, nichts gespeichert
  await page.click('#btn-card-save');
  assert.ok(!(await page.locator('#f-error').isHidden()));
  assert.equal(await count('cards'), 22);

  // Neustart: neue Seite, gleicher Speicher
  await page.reload();
  await open('#decks');
  await page.waitForSelector('.deck');
  assert.equal(await page.locator('.deck .meta').first().textContent(), '22 Karten · 22 fällig');
  await page.click('.deck-head');
  await page.waitForSelector('.card-list li');
  const rows = await page.$$eval('.card-list li', (els) => els.map((e) => e.textContent));
  assert.ok(rows.some((r) => r.startsWith('die Reise') && r.endsWith('a viagem')));
  assert.ok(rows.some((r) => r.startsWith('a viagem') && r.endsWith('die Reise')), 'Gegenrichtung ist eine eigene Karte');
  const pair = await page.evaluate(async () => (await window.estudar.db.listCards()).filter((c) => c.tags.includes('test')));
  assert.equal(pair.length, 2);
  assert.equal(pair[0].noteId, pair[1].noteId, 'gemeinsame noteId');
  assert.notEqual(pair[0].id, pair[1].id);
});

test('Karte bearbeiten: Änderung wird gespeichert, Typ ist gesperrt', async () => {
  const id = await page.evaluate(async () => (await window.estudar.db.listCards()).find((c) => c.front === 'die Reise').id);
  await open(`#karte/${id}`);
  await page.waitForFunction(() => document.getElementById('f-front').value === 'die Reise');
  assert.equal(await page.locator('#karte-title').textContent(), 'Karte bearbeiten');
  assert.ok(await page.locator('#f-type input[value="vocab"]').isDisabled());
  assert.ok(await page.locator('#f-both-field').isHidden(), 'beim Bearbeiten keine „beide Richtungen"');
  await page.fill('#f-hint', 'Substantiv, feminin');
  await page.click('#btn-card-save');
  await page.waitForSelector('#screen-decks:not([hidden])');
  const card = await page.evaluate((i) => window.estudar.db.getCard(i), id);
  assert.equal(card.hint, 'Substantiv, feminin');
  assert.ok(card.updatedAt > card.createdAt);
});

test('Heute: Gegenrichtung kommt nicht am selben Tag', async () => {
  assert.equal(await heuteCount(), 21, '22 Karten, eine Gegenrichtung zurückgestellt');
  assert.match(await page.locator('#heute-note').textContent(), /1 Gegenrichtung kommt erst morgen dran/);
  assert.equal(await page.locator('#heute-next').textContent(), 'jetzt');
});

test('2. Session bis zum Ende: Intervalle aus ts-fsrs, sofort weiter, Zusammenfassung', async () => {
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.ok(await page.locator('#tabs').isHidden(), 'in der Session keine Reiter');
  assert.equal(await page.locator('#session-progress').textContent(), '1 / 21');
  assert.match(await page.locator('#q-text').textContent(), /^der Schlaf$/, 'neue Karten in Eingabereihenfolge');
  assert.ok(await page.locator('#grade-bar').isHidden(), 'vor dem Aufdecken keine Bewertung');

  // Erste Karte: „Nochmal" (1 Min.) → kommt in derselben Session wieder
  const ivls = await answer(1);
  assert.deepEqual(ivls.map((t) => t.split(' ')[0]), ['in', 'in', 'in', 'in']);
  assert.equal(ivls[0], 'in 1 Min.');
  assert.equal(ivls[2], 'in 10 Min.');
  assert.match(ivls[3], /^in \d+ (Tagen|Woche)$/);
  assert.equal(await page.locator('#session-progress').textContent(), '2 / 22', 'Nochmal-Karte hängt hinten dran');

  // Alle übrigen mit „Leicht" → Wiederholung in Tagen, keine Rückkehr
  let guard = 0;
  while (await page.locator('#session-summary').isHidden()) {
    await answer(4);
    assert.ok(++guard < 40, 'Session endet nicht');
  }
  assert.equal(await page.locator('#summary-title').textContent(), 'Fertig für heute');
  assert.equal(await page.locator('#sum-cards').textContent(), '21');
  assert.equal(await page.locator('#sum-rate').textContent(), '95 %', '1 Nochmal von 22 Bewertungen');
  assert.match(await page.locator('#sum-duration').textContent(), /\d+ s$/);
  assert.ok(!(await page.locator('#btn-sum-backup').isHidden()));
  assert.equal(await count('reviews'), 22);
  const log = await page.evaluate(() => window.estudar.db.listReviews());
  const first = log.sort((a, b) => a.ts.localeCompare(b.ts))[0];
  assert.deepEqual(Object.keys(first).sort(), ['cardId', 'durationMs', 'id', 'intervalAfter', 'intervalBefore', 'rating', 'state', 'ts'].sort());
  assert.equal(first.rating, 1);
  assert.ok(first.durationMs >= 0);

  await resetCount();
  await page.click('#btn-sum-heute');
  assert.equal(await waitForApp(), 0);
  assert.equal(await page.locator('#heute-label').textContent(), 'Nichts fällig');
  assert.equal(await page.locator('#heute-done').textContent(), '21 Karten');
  assert.equal(await page.locator('#heute-next').textContent(), 'morgen', 'die zurückgestellte Gegenrichtung ist morgen dran');
  assert.doesNotMatch(await page.locator('#heute-note').textContent(), /nichts fällig/, 'kein Widerspruch zur wartenden Gegenrichtung');
  assert.ok(await page.locator('#btn-lernen').isHidden());
  assert.ok(!(await page.locator('#btn-ueben').isHidden()), '„Trotzdem üben" wird angeboten');
});

test('Trotzdem üben: ohne Terminierung, kein Protokoll, Abbruch zeigt die Zusammenfassung', async () => {
  const reviewsBefore = await count('reviews');
  const stateBefore = await page.evaluate(() => window.estudar.db.getState('probe-v01'));
  await page.click('#btn-ueben');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.match(await page.locator('#q-type').textContent(), /Übung ohne Terminierung/);
  const ivls = await answer(3);
  assert.deepEqual(ivls, ['ohne Wertung', 'ohne Wertung', 'ohne Wertung', 'ohne Wertung']);
  await page.click('#btn-session-abbrechen');
  await page.waitForSelector('#session-summary:not([hidden])');
  assert.equal(await page.locator('#summary-title').textContent(), 'Übung beendet');
  assert.equal(await page.locator('#sum-cards').textContent(), '1');
  assert.equal(await count('reviews'), reviewsBefore);
  assert.deepEqual(await page.evaluate(() => window.estudar.db.getState('probe-v01')), stateBefore);
  await page.click('#btn-sum-heute');
  await waitForApp();
});

test('Tippen: Konjugation mit Eingabefeld, Akzentleiste, tolerante Prüfung mit Markierung', async () => {
  // Neues Deck direkt aus der Kartenmaske
  await page.click('#tabs a[data-tab="karte"]');
  await page.waitForSelector('#screen-karte:not([hidden])');
  await page.click('#f-type label:has-text("Konjugation")');
  assert.match(await page.locator('#f-front-label').textContent(), /^Aufgabe/);
  await page.selectOption('#f-deck', '__new__');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.fill('#dialog-input', 'Verben');
  await page.click('#dialog-ok');
  await page.waitForFunction(() => document.getElementById('dialog').hidden && document.getElementById('f-deck').selectedOptions[0].textContent === 'Verben');
  await page.fill('#f-front', 'começar · pretérito perfeito · eu');
  await page.fill('#f-back', 'comecei');
  await page.click('#btn-card-save');
  await page.waitForSelector('#toast:not([hidden])');

  assert.equal(await heuteCount(), 1);
  await page.click('#btn-lernen');
  await page.waitForSelector('#typing:not([hidden])');
  assert.ok(await page.locator('#grade-bar').isHidden());
  assert.equal(await page.$$eval('#accent-bar button', (b) => b.map((x) => x.textContent).join('')), 'áàãâéêíóôõúç');
  await page.fill('#typing-input', 'Comeei');
  await page.click('#typing-input');
  await page.evaluate(() => { const i = document.getElementById('typing-input'); i.setSelectionRange(4, 4); });
  await page.click('#accent-bar button:has-text("ç")');
  assert.equal(await page.inputValue('#typing-input'), 'Começei', 'Akzentzeichen landet an der Schreibmarke');
  await page.click('#typing-form button[type="submit"]');
  await page.waitForSelector('#grade-bar:not([hidden])');
  assert.match(await page.locator('#a-verdict').textContent(), /^Richtig – Akzente/);
  assert.equal(await page.locator('#a-text').textContent(), 'comecei');
  assert.deepEqual(await page.$$eval('#a-text .diff', (els) => els.map((e) => e.textContent)), ['c', 'c'], 'Groß-/Kleinschreibung und ç sind markiert');
  // „Gut" auf einer neuen Karte ist ein Lernschritt (10 Min.): die Karte kommt in derselben Session wieder
  await page.click('[data-grade="3"]');
  await page.waitForFunction(() => document.getElementById('session-progress').textContent === '2 / 2');
  await page.waitForSelector('#typing:not([hidden])');
  assert.equal(await page.inputValue('#typing-input'), '', 'Eingabefeld ist geleert');
  await page.fill('#typing-input', 'comecei');
  await page.press('#typing-input', 'Enter');
  await page.waitForSelector('#grade-bar:not([hidden])');
  assert.equal(await page.locator('#a-verdict').textContent(), 'Richtig');
  assert.equal(await page.$$eval('#a-text .diff', (els) => els.length), 0);
  await page.click('[data-grade="4"]');
  await page.waitForSelector('#session-summary:not([hidden])');
  assert.equal(await page.locator('#sum-cards').textContent(), '1');
  assert.equal(await page.locator('#sum-rate').textContent(), '100 %');
  await page.click('#btn-sum-heute');
  await waitForApp();

  // Falsche Antwort: Konjugationskarte wieder fällig machen und lernen
  const conjId = await page.evaluate(async () => (await window.estudar.db.listCards()).find((c) => c.type === 'conjugation').id);
  await page.evaluate(async (id) => { const st = await window.estudar.db.getState(id); await window.estudar.db.put('cardStates', { ...st, due: new Date().toISOString() }); }, conjId);
  assert.equal(await heuteCount(), 1);
  await page.click('#btn-lernen');
  await page.waitForSelector('#typing:not([hidden])');
  await page.fill('#typing-input', 'comecamos');
  await page.press('#typing-input', 'Enter');
  await page.waitForSelector('#grade-bar:not([hidden])');
  assert.equal(await page.locator('#a-verdict').textContent(), 'Falsch');
  assert.match(await page.locator('#a-text').textContent(), /Deine Eingabe: comecamos/);
  await page.click('[data-grade="1"]');
  await page.waitForFunction(() => document.getElementById('session-progress').textContent === '2 / 2', null, { timeout: 5000 });
  await page.click('#btn-session-abbrechen');
  await page.waitForSelector('#session-summary:not([hidden])');
  assert.equal(await page.locator('#sum-rate').textContent(), '0 %');
  await resetCount();
  await page.click('#btn-sum-heute');
  await waitForApp();
});

test('Vokabel DE→PT per Eingabefeld nur, wenn eingeschaltet', async () => {
  await page.click('#tabs a[data-tab="einstellungen"]');
  await page.check('#s-typing');
  await page.waitForFunction(() => window.estudar.settings.typeAnswerVocab === true);
  await page.click('#tabs a[data-tab="karte"]');
  await page.waitForSelector('#screen-karte:not([hidden])');
  await page.click('#f-type label:has-text("Vokabel")');
  await page.uncheck('#f-both');
  await page.fill('#f-front', 'das Haus');
  await page.fill('#f-back', 'a casa');
  await page.click('#btn-card-save');
  await page.waitForSelector('#toast:not([hidden])');
  assert.equal(await heuteCount(), 1);
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  assert.match(await page.locator('#q-type').textContent(), /DE → PT/);
  await page.waitForSelector('#typing:not([hidden])');
  await page.fill('#typing-input', 'a casa');
  await page.press('#typing-input', 'Enter');
  await page.waitForSelector('#grade-bar:not([hidden])');
  assert.equal(await page.locator('#a-verdict').textContent(), 'Richtig');
  await page.click('[data-grade="4"]');
  await page.waitForSelector('#session-summary:not([hidden])');
  await resetCount();
  await page.click('#btn-sum-heute');
  await waitForApp();
  await page.click('#tabs a[data-tab="einstellungen"]');
  await page.uncheck('#s-typing');
  await page.waitForFunction(() => window.estudar.settings.typeAnswerVocab === false);
  // Ausgeschaltet: dieselbe Karte ohne Eingabefeld
  await page.evaluate(async () => { const c = (await window.estudar.db.listCards()).find((x) => x.front === 'das Haus'); const st = await window.estudar.db.getState(c.id); await window.estudar.db.put('cardStates', { ...st, due: new Date().toISOString() }); });
  assert.equal(await heuteCount(), 1);
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  await page.waitForFunction(() => document.getElementById('q-text').textContent === 'das Haus');
  assert.ok(await page.locator('#typing').isHidden(), 'ohne Einstellung kein Eingabefeld');
  await answer(4);
  await page.waitForSelector('#session-summary:not([hidden])');
  await resetCount();
  await page.click('#btn-sum-heute');
  await waitForApp();
});

test('5. Zielretention 0,95: Einstellung bleibt und die Intervalle ändern sich', async () => {
  await page.click('#tabs a[data-tab="einstellungen"]');
  assert.equal(await page.inputValue('#s-retention'), '0,90');
  const at90 = await page.evaluate(async () => {
    const S = await import('./app/scheduler.js');
    const st = await window.estudar.db.getState('probe-v02');
    const p = S.previewGrades(window.estudar.scheduler, st, new Date(st.due));
    return [1, 2, 3, 4].map((g) => p[g].text);
  });
  await page.fill('#s-retention', '0,95');
  await page.press('#s-retention', 'Tab');
  await page.waitForFunction(() => window.estudar.settings.requestRetention === 0.95);
  const at95 = await page.evaluate(async () => {
    const S = await import('./app/scheduler.js');
    const st = await window.estudar.db.getState('probe-v02');
    const p = S.previewGrades(window.estudar.scheduler, st, new Date(st.due));
    return [1, 2, 3, 4].map((g) => p[g].text);
  });
  assert.notDeepEqual(at95, at90, `Intervalle müssen sich ändern: ${at90} → ${at95}`);
  // Grenzen und Komma
  await page.fill('#s-retention', '1,5');
  await page.press('#s-retention', 'Tab');
  await page.waitForFunction(() => window.estudar.settings.requestRetention === 0.99);
  await page.waitForFunction(() => document.getElementById('s-retention').value === '0,99');
  await page.fill('#s-retention', '0,95');
  await page.press('#s-retention', 'Tab');
  await page.waitForFunction(() => window.estudar.settings.requestRetention === 0.95);
  await page.fill('#s-limit', '3');
  await page.press('#s-limit', 'Tab');
  await page.waitForFunction(async () => { const s = await window.estudar.db.getSettings(); return s.dailyLimit === 3 && s.requestRetention === 0.95; });
  await page.reload();
  await open('#einstellungen');
  await page.waitForFunction(() => document.getElementById('s-retention').value === '0,95');
  assert.equal(await page.inputValue('#s-limit'), '3');
  assert.equal(await page.evaluate(() => window.estudar.settings.requestRetention), 0.95);
});

test('4. Export als Datei, Deck löschen, Import ersetzt den Bestand – Protokoll bleibt', async () => {
  // iOS-Weg: Teilen-Blatt mit Datei. Hier nachgestellt, weil Chromium kein Web Share hat.
  await open('#einstellungen');
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data; };
  });
  const cardsBefore = await count('cards');
  const reviewsBefore = await count('reviews');
  assert.equal(await page.locator('#s-last-backup').textContent(), 'noch nie');
  await page.click('#btn-export');
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(async () => ({ keys: Object.keys(window.__shared).sort(), fileCount: window.__shared.files.length, name: window.__shared.files[0].name, type: window.__shared.files[0].type, text: await window.__shared.files[0].text() }));
  assert.match(shared.name, /^estudar-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  // Genau eine Datei, kein title/text: daraus machte iOS eine zweite Datei „text.txt".
  assert.deepEqual(shared.keys, ['files']);
  assert.equal(shared.fileCount, 1);
  assert.equal(shared.type, 'application/json');
  const backup = JSON.parse(shared.text);
  assert.equal(backup.schema, 'estudar-backup/1');
  assert.equal(backup.appVersion, '0.2.1');
  assert.equal(backup.cards.length, cardsBefore);
  assert.equal(backup.cardStates.length, cardsBefore);
  assert.equal(backup.reviews.length, reviewsBefore);
  assert.ok(backup.settings.some((s) => s.key === 'requestRetention' && s.value === 0.95));
  assert.ok(backup.decks.some((d) => d.name === 'Probe (löschbar)'));
  await page.waitForFunction(() => document.getElementById('s-last-backup').textContent !== 'noch nie');
  const path = join(mkdtempSync(join(tmpdir(), 'estudar-')), shared.name);
  writeFileSync(path, shared.text);

  // Ohne Teilen-Blatt: Download als Ausweg, aber ehrlich – keine bestätigte Sicherung
  const lastBackup = await page.locator('#s-last-backup').textContent();
  await page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  assert.equal(download.suggestedFilename(), shared.name);
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.locator('#toast').textContent(), /^Teilen nicht möglich/);
  assert.equal(await page.locator('#s-last-backup').textContent(), lastBackup, 'Download zählt nicht als bestätigte Sicherung');

  // Deck löschen mit Rückfrage (im Probe-Deck liegen 20 Probekarten + das Paar „die Reise")
  const probeCards = await page.evaluate(async () => (await window.estudar.db.listCards('deck-probe')).length);
  assert.equal(probeCards, 22);
  await page.click('#tabs a[data-tab="decks"]');
  await page.waitForSelector('.deck[data-deck-id="deck-probe"]');
  await page.click('.deck[data-deck-id="deck-probe"] .deck-head');
  await page.click('.deck[data-deck-id="deck-probe"] .deck-actions button:has-text("Löschen")');
  await page.waitForSelector('#dialog:not([hidden])');
  assert.match(await page.locator('#dialog-text').textContent(), /Probe \(löschbar\)" mit 22 Karten löschen/);
  await page.click('#dialog-cancel');
  assert.equal(await count('cards'), cardsBefore, 'Abbrechen löscht nichts');
  await page.click('.deck[data-deck-id="deck-probe"] .deck-actions button:has-text("Löschen")');
  await page.click('#dialog-ok');
  await page.waitForFunction(() => !document.querySelector('.deck[data-deck-id="deck-probe"]'));
  assert.equal(await count('cards'), cardsBefore - probeCards);
  assert.equal(await count('cardStates'), cardsBefore - probeCards);
  assert.equal(await count('reviews'), reviewsBefore, 'Protokoll wird nie gelöscht');
  await page.reload();
  await open('#decks');
  await page.waitForSelector('.deck');
  assert.ok(!(await page.$('.deck[data-deck-id="deck-probe"]')), 'Probe-Deck kommt nach dem Löschen nicht wieder');

  // Import mit Vorschau, dann Ersetzen
  await open('#einstellungen');
  // Zusätzliche Bewertung nach dem Export, muss den Import überleben
  await page.evaluate(() => window.estudar.db.recordReview({ cardId: 'probe-v01', due: '2030-01-01T00:00:00.000Z', stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 9, lapses: 0, state: 2, last_review: '2026-09-08T00:00:00.000Z' }, { id: 'probe-v01:extra', cardId: 'probe-v01', ts: '2026-09-08T00:00:00.000Z', rating: 3, state: 2, intervalBefore: 1, intervalAfter: 2, durationMs: 1 }));
  await page.setInputFiles('#s-import', path);
  await page.waitForSelector('#import-preview:not([hidden])');
  const preview = await page.locator('#import-preview').textContent();
  assert.match(preview, new RegExp(`Datei: ${cardsBefore} Karten in 2 Decks, ${reviewsBefore} Protokolleinträge`));
  assert.match(preview, new RegExp(`Bestand jetzt: ${cardsBefore - probeCards} Karten in 1 Decks`));
  assert.match(preview, new RegExp(`Zusammenführen: ${probeCards} neue`));
  assert.match(preview, new RegExp(`Ersetzen: danach ${cardsBefore} Karten, 0 bisherige verschwinden`));
  await page.click('#btn-import-replace');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.click('#dialog-ok');
  await page.waitForFunction(() => document.getElementById('import-preview').hidden);
  assert.equal(await count('cards'), cardsBefore);
  assert.equal(await count('cardStates'), cardsBefore);
  assert.equal(await count('reviews'), reviewsBefore + 1, 'Protokoll: Datei ∪ lokal');
  assert.equal(await page.evaluate(() => window.estudar.settings.requestRetention), 0.95);
  await page.click('#tabs a[data-tab="decks"]');
  await page.waitForSelector('.deck[data-deck-id="deck-probe"]');
  assert.equal(await page.locator('.deck[data-deck-id="deck-probe"] .meta').textContent(), '22 Karten · 1 fällig', 'Lernfortschritt ist zurück (nur die zurückgestellte Gegenrichtung ist fällig)');

  // Zusammenführen: nichts Neues, nichts geht verloren
  await open('#einstellungen');
  await page.setInputFiles('#s-import', path);
  await page.waitForSelector('#btn-import-merge');
  await page.click('#btn-import-merge');
  await page.waitForFunction(() => document.getElementById('import-preview').hidden);
  assert.equal(await count('cards'), cardsBefore);

  // Kaputte Datei
  await page.setInputFiles('#s-import', { name: 'kaputt.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"x"}') });
  await page.waitForSelector('#import-preview .error');
  assert.match(await page.locator('#import-preview .error').textContent(), /Unbekanntes Format/);
});

test('Datenbank: ein ungültiger Datensatz bricht die ganze Transaktion ab – nichts wird gelöscht', async () => {
  await open('#einstellungen');
  const before = await page.evaluate(() => window.estudar.db.dumpAll());
  const message = await page.evaluate(async () => {
    try {
      await window.estudar.db.write({ clear: ['settings', 'cardStates'], puts: { cardStates: [{ cardId: 'x', due: '2026-01-01T00:00:00.000Z' }, { due: 'ohne Schlüssel' }] } });
      return 'kein Fehler';
    } catch (err) { return err.name; }
  });
  assert.notEqual(message, 'kein Fehler');
  const after = await page.evaluate(() => window.estudar.db.dumpAll());
  assert.deepEqual(after, before, 'clear() und die gültigen put()s dürfen nicht festgeschrieben werden');
});

test('Update: Hinweis statt Neuladen, nie während einer Session, Wechsel erst nach Antippen', async () => {
  await open();
  const cardsTotal = await count('cards');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.evaluate(() => { window.__marker = 'nicht neu geladen'; });
  const sw = readText('sw.js');
  assert.match(sw, /var VERSION = '0\.2\.1'/);
  server.override('sw.js', sw.replace("var VERSION = '0.2.1'", "var VERSION = '0.2.1-test'"));

  // Während einer Session: kein Hinweis
  await page.click('#btn-ueben');
  await page.waitForSelector('#screen-session:not([hidden])');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#update-hint').isHidden(), 'kein Hinweis während der Session');
  assert.equal(await page.evaluate(() => window.__marker), 'nicht neu geladen');

  // Session beenden → Hinweis erscheint, Seite ist nicht neu geladen
  await page.click('#btn-session-abbrechen');
  await waitForApp();
  await page.waitForSelector('#update-hint:not([hidden])');
  assert.equal(await page.evaluate(() => window.__marker), 'nicht neu geladen');
  const before = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('estudar-v')).sort());
  assert.deepEqual(before, ['estudar-v0.2.1', 'estudar-v0.2.1-test'], 'neue Fassung liegt vorgeladen bereit, alte läuft weiter');

  // Antippen → neue Fassung übernimmt, Seite lädt einmal neu
  await Promise.all([page.waitForNavigation(), page.click('#btn-update')]);
  await waitForApp();
  assert.equal(await page.evaluate(() => window.__marker), undefined, 'Seite wurde neu geladen');
  await page.waitForFunction(async () => (await caches.keys()).filter((k) => k.startsWith('estudar-v')).join() === 'estudar-v0.2.1-test', null, { timeout: 15000 });
  assert.equal(await count('cards'), cardsTotal, 'Daten überleben das Update');
  server.override('sw.js', null);
});

test('keine Konsolenfehler', () => {
  assert.deepEqual(consoleErrors, []);
});
