// Sprachausgabe (app/speech.js) ohne Browser: Stimmen bewerten, sprechen mit
// end-Ereignis und Watchdog, Zeitplan aus Zeitstempeln, stilles WAV. Uhr und
// Timer sind eine eigene Nachstellung, damit nichts wirklich wartet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANG_DE, LANG_PT, bestVoice, countVoices, describeVoice, estimateSpeechMs, isNoveltyVoice, langScore, normalizeLang,
  rankVoices, runSequence, silentWavDataUri, sortVoicesForDisplay, speak, speechState, stop, voiceQuality, waitForVoices, waitUntil, watchdogMs,
} from '../app/speech.js';

/* ---- Nachgestellte Uhr: Zeit läuft nur, wenn der Test sie vorstellt ---- */

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeClock(start = 1_000_000) {
  let t = start;
  const timers = new Map();
  let nextId = 0;
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = ++nextId; timers.set(id, { at: t + Math.max(0, ms), fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    pending: () => timers.size,
    /** Stellt die Uhr um `ms` vor und führt fällige Timer in Zeitreihenfolge aus, Promises dazwischen. */
    async advance(ms) {
      await flush(); // erst anstehende Promises laufen lassen – sie stellen womöglich noch Timer
      const target = t + ms;
      for (;;) {
        let next = null;
        for (const [id, entry] of timers) if (entry.at <= target && (!next || entry.at < next.entry.at)) next = { id, entry };
        if (!next) break;
        t = next.entry.at;
        timers.delete(next.id);
        next.entry.fn();
        await flush();
      }
      t = target;
      await flush();
    },
  };
}

/* ---- Stimmen, wie iOS sie meldet ---- */

const V = (name, lang, extra = {}) => ({ name, lang, localService: true, default: false, voiceURI: `com.apple.voice.compact.${lang}.${name}`, ...extra });
const IOS_VOICES = [
  V('Luciana', 'pt-BR'),
  V('Luciana', 'pt-BR', { voiceURI: 'com.apple.voice.enhanced.pt-BR.Luciana' }),
  V('Eddy', 'pt-BR', { voiceURI: 'com.apple.eloquence.pt-BR.Eddy' }),
  V('Rocko', 'pt-BR', { voiceURI: 'com.apple.eloquence.pt-BR.Rocko' }),
  V('Google português do Brasil', 'pt-BR', { localService: false, voiceURI: 'Google português do Brasil' }),
  V('Joana', 'pt-PT', { voiceURI: 'com.apple.voice.premium.pt-PT.Joana' }),
  V('Anna', 'de-DE', { voiceURI: 'com.apple.voice.premium.de-DE.Anna' }),
  V('Helena', 'de-DE', { voiceURI: 'com.apple.voice.enhanced.de-DE.Helena', default: true }),
  V('Grandma', 'de-DE', { voiceURI: 'com.apple.eloquence.de-DE.Grandma' }),
  V('Samantha', 'en-US'),
];

test('normalizeLang und langScore: Unterstrich, Groß-/Kleinschreibung, Region', () => {
  assert.equal(normalizeLang('pt_BR'), 'pt-br');
  assert.equal(normalizeLang(' DE-de '), 'de-de');
  assert.equal(normalizeLang(undefined), '');
  assert.equal(langScore('pt-BR', LANG_PT), 3, 'genau');
  assert.equal(langScore('pt_BR', 'pt-br'), 3, 'Unterstrich und Kleinschreibung sind egal');
  assert.equal(langScore('pt-PT', LANG_PT), 2, 'gleiche Sprache, andere Region');
  assert.equal(langScore('pt', LANG_PT), 1, 'nur Sprache');
  assert.equal(langScore('es-ES', LANG_PT), 0, 'fremd');
  assert.equal(langScore('', LANG_PT), 0);
  assert.equal(langScore('de-DE', LANG_DE), 3);
  assert.equal(langScore('de-AT', LANG_DE), 2);
});

test('voiceQuality und Spaßstimmen aus der Stimmkennung', () => {
  assert.equal(voiceQuality(IOS_VOICES[0]), 'compact');
  assert.equal(voiceQuality(IOS_VOICES[1]), 'enhanced');
  assert.equal(voiceQuality(IOS_VOICES[6]), 'premium');
  assert.equal(voiceQuality({ name: 'Google', voiceURI: 'Google' }), '');
  assert.equal(isNoveltyVoice(IOS_VOICES[2]), true, 'Eddy ist eine Spaßstimme');
  assert.equal(isNoveltyVoice(IOS_VOICES[8]), true, 'Grandma ist eine Spaßstimme');
  assert.equal(isNoveltyVoice({ name: 'Grandma (Deutsch)', voiceURI: 'x' }), true, 'Klammerzusatz zählt nicht');
  assert.equal(isNoveltyVoice(IOS_VOICES[0]), false);
});

test('rankVoices: genaue Region, lokal, Qualität, Spaßstimmen zuletzt', () => {
  const pt = rankVoices(IOS_VOICES, LANG_PT).map((v) => `${v.name}/${voiceQuality(v) || (v.localService ? 'lokal' : 'netz')}`);
  assert.deepEqual(pt, ['Luciana/enhanced', 'Luciana/compact', 'Eddy/lokal', 'Rocko/lokal', 'Google português do Brasil/netz', 'Joana/premium']);
  assert.equal(bestVoice(IOS_VOICES, LANG_PT).voiceURI, 'com.apple.voice.enhanced.pt-BR.Luciana');
  assert.equal(bestVoice(IOS_VOICES, LANG_DE).name, 'Anna', 'premium schlägt enhanced+Standard');
  assert.equal(bestVoice(IOS_VOICES, 'fr-FR'), null);
  assert.equal(bestVoice([], LANG_PT), null);
  assert.equal(bestVoice(IOS_VOICES.filter((v) => v.lang === 'pt-PT'), LANG_PT).name, 'Joana', 'ohne pt-BR ist pt-PT die Notlösung');
  const remoteOnly = [V('Netz', 'pt-BR', { localService: false, voiceURI: 'x' }), V('Gerät', 'pt-BR', { voiceURI: 'y' })];
  assert.equal(bestVoice(remoteOnly, LANG_PT).name, 'Gerät', 'lokal vor Netz');
  assert.equal(bestVoice(IOS_VOICES.filter((v) => v.name === 'Eddy' || v.name === 'Joana'), LANG_PT).name, 'Eddy', 'pt-BR-Spaßstimme vor pt-PT');
});

test('countVoices, sortVoicesForDisplay, describeVoice', () => {
  assert.deepEqual(countVoices(IOS_VOICES), { total: 10, ptBR: 5, deDE: 3, pt: 6, de: 3 });
  assert.deepEqual(countVoices([]), { total: 0, ptBR: 0, deDE: 0, pt: 0, de: 0 });
  const order = sortVoicesForDisplay(IOS_VOICES).map((v) => v.lang);
  assert.deepEqual(order, ['pt-BR', 'pt-BR', 'pt-BR', 'pt-BR', 'pt-BR', 'de-DE', 'de-DE', 'de-DE', 'pt-PT', 'en-US']);
  assert.equal(describeVoice(IOS_VOICES[1]), 'Luciana · pt-BR · lokal · enhanced');
  assert.equal(describeVoice(IOS_VOICES[4]), 'Google português do Brasil · pt-BR · aus dem Netz');
  assert.equal(describeVoice(IOS_VOICES[8]), 'Grandma · de-DE · lokal · Spaßstimme');
  assert.equal(describeVoice(null), 'keine');
});

test('waitForVoices: sofort, nach voiceschanged, nach Nachfrage, nach Frist leer', async () => {
  const clock = fakeClock();
  const opts = { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, timeoutMs: 3000, pollMs: 250 };
  assert.equal((await waitForVoices({ getVoices: () => IOS_VOICES }, opts)).length, 10);

  let list = [];
  const listeners = new Set();
  const synth = { getVoices: () => list, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const viaEvent = waitForVoices(synth, opts);
  await clock.advance(100);
  list = IOS_VOICES;
  for (const fn of listeners) fn();
  assert.equal((await viaEvent).length, 10, 'voiceschanged liefert die Liste');
  assert.equal(listeners.size, 0, 'Listener wird wieder entfernt');

  list = [];
  const viaPoll = waitForVoices(synth, opts);
  await clock.advance(600);
  list = IOS_VOICES; // ohne Ereignis – iOS meldet es nicht immer
  await clock.advance(300);
  assert.equal((await viaPoll).length, 10, 'Nachfrage findet die Liste auch ohne Ereignis');

  list = [];
  const empty = waitForVoices(synth, opts);
  await clock.advance(3100);
  assert.deepEqual(await empty, [], 'nach der Frist kommt die leere Liste');
  assert.equal(clock.pending(), 0, 'keine Timer bleiben stehen');
  assert.deepEqual(await waitForVoices(null, opts), []);
});

/* ---- Sprechen ---- */

class FakeUtterance {
  constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; }
}

function fakeSynth() {
  return {
    speaking: false, paused: false, pending: false,
    spoken: [], cancels: 0, resumes: 0,
    speak(u) { this.spoken.push(u); this.speaking = true; },
    cancel() { this.cancels += 1; this.speaking = false; },
    resume() { this.resumes += 1; this.paused = false; },
  };
}

test('estimateSpeechMs und watchdogMs wachsen mit dem Text und schrumpfen mit dem Tempo', () => {
  assert.ok(estimateSpeechMs('der Schlaf') < estimateSpeechMs('O sono também é treino, e o descanso faz parte do trabalho.'));
  assert.ok(estimateSpeechMs('Bom dia', 0.8) > estimateSpeechMs('Bom dia', 1.2));
  assert.equal(estimateSpeechMs('', 1), 600);
  assert.ok(watchdogMs('Bom dia') >= 4000 + 600, 'mindestens Grundfrist plus Schätzung');
  assert.equal(watchdogMs('x'.repeat(50), 1), Math.round((600 + 4000) * 1.5 + 4000));
});

test('speak: end-Ereignis liefert reason "end", Dauer ab start-Ereignis, Stimme und Tempo gesetzt', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  const events = [];
  const p = speak(synth, '  Bom dia!  ', { voice: IOS_VOICES[1], rate: 0.9, Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onEvent: (e) => events.push(e.type) });
  assert.equal(synth.spoken.length, 1);
  const u = synth.spoken[0];
  assert.equal(u.text, 'Bom dia!', 'Leerraum wird entfernt');
  assert.equal(u.voice, IOS_VOICES[1]);
  assert.equal(u.lang, 'pt-BR', 'lang kommt von der Stimme');
  assert.equal(u.rate, 0.9);
  await clock.advance(200);
  u.onstart();
  await clock.advance(1500);
  u.onboundary();
  u.onend();
  const r = await p;
  assert.equal(r.reason, 'end');
  assert.equal(r.error, '');
  assert.equal(r.startedAt - r.calledAt, 200);
  assert.equal(r.durationMs, 1500, 'Dauer vom start- bis zum end-Ereignis');
  assert.equal(r.boundaries, 1);
  assert.deepEqual(events, ['start', 'end']);
  assert.equal(clock.pending(), 0, 'Watchdog ist abgeräumt');
  assert.equal(synth.cancels, 0);
});

test('speak: ohne Stimme wird lang gesetzt; error "canceled"/"interrupted" heißt abgebrochen, andere Fehler bleiben Fehler', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  const base = { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  const p1 = speak(synth, 'Guten Morgen', { lang: LANG_DE, ...base });
  assert.equal(synth.spoken[0].voice, null);
  assert.equal(synth.spoken[0].lang, 'de-DE');
  synth.spoken[0].onstart();
  await clock.advance(300);
  synth.spoken[0].onerror({ error: 'interrupted' });
  const r1 = await p1;
  assert.equal(r1.reason, 'cancelled');
  assert.equal(r1.error, 'interrupted');
  assert.equal(r1.durationMs, 300);

  const p2 = speak(synth, 'x', base);
  synth.spoken[1].onerror({ error: 'canceled' });
  assert.equal((await p2).reason, 'cancelled');

  const p3 = speak(synth, 'x', base);
  synth.spoken[2].onerror({ error: 'synthesis-failed' });
  const r3 = await p3;
  assert.equal(r3.reason, 'error');
  assert.equal(r3.error, 'synthesis-failed');
  assert.equal(clock.pending(), 0);
});

test('speak: Watchdog – ohne end-Ereignis geht es nach der Frist weiter, cancel() räumt auf', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  const events = [];
  let settled = false;
  const p = speak(synth, 'Hängt', { timeoutMs: 1000, Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onEvent: (e) => events.push(e.type) });
  p.then(() => { settled = true; });
  await clock.advance(999);
  assert.equal(settled, false);
  await clock.advance(1);
  const r = await p;
  assert.equal(r.reason, 'watchdog');
  assert.equal(synth.cancels, 1, 'der hängende Auftrag wird abgebrochen');
  assert.deepEqual(events, ['watchdog']);
  assert.equal(r.durationMs, 1000, 'ohne start-Ereignis zählt ab dem Aufruf');
  // Ein spätes end-Ereignis ändert nichts mehr.
  synth.spoken[0].onend();
  assert.equal(r.reason, 'watchdog');
});

test('speak: das start-Ereignis stellt den Watchdog neu', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  let settled = false;
  const p = speak(synth, 'Langsam', { timeoutMs: 1000, Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  p.then(() => { settled = true; });
  await clock.advance(800);
  synth.spoken[0].onstart();
  await clock.advance(800);
  assert.equal(settled, false, '1600 ms nach dem Aufruf, aber erst 800 ms nach dem Start');
  await clock.advance(200);
  assert.equal(settled, true);
  assert.equal((await p).reason, 'watchdog');
});

test('speak: pausierter Synthesizer wird vorher fortgesetzt; leerer Text und fehlende Sprachausgabe enden sofort', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  synth.paused = true;
  const p = speak(synth, 'Weiter', { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(synth.resumes, 1, 'resume() vor speak()');
  assert.equal(synth.spoken.length, 1);
  synth.spoken[0].onend();
  const r = await p;
  assert.equal(r.reason, 'end');
  assert.equal(r.events[0].type, 'resume-before-speak');

  const empty = await speak(synth, '   ', { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(empty.reason, 'empty');
  assert.equal(synth.spoken.length, 1, 'nichts gesprochen');
  const none = await speak(null, 'x', { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(none.reason, 'unsupported');
  const noClass = await speak(synth, 'x', { Utterance: undefined, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(noClass.reason, 'unsupported');
  assert.equal(clock.pending(), 0);
});

test('speak: wirft speak() eine Ausnahme, wird sie zum Ergebnis, nie zum verworfenen Promise', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  synth.speak = () => { throw new Error('kaputt'); };
  const r = await speak(synth, 'x', { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(r.reason, 'error');
  assert.equal(r.error, 'kaputt');
  assert.equal(clock.pending(), 0);
});

test('speak: ein Fehler im Protokoll-Callback stört den Ablauf nicht', async () => {
  const clock = fakeClock();
  const synth = fakeSynth();
  const p = speak(synth, 'x', { Utterance: FakeUtterance, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onEvent: () => { throw new Error('Protokoll kaputt'); } });
  synth.spoken[0].onstart();
  synth.spoken[0].onend();
  assert.equal((await p).reason, 'end');
});

test('stop und speechState', () => {
  const synth = fakeSynth();
  assert.equal(speechState(synth), 'beendet');
  synth.pending = true;
  assert.equal(speechState(synth), 'wartet');
  synth.speaking = true;
  assert.equal(speechState(synth), 'spricht');
  synth.paused = true;
  assert.equal(speechState(synth), 'pausiert');
  assert.equal(speechState(null), 'nicht verfügbar');
  stop(synth);
  assert.equal(synth.cancels, 1);
  stop(null); // darf nicht werfen
  stop({ cancel() { throw new Error('x'); } });
});

/* ---- Zeitplan ---- */

test('waitUntil: wartet bis zum Zeitstempel, nicht länger; Abbruch liefert false', async () => {
  const clock = fakeClock(5000);
  const opts = { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  let done = false;
  waitUntil(5000 + 700, opts).then((ok) => { done = ok; });
  await clock.advance(699);
  assert.equal(done, false);
  await clock.advance(1);
  assert.equal(done, true);
  assert.equal(await waitUntil(1000, opts), true, 'vergangener Zeitpunkt: sofort');

  const ctrl = new AbortController();
  let aborted = null;
  waitUntil(clock.now() + 10_000, { ...opts, signal: ctrl.signal }).then((ok) => { aborted = ok; });
  await clock.advance(100);
  ctrl.abort();
  await flush();
  assert.equal(aborted, false);
  assert.equal(clock.pending(), 0, 'der Timer ist nach dem Abbruch weg');
  const already = new AbortController();
  already.abort();
  assert.equal(await waitUntil(clock.now() + 10, { ...opts, signal: already.signal }), false);
});

test('runSequence: Start aus Zeitstempeln – ein langer Satz verschiebt nur den nächsten, nicht den übernächsten', async () => {
  const clock = fakeClock(100_000);
  const items = [{ n: 1, ms: 1500 }, { n: 2, ms: 7000 }, { n: 3, ms: 1500 }, { n: 4, ms: 1500 }];
  const seen = [];
  const promise = runSequence(items, {
    intervalMs: 5000,
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    speakItem: (item) => new Promise((resolve) => clock.setTimeout(() => resolve({ reason: 'end', n: item.n }), item.ms)),
    onResult: (entry) => seen.push(entry.index),
  });
  await clock.advance(30_000);
  const run = await promise;
  assert.equal(run.aborted, false);
  assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.deepEqual(run.results.map((r) => r.calledAt - run.startAt), [0, 5000, 12_000, 15_000]);
  assert.deepEqual(run.results.map((r) => r.lateMs), [0, 0, 2000, 0], 'Satz 3 kommt sofort nach dem langen Satz 2, Satz 4 wieder zu seiner Zeit');
  assert.deepEqual(run.results.map((r) => r.result.n), [1, 2, 3, 4]);
  assert.equal(run.endedAt - run.startAt, 16_500);
  assert.equal(clock.pending(), 0);
});

test('runSequence: Abbruch über das Signal beendet die Folge nach dem laufenden Satz', async () => {
  const clock = fakeClock();
  const ctrl = new AbortController();
  const items = [1, 2, 3, 4];
  const promise = runSequence(items, {
    intervalMs: 5000,
    signal: ctrl.signal,
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    speakItem: (n) => new Promise((resolve) => clock.setTimeout(() => resolve({ n }), 1000)),
  });
  await clock.advance(5500); // Satz 2 spricht gerade
  ctrl.abort();
  await clock.advance(10_000);
  const run = await promise;
  assert.equal(run.aborted, true);
  assert.equal(run.results.length, 2, 'Satz 2 wird noch zu Ende gebracht, Satz 3 nicht mehr begonnen');
  assert.equal(clock.pending(), 0);
});

/* ---- Stilles Audio ---- */

test('silentWavDataUri: gültiger WAV-Kopf, 16 Bit mono, nur Nullen', () => {
  const uri = silentWavDataUri(1, 8000);
  assert.ok(uri.startsWith('data:audio/wav;base64,'));
  const bytes = Buffer.from(uri.slice('data:audio/wav;base64,'.length), 'base64');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.toString('ascii', 12, 16), 'fmt ');
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM');
  assert.equal(bytes.readUInt16LE(22), 1, 'mono');
  assert.equal(bytes.readUInt32LE(24), 8000, 'Abtastrate');
  assert.equal(bytes.readUInt32LE(28), 16_000, 'Bytes pro Sekunde');
  assert.equal(bytes.readUInt16LE(34), 16, 'Bits je Abtastwert');
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  assert.equal(bytes.readUInt32LE(40), 16_000, 'Datenlänge');
  assert.equal(bytes.length, 44 + 16_000);
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'RIFF-Länge');
  assert.ok(bytes.subarray(44).every((b) => b === 0), 'Stille');
  assert.equal(silentWavDataUri(0.5, 8000).length < uri.length, true);
});
