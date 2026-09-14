// Diagnoseseite (diagnose.html) im Chromium. Die VM hat keine Stimmen, deshalb
// wird die Sprachausgabe vor dem Laden nachgestellt: eine Stimmenliste wie auf
// iOS, Äußerungen mit start- und end-Ereignis. So sind Stimmenliste, Testsätze,
// Hörprobe, Stopp, Dauertest, Wake Lock, stilles Audio und das Protokoll als
// Ablauf prüfbar. Die echte Messung – CarPlay, Wake Lock nach App-Wechsel –
// macht der Nutzer auf dem iPhone.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.js';
import { readText } from './helpers/repo.js';

let server, browser;
before(async () => { server = await startStaticServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const VOICES = [
  { name: 'Luciana', lang: 'pt-BR', localService: true, default: false, voiceURI: 'com.apple.voice.enhanced.pt-BR.Luciana' },
  { name: 'Eddy', lang: 'pt-BR', localService: true, default: false, voiceURI: 'com.apple.eloquence.pt-BR.Eddy' },
  { name: 'Joana', lang: 'pt-PT', localService: true, default: false, voiceURI: 'com.apple.voice.compact.pt-PT.Joana' },
  { name: 'Anna', lang: 'de-DE', localService: true, default: false, voiceURI: 'com.apple.voice.premium.de-DE.Anna' },
  { name: 'Helena', lang: 'de-DE', localService: true, default: true, voiceURI: 'com.apple.voice.compact.de-DE.Helena' },
  { name: 'Samantha', lang: 'en-US', localService: true, default: false, voiceURI: 'com.apple.voice.compact.en-US.Samantha' },
];

/** Nachgestellte Web Speech API: Stimmen, Warteschlange, start/end, cancel → error "interrupted". */
const fakeSpeech = (voices) => `(() => {
  const listeners = [];
  class U { constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; } }
  const queue = [];
  let current = null;
  const synth = {
    speaking: false, pending: false, paused: false, calls: [], cancels: 0,
    voices: ${JSON.stringify(voices)},
    getVoices() { return this.voices; },
    fireVoicesChanged() { for (const fn of listeners) fn(); },
    speak(u) { this.calls.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.lang, rate: u.rate }); queue.push(u); this.pending = true; pump(); },
    cancel() { this.cancels += 1; queue.length = 0; this.pending = false; if (current) { const u = current; current = null; this.speaking = false; setTimeout(() => { if (u.onerror) u.onerror({ error: 'interrupted' }); }, 0); } },
    pause() {}, resume() {}, addEventListener(type, fn) { if (type === 'voiceschanged') listeners.push(fn); }, removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
  };
  function pump() {
    if (current || !queue.length) return;
    const u = queue.shift();
    current = u; synth.pending = queue.length > 0; synth.speaking = true;
    setTimeout(() => {
      if (current !== u) return;
      if (u.onstart) u.onstart({});
      setTimeout(() => { if (current !== u) return; current = null; synth.speaking = false; if (u.onend) u.onend({}); pump(); }, 20 + u.text.length);
    }, 5);
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
  window.__fakeSynth = synth;
})();`;

async function openDiagnose(voices, { viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript(fakeSpeech(voices));
  await page.goto(server.base + 'diagnose.html');
  await page.waitForFunction(() => window.diagnose && !/gesucht/.test(document.getElementById('voices-summary').textContent), null, { timeout: 15000 });
  return { context, page, errors };
}

const calls = (page) => page.evaluate(() => window.__fakeSynth.calls);
const logText = (page) => page.evaluate(() => document.getElementById('log').textContent);

test('Diagnoseseite: Stimmen mit Hervorhebung, beste Stimmen, Zustand, Protokoll', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    assert.equal(await page.title(), 'estudar – Diagnose');
    assert.equal(await page.locator('#diag-version').textContent(), JSON.parse(readText('package.json')).version);
    assert.equal(await page.locator('#st-mode').getAttribute('data-state'), 'browser');
    assert.match(await page.locator('#st-system').textContent(), /Chromium|kein iOS/);
    assert.equal(await page.locator('#voices-summary').textContent(), '6 Stimmen · pt-BR: 2 · de-DE: 2');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · enhanced (beste)');
    assert.equal(await page.locator('#voices-best-de').textContent(), 'Anna · de-DE · lokal · premium (beste)');
    assert.ok(await page.locator('#voices-hint-pt').isHidden(), 'mit pt-BR-Stimme kein Nachlade-Hinweis');

    // pt-BR und de-DE untereinander, je mit Auswahl, vollständiger Kennung und Systemstimme als letzter Wahl.
    const group = (id) => page.$$eval(`#${id} li`, (els) => els.map((li) => ({ name: li.querySelector('b').textContent, key: li.querySelector('code')?.textContent ?? null, checked: li.querySelector('input')?.checked ?? null, best: li.classList.contains('best'), chosen: li.classList.contains('chosen') })));
    const pt = await group('voices-pt');
    assert.deepEqual(pt.map((r) => r.name), ['Eddy', 'Luciana', 'Systemstimme für pt-BR']);
    assert.deepEqual(pt.map((r) => r.key), ['com.apple.eloquence.pt-BR.Eddy', 'com.apple.voice.enhanced.pt-BR.Luciana', null], 'die Kennung steht in jeder Zeile');
    assert.deepEqual(pt.map((r) => r.checked), [false, true, false], 'ohne gemerkte Wahl ist der App-Vorschlag angekreuzt');
    assert.deepEqual(pt.map((r) => r.best), [false, true, false]);
    assert.deepEqual(pt.map((r) => r.chosen), [false, true, false]);
    const de = await group('voices-de');
    assert.deepEqual(de.map((r) => [r.name, r.checked]), [['Anna', true], ['Helena', false], ['Systemstimme für de-DE', false]]);

    // Die vollständige Liste bleibt, aufklappbar.
    assert.equal(await page.locator('#voices-all-count').textContent(), '6');
    const rows = await page.$$eval('#voices-list li', (els) => els.map((li) => ({ name: li.querySelector('b').textContent, meta: li.querySelector('span').textContent, hl: li.classList.contains('hl'), best: li.classList.contains('best') })));
    assert.deepEqual(rows.map((r) => r.name), ['Eddy', 'Luciana', 'Anna', 'Helena', 'Joana', 'Samantha'], 'pt-BR, de-DE, übriges Portugiesisch, Rest');
    assert.deepEqual(rows.map((r) => r.hl), [true, true, true, true, false, false], 'pt-BR und de-DE sind hervorgehoben');
    assert.deepEqual(rows.filter((r) => r.best).map((r) => r.name), ['Luciana', 'Anna']);
    assert.equal(rows[1].meta, 'pt-BR · lokal · enhanced');
    assert.equal(rows[3].meta, 'de-DE · lokal · compact · Standard');
    assert.equal(await page.locator('#st-speech').textContent(), 'beendet');
    assert.match(await page.locator('#st-height').textContent(), /^844 px sichtbar · Fenster 844 px/);
    assert.equal(await page.locator('#st-session').textContent(), 'API nicht vorhanden');
    assert.ok(await page.locator('#row-session').isHidden(), 'ohne navigator.audioSession keinen Schalter dafür');
    assert.equal(await page.locator('#st-media').textContent(), '„estudar Testton" gesetzt · none');
    await page.waitForFunction(() => /3,1 s/.test(document.getElementById('st-tone').textContent)); // Metadaten der Datei geladen
    assert.match(await page.locator('#st-tone').textContent(), /^pausiert · 0,0 \/ 3,1 s · readyState [1-4]/);
    const log = await logText(page);
    assert.match(log, /Diagnose gestartet · Fassung \d+\.\d+\.\d+ · .* · im Browser · speechSynthesis vorhanden · .* · mediaSession vorhanden/);
    assert.match(log, /Media Session: Titel „estudar Testton", Interpret „estudar Diagnose" gesetzt/);
    assert.match(log, /Stimmen \(beim Start, nach \d+,\d\d s\): 6 gefunden · pt-BR 2 · de-DE 2 · genutzt pt-BR: Luciana · pt-BR · lokal · enhanced \(beste\) · de-DE: Anna · de-DE · lokal · premium \(beste\)/);
    // Jede pt-BR- und de-DE-Stimme mit vollständiger Kennung auf eigener Zeile, ★ für den App-Vorschlag.
    assert.match(log, /\n[^\n]*  · Eddy \[pt-BR, lokal\] com\.apple\.eloquence\.pt-BR\.Eddy\n/);
    assert.match(log, /  ★ Luciana \[pt-BR, lokal, enhanced\] com\.apple\.voice\.enhanced\.pt-BR\.Luciana\n/);
    assert.match(log, /  ★ Anna \[de-DE, lokal, premium\] com\.apple\.voice\.premium\.de-DE\.Anna\n/);
    assert.match(log, /  · Helena \[de-DE, lokal, compact\] com\.apple\.voice\.compact\.de-DE\.Helena\n/);
    assert.match(log, /weitere pt\/de: Joana \[pt-PT, lokal, compact\] com\.apple\.voice\.compact\.pt-PT\.Joana/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Testsätze mit bester Stimme und gewähltem Tempo, Hörprobe, Stopp', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    await page.click('#btn-test-pt');
    await page.waitForFunction(() => /Ende nach/.test(document.getElementById('test-status').textContent));
    let c = await calls(page);
    assert.equal(c.length, 1);
    assert.deepEqual(c[0], { text: 'Bom dia! Hoje eu vou ao mercado comprar pão, café e frutas.', voice: 'Luciana', lang: 'pt-BR', rate: 0.9 });
    assert.match(await page.locator('#test-status').textContent(), /^Test pt-BR: Ende nach \d+,\d\d s \(end-Ereignis\)$/);
    let log = await logText(page);
    assert.match(log, /Test pt-BR: speak\(\) „Bom dia! .*" · Stimme Luciana · pt-BR · lokal · enhanced · com\.apple\.voice\.enhanced\.pt-BR\.Luciana · Tempo 0,9/);
    assert.match(log, /Test pt-BR: spricht \(start-Ereignis nach \d+,\d\d s\)/);

    await page.click('#rate-seg label:has(input[value="1"])'); // das Eingabefeld selbst ist unsichtbar, das Label trägt den Text
    await page.click('#btn-test-de');
    await page.waitForFunction(() => /Test de-DE: Ende nach/.test(document.getElementById('test-status').textContent));
    c = await calls(page);
    assert.deepEqual(c[1], { text: 'Guten Morgen! Heute fahre ich mit dem Auto zur Arbeit und höre Vokabeln.', voice: 'Anna', lang: 'de-DE', rate: 1 });

    // Hörprobe je Stimme: Joana (pt-PT) aus der aufklappbaren Gesamtliste bekommt den portugiesischen Satz mit genau dieser Stimme.
    await page.click('details.all-voices summary');
    await page.click('#voices-list li:nth-child(5) .play');
    await page.waitForFunction(() => /Hörprobe Joana: Ende nach/.test(document.getElementById('test-status').textContent));
    c = await calls(page);
    assert.deepEqual(c[2], { text: 'Bom dia, tudo bem?', voice: 'Joana', lang: 'pt-PT', rate: 1 });

    // Stopp bricht ab: die laufende Äußerung endet mit "interrupted".
    await page.click('#btn-test-pt');
    await page.waitForFunction(() => /spricht/.test(document.getElementById('log').textContent.split('\n').slice(-2).join('\n')));
    await page.click('#btn-stop');
    await page.waitForFunction(() => /Test pt-BR: abgebrochen nach \d+,\d\d s \(interrupted\)/.test(document.getElementById('log').textContent));
    assert.equal(await page.evaluate(() => window.__fakeSynth.cancels >= 1), true);
    log = await logText(page);
    assert.match(log, /Stopp: cancel\(\)/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Dauertest wechselt die Sprache, hält den Zeitplan und fasst zusammen', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    const before = (await calls(page)).length;
    const out = await page.evaluate(() => window.diagnose.runEndurance({ count: 4, intervalMs: 400 }));
    assert.equal(out.stats.spoken, 4);
    assert.equal(out.stats.ends, 4);
    assert.equal(out.stats.watchdog, 0);
    assert.equal(out.run.aborted, false);
    assert.ok(out.run.results.every((r) => r.lateMs >= 0 && r.lateMs < 150), `Verspätung klein: ${out.run.results.map((r) => r.lateMs)}`);
    assert.ok(out.run.endedAt - out.run.startAt >= 1200, 'drei Abstände à 400 ms');
    const c = (await calls(page)).slice(before);
    assert.deepEqual(c.map((x) => [x.lang, x.voice]), [['de-DE', 'Anna'], ['pt-BR', 'Luciana'], ['de-DE', 'Anna'], ['pt-BR', 'Luciana']]);
    assert.deepEqual(c.map((x) => x.text), ['Satz 1: Guten Morgen.', 'Frase 2: Bom dia, tudo bem?', 'Satz 3: Heute ist es warm.', 'Frase 4: Eu gosto de café.']);
    assert.match(await page.locator('#endurance-status').textContent(), /^Dauertest fertig: 4 von 4 gesprochen · end-Ereignisse 4 · Watchdog 0 · abgebrochen 0 · Fehler 0 · größte Verspätung \d+,\d\d s · Dauer \d+,\d\d s$/);
    const log = await logText(page);
    assert.match(log, /Dauertest: 4 Sätze alle 0\.4 s · de-DE Anna · de-DE · lokal · premium \(beste\) · pt-BR Luciana · pt-BR · lokal · enhanced \(beste\) · Tempo 0,9/);
    assert.match(log, /Satz 1\/4 \(de\): Plan \+0,\d\d s · start nach 0,\d\d s · Ende nach \d+,\d\d s \(end-Ereignis\)/);
    assert.match(log, /Satz 4\/4 \(pt\): Plan/);

    // Stopp während des Laufs: bricht ab, Zusammenfassung sagt es.
    const running = page.evaluate(() => window.diagnose.runEndurance({ count: 10, intervalMs: 400 }));
    await page.waitForFunction(() => /Satz 2 von 10/.test(document.getElementById('endurance-status').textContent));
    await page.click('#btn-endurance-stop');
    const stopped = await running;
    assert.equal(stopped.run.aborted, true);
    assert.ok(stopped.stats.spoken < 10);
    assert.match(await page.locator('#endurance-status').textContent(), /^Dauertest abgebrochen: \d von 10 gesprochen/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Wake Lock, stilles Audio in Schleife, Protokoll bleibt nach Neuladen', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    await page.click('#btn-wakelock');
    await page.waitForFunction(() => /Wake Lock \(Knopf\): /.test(document.getElementById('log').textContent));
    const wl = await page.locator('#wl-status').textContent();
    assert.notEqual(wl, 'nicht angefordert');
    assert.match(wl, /^(aktiv seit \d\d:\d\d:\d\d|Anforderung gescheitert|nicht unterstützt)$/);
    assert.equal(await page.locator('#st-wakelock').textContent(), wl, 'beide Anzeigen sagen dasselbe');

    await page.click('label.switch-row:has(#sw-silent) .switch'); // der Schalter ist das sichtbare Element, nicht das Kontrollkästchen
    await page.waitForFunction(() => /Stilles Audio: (läuft|play\(\) gescheitert)/.test(document.getElementById('log').textContent));
    const audio = await page.evaluate(() => { const a = window.diagnose.state.silent; return { loop: a.loop, src: a.src.slice(0, 22), paused: a.paused }; });
    assert.equal(audio.loop, true);
    assert.equal(audio.src, 'data:audio/wav;base64,');
    if (!audio.paused) {
      await page.waitForFunction(() => /^läuft \(\d+,\d s\)$/.test(document.getElementById('st-audio').textContent));
      await page.click('label.switch-row:has(#sw-silent) .switch');
      await page.waitForFunction(() => document.getElementById('st-audio').textContent === 'pausiert');
      assert.match(await logText(page), /Stilles Audio: aus/);
    }

    // Protokoll überlebt das Neuladen (localStorage) und wird mit "Leeren" gelöscht.
    await page.reload();
    await page.waitForFunction(() => window.diagnose && !/gesucht/.test(document.getElementById('voices-summary').textContent), null, { timeout: 15000 });
    const log = await logText(page);
    assert.equal((log.match(/Diagnose gestartet/g) || []).length, 2, 'alter und neuer Start stehen im Protokoll');
    assert.match(log, /Wake Lock \(Knopf\)/);
    await page.click('#btn-log-clear');
    const cleared = await logText(page);
    assert.equal((cleared.match(/Diagnose gestartet/g) || []).length, 0);
    assert.match(cleared, /Protokoll geleert/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Stimmwahl mit Hörprobe wird gemerkt, Systemstimme setzt keine Stimme, verschwundene Wahl fällt zurück', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    // Eddy wählen (Tippen auf die Zeile): Testsatz und Anzeige folgen, Protokoll nennt die Kennung.
    await page.click('#voices-pt li:nth-child(1) .v-name');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Eddy · pt-BR · lokal · Spaßstimme (gewählt)');
    assert.deepEqual(await page.$$eval('#voices-pt li input', (els) => els.map((e) => e.checked)), [true, false, false]);
    assert.match(await logText(page), /Stimme pt-BR gewählt: Eddy · pt-BR · lokal · Spaßstimme \(gewählt\) · com\.apple\.eloquence\.pt-BR\.Eddy \(gemerkt\)/);
    await page.click('#btn-test-pt');
    await page.waitForFunction(() => /Test pt-BR: Ende nach/.test(document.getElementById('test-status').textContent));
    assert.equal((await calls(page)).at(-1).voice, 'Eddy');

    // Hörprobe der Systemstimme spricht ohne Stimme, nur mit Sprache; sie wählen merkt "system".
    await page.click('#voices-de li:nth-child(3) .play');
    await page.waitForFunction(() => /Hörprobe Systemstimme de-DE: Ende nach/.test(document.getElementById('test-status').textContent));
    assert.deepEqual((await calls(page)).at(-1), { text: 'Guten Morgen, wie geht es dir?', voice: null, lang: 'de-DE', rate: 0.9 });
    await page.click('#voices-de li:nth-child(3) .v-name');
    assert.equal(await page.locator('#voices-best-de').textContent(), 'Systemstimme (keine Stimme gesetzt, nur die Sprache)');
    await page.click('#btn-test-de');
    await page.waitForFunction(() => /Test de-DE: Ende nach/.test(document.getElementById('test-status').textContent));
    assert.deepEqual((await calls(page)).at(-1), { text: 'Guten Morgen! Heute fahre ich mit dem Auto zur Arbeit und höre Vokabeln.', voice: null, lang: 'de-DE', rate: 0.9 });
    assert.match(await logText(page), /Test de-DE: speak\(\) .* · Stimme Systemstandard für de-DE/);

    // Nach dem Neuladen steht die Wahl noch (localStorage), auch für den Dauertest.
    await page.reload();
    await page.waitForFunction(() => window.diagnose && !/gesucht/.test(document.getElementById('voices-summary').textContent), null, { timeout: 15000 });
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Eddy · pt-BR · lokal · Spaßstimme (gewählt)');
    assert.equal(await page.locator('#voices-best-de').textContent(), 'Systemstimme (keine Stimme gesetzt, nur die Sprache)');
    assert.deepEqual(await page.$$eval('#voices-pt li', (els) => els.map((li) => li.classList.contains('chosen'))), [true, false, false]);
    assert.deepEqual(await page.$$eval('#voices-de li', (els) => els.map((li) => li.classList.contains('chosen'))), [false, false, true]);
    const out = await page.evaluate(() => window.diagnose.runEndurance({ count: 2, intervalMs: 300 }));
    assert.equal(out.stats.ends, 2);
    assert.deepEqual((await calls(page)).slice(-2).map((x) => [x.lang, x.voice]), [['de-DE', null], ['pt-BR', 'Eddy']]);

    // Verschwindet die gewählte Stimme aus der Liste, gilt wieder der App-Vorschlag – mit Hinweis.
    await page.evaluate(() => { window.__fakeSynth.voices = window.__fakeSynth.voices.filter((v) => v.name !== 'Eddy'); });
    await page.click('#btn-voices-reload');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · enhanced (beste)');
    assert.match(await page.locator('#voices-pt li:last-child').textContent(), /gemerkte Wahl „com\.apple\.eloquence\.pt-BR\.Eddy" ist nicht \(mehr\) in der Liste/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Stimmliste neu einlesen – Knopf, voiceschanged und Rückkehr in die Seite melden Anzahl und geänderte Kennungen', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    await page.click('#btn-voices-reload');
    let log = await logText(page);
    assert.match(log, /Stimmliste neu einlesen: getVoices\(\)\n[^\n]*Stimmen \(Knopf\): 6 gefunden · pt-BR 2 · de-DE 2/);
    assert.match(log, /Kennungen unverändert \(6 wie zuvor\)/);

    // Eine nachgeladene Fassung derselben Stimme (gleicher Name, andere Kennung) kommt per voiceschanged dazu.
    await page.evaluate(() => {
      window.__fakeSynth.voices = [...window.__fakeSynth.voices, { name: 'Luciana', lang: 'pt-BR', localService: true, default: false, voiceURI: 'com.apple.voice.premium.pt-BR.Luciana' }];
      window.__fakeSynth.fireVoicesChanged();
    });
    await page.waitForFunction(() => /voiceschanged/.test(document.getElementById('log').textContent));
    log = await logText(page);
    assert.match(log, /Stimmen \(voiceschanged-Ereignis\): 7 gefunden · pt-BR 3/);
    assert.match(log, /Kennungen GEÄNDERT: 1 neu, 0 weg\n[^\n]*  \+ Luciana \[pt-BR, lokal, premium\] com\.apple\.voice\.premium\.pt-BR\.Luciana/);
    assert.equal(await page.locator('#voices-summary').textContent(), '7 Stimmen · pt-BR: 3 · de-DE: 2');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · premium (beste)', 'die bessere Fassung wird der Vorschlag');
    const pt = await page.$$eval('#voices-pt li', (els) => els.map((li) => [li.querySelector('b').textContent, li.querySelector('code')?.textContent ?? null, li.classList.contains('best')]));
    assert.deepEqual(pt, [['Eddy', 'com.apple.eloquence.pt-BR.Eddy', false], ['Luciana', 'com.apple.voice.enhanced.pt-BR.Luciana', false], ['Luciana', 'com.apple.voice.premium.pt-BR.Luciana', true], ['Systemstimme für pt-BR', null, false]], 'beide Fassungen stehen untereinander, an der Kennung unterscheidbar');
    // Die bessere lässt sich wählen – die andere bleibt wählbar.
    await page.click('#voices-pt li:nth-child(2) .v-name');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · enhanced (gewählt)');
    await page.click('#voices-pt li:nth-child(3) .v-name');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · premium (gewählt)');

    // Ohne Ereignis (so macht es iOS oft): die Rückkehr in die Seite liest die Liste neu.
    await page.evaluate(() => { window.__fakeSynth.voices = window.__fakeSynth.voices.filter((v) => v.name !== 'Helena'); });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    log = await logText(page);
    assert.match(log, /Seite wieder sichtbar – Wake Lock war nicht angefordert/);
    assert.match(log, /Stimmen \(nach Rückkehr in die Seite\): 6 gefunden · pt-BR 3 · de-DE 1/);
    assert.match(log, /Kennungen GEÄNDERT: 0 neu, 1 weg\n[^\n]*  − Helena \[de-DE, lokal, compact\] com\.apple\.voice\.compact\.de-DE\.Helena/);
    // Eine zwischendurch leere Liste (iOS-Eigenart) löscht die Wahl nicht.
    await page.evaluate(() => { window.__fakeSynth.voices = []; window.diagnose.rereadVoices('Probe leer'); });
    assert.match(await logText(page), /Stimmen \(Probe leer\): getVoices\(\) leer gemeldet – bisherige Liste \(6\) bleibt/);
    assert.equal(await page.locator('#voices-summary').textContent(), '6 Stimmen · pt-BR: 3 · de-DE: 1');
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · premium (gewählt)');
    await page.evaluate(() => { window.__fakeSynth.voices = window.diagnose.state.voices; });

    // Unverändert: die Rückkehr protokolliert die Stimmen nicht noch einmal.
    const lines = (await logText(page)).split('\n').length;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const after = (await logText(page)).split('\n');
    assert.equal(after.length, lines + 1, 'nur die Zeile „Seite wieder sichtbar"');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Wake Lock wird nach der Rückkehr in die Seite automatisch neu angefordert', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    await page.click('#btn-wakelock');
    await page.waitForFunction(() => /Wake Lock \(Knopf\): /.test(document.getElementById('log').textContent));
    const first = await page.locator('#wl-status').textContent();
    if (/^aktiv seit/.test(first)) {
      // Wie iOS beim Wechsel in den Hintergrund: die Sperre wird freigegeben.
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return window.diagnose.state.wake.sentinel.release(); });
      await page.waitForFunction(() => /Wake Lock: freigegeben \(Seite im Hintergrund\)/.test(document.getElementById('log').textContent));
      assert.match(await page.locator('#wl-status').textContent(), /^freigegeben \d\d:\d\d:\d\d \(beim Wechsel in den Hintergrund\)$/);
    }
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => /Wake Lock \(automatisch nach Rückkehr\): /.test(document.getElementById('log').textContent));
    const log = await logText(page);
    assert.match(log, /Seite wieder sichtbar – Wake Lock (steht NICHT mehr|steht noch)/);
    if (/^aktiv seit/.test(first)) {
      assert.match(log, /Seite wieder sichtbar – Wake Lock steht NICHT mehr/);
      assert.match(log, /Wake Lock \(automatisch nach Rückkehr\): aktiv/);
      assert.match(await page.locator('#wl-status').textContent(), /^aktiv seit/);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite: Testdatei über <audio> spielt bis zum ended-Ereignis, Media Session gesetzt, Stopp, beides nacheinander', async () => {
  const { context, page, errors } = await openDiagnose(VOICES);
  try {
    await page.click('#btn-tone');
    await page.waitForFunction(() => /Testdatei: Ende nach/.test(document.getElementById('tone-status').textContent), null, { timeout: 20000 });
    assert.match(await page.locator('#tone-status').textContent(), /^Testdatei: Ende nach [23],\d\d s \(ended-Ereignis\)$/);
    assert.match(await page.locator('#st-tone').textContent(), /^zu Ende · 3,1 \/ 3,1 s · readyState 4 \(ganz geladen\)/);
    let log = await logText(page);
    assert.match(log, /Testdatei: play\(\) · vorher pausiert · 0,0 \/ 3,1 s/);
    assert.match(log, /Testdatei: play\(\) erfüllt – Wiedergabe läuft · spielt/);
    assert.match(log, /Testdatei: playing-Ereignis nach \d+,\d\d s · readyState \d/);
    assert.match(log, /Testdatei: ended-Ereignis bei 3,10 s \(Dauer 3,10 s\)/);
    assert.match(log, /Testdatei: Ende nach [23],\d\d s \(ended-Ereignis\) · nachher zu Ende/);
    assert.equal(await page.evaluate(() => navigator.mediaSession.metadata.title), 'estudar Testton');
    assert.equal(await page.evaluate(() => navigator.mediaSession.metadata.artist), 'estudar Diagnose');
    assert.equal(await page.evaluate(() => window.__fakeSynth.calls.length), 0, 'die Datei läuft ohne Sprachsynthese');

    // Stopp mitten in der Wiedergabe.
    await page.click('#btn-tone');
    await page.waitForFunction(() => document.getElementById('st-tone').textContent.startsWith('spielt'));
    await page.click('#btn-tone-stop');
    await page.waitForFunction(() => /Testdatei: gestoppt nach/.test(document.getElementById('tone-status').textContent));
    log = await logText(page);
    assert.match(log, /Stopp: Datei und Sprachausgabe/);
    assert.doesNotMatch(log, /vom System/, 'ein Stopp von der Seite gilt nicht als Pause vom System');

    // Läuft die Datei schon, bricht „Beides nacheinander" ab, statt die Sprache darüberzulegen.
    const first = page.evaluate(() => window.diagnose.playTone());
    await page.waitForFunction(() => document.getElementById('st-tone').textContent.startsWith('spielt'));
    const refused = await page.evaluate(() => window.diagnose.playBoth());
    assert.deepEqual(refused, { file: { reason: 'busy', durationMs: 0 }, spoken: null });
    assert.match(await page.locator('#tone-status').textContent(), /erst die laufende Datei stoppen/);
    await page.click('#btn-tone-stop');
    assert.equal((await first).reason, 'stopped');
    assert.match(await logText(page), /pause-Ereignis bei \d,\d\d s \(Stopp von der Seite\)/);

    // Beides nacheinander: erst die Datei bis zum Ende, dann „Eins, zwei, drei" mit der de-DE-Stimme.
    const out = await page.evaluate(() => window.diagnose.playBoth());
    assert.equal(out.file.reason, 'ended');
    assert.equal(out.spoken.reason, 'end');
    const c = await calls(page);
    assert.deepEqual(c.at(-1), { text: 'Eins, zwei, drei.', voice: 'Anna', lang: 'de-DE', rate: 0.9 });
    assert.match(await page.locator('#tone-status').textContent(), /^Beides nacheinander fertig: Datei zu Ende gespielt · Sprache Ende nach \d+,\d\d s \(end-Ereignis\)$/);
    log = await logText(page);
    const iFile = log.indexOf('Beides 1/2 Datei: ended-Ereignis');
    const iSpeech = log.indexOf('Beides 2/2 Sprache: speak()');
    assert.ok(iFile > 0 && iSpeech > iFile, 'die Sprache beginnt erst nach dem Ende der Datei');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite ohne pt-BR-Stimme: Hinweis zum Nachladen, Testsatz mit Systemstandard für pt-BR', async () => {
  const { context, page, errors } = await openDiagnose(VOICES.filter((v) => v.lang === 'de-DE'));
  try {
    assert.equal(await page.locator('#voices-summary').textContent(), '2 Stimmen · pt-BR: 0 · de-DE: 2');
    assert.ok(await page.locator('#voices-hint-pt').isVisible(), 'Nachlade-Hinweis sichtbar');
    assert.match(await page.locator('#voices-hint-pt').textContent(), /Bedienungshilfen → Gesprochene Inhalte → Stimmen/);
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'keine');
    assert.equal(await page.locator('#voices-pt li').first().textContent(), 'keine pt-BR-Stimme gemeldet');
    await page.click('#btn-test-pt');
    await page.waitForFunction(() => /Ende nach/.test(document.getElementById('test-status').textContent));
    const c = await calls(page);
    assert.equal(c[0].voice, null);
    assert.equal(c[0].lang, 'pt-BR', 'ohne Stimme wird wenigstens die Sprache gesetzt');
    assert.match(await logText(page), /Stimme Systemstandard für pt-BR/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Diagnoseseite ganz ohne Stimmen (wie Chromium in der VM): keine Fehler, klare Anzeige', async () => {
  const { context, page, errors } = await openDiagnose([]);
  try {
    assert.equal(await page.locator('#voices-summary').textContent(), 'Keine Stimmen gefunden.');
    assert.ok(await page.locator('#voices-hint-pt').isVisible());
    assert.equal(await page.$$eval('#voices-list li', (els) => els.length), 0);
    assert.equal(await page.$$eval('#voices-pt li', (els) => els.length), 2, 'Hinweiszeile und Systemstimme');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
