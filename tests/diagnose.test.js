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
  const voices = ${JSON.stringify(voices)};
  class U { constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; } }
  const queue = [];
  let current = null;
  const synth = {
    speaking: false, pending: false, paused: false, calls: [], cancels: 0,
    getVoices: () => voices,
    speak(u) { this.calls.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.lang, rate: u.rate }); queue.push(u); this.pending = true; pump(); },
    cancel() { this.cancels += 1; queue.length = 0; this.pending = false; if (current) { const u = current; current = null; this.speaking = false; setTimeout(() => { if (u.onerror) u.onerror({ error: 'interrupted' }); }, 0); } },
    pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
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
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'Luciana · pt-BR · lokal · enhanced');
    assert.equal(await page.locator('#voices-best-de').textContent(), 'Anna · de-DE · lokal · premium');
    assert.ok(await page.locator('#voices-hint-pt').isHidden(), 'mit pt-BR-Stimme kein Nachlade-Hinweis');
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
    const log = await logText(page);
    assert.match(log, /Diagnose gestartet · Fassung \d+\.\d+\.\d+ · .* · im Browser · speechSynthesis vorhanden/);
    assert.match(log, /Stimmen \(beim Start, nach \d+,\d\d s\): 6 gefunden · pt-BR 2 · de-DE 2 · beste pt-BR: Luciana · pt-BR · lokal · enhanced/);
    assert.match(log, /Portugiesisch: Eddy \[pt-BR, lokal, com\.apple\.eloquence\.pt-BR\.Eddy\]; Luciana \[pt-BR, lokal, enhanced, com\.apple\.voice\.enhanced\.pt-BR\.Luciana\]; Joana \[pt-PT/);
    assert.match(log, /Deutsch: Anna \[de-DE, lokal, premium/);
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
    assert.match(log, /Test pt-BR: speak\(\) „Bom dia! .*" · Stimme Luciana · pt-BR · lokal · enhanced · Tempo 0,9/);
    assert.match(log, /Test pt-BR: spricht \(start-Ereignis nach \d+,\d\d s\)/);

    await page.click('#rate-seg label:has(input[value="1"])'); // das Eingabefeld selbst ist unsichtbar, das Label trägt den Text
    await page.click('#btn-test-de');
    await page.waitForFunction(() => /Test de-DE: Ende nach/.test(document.getElementById('test-status').textContent));
    c = await calls(page);
    assert.deepEqual(c[1], { text: 'Guten Morgen! Heute fahre ich mit dem Auto zur Arbeit und höre Vokabeln.', voice: 'Anna', lang: 'de-DE', rate: 1 });

    // Hörprobe je Stimme: Joana (pt-PT) bekommt den portugiesischen Satz mit genau dieser Stimme.
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
    assert.match(log, /Dauertest: 4 Sätze alle 0\.4 s · de-DE Anna · de-DE · lokal · premium · pt-BR Luciana · pt-BR · lokal · enhanced · Tempo 0,9/);
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

test('Diagnoseseite ohne pt-BR-Stimme: Hinweis zum Nachladen, Testsatz mit Systemstandard für pt-BR', async () => {
  const { context, page, errors } = await openDiagnose(VOICES.filter((v) => v.lang === 'de-DE'));
  try {
    assert.equal(await page.locator('#voices-summary').textContent(), '2 Stimmen · pt-BR: 0 · de-DE: 2');
    assert.ok(await page.locator('#voices-hint-pt').isVisible(), 'Nachlade-Hinweis sichtbar');
    assert.match(await page.locator('#voices-hint-pt').textContent(), /Bedienungshilfen → Gesprochene Inhalte → Stimmen/);
    assert.equal(await page.locator('#voices-best-pt').textContent(), 'keine');
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
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
