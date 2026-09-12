// estudar – Sprachausgabe über die Web Speech API des Browsers (speechSynthesis).
//
// Keine Bibliothek, keine Audiodateien: iOS liefert die Stimmen, die App wählt
// sie aus und spricht Text. Dieses Modul kennt kein DOM. Synthesizer, Utterance-
// Klasse, Uhr und Timer werden hineingereicht (Standard: die des Browsers), damit
// die Node-Tests sie nachstellen können.
//
// Genutzt von der Diagnoseseite (Phase 3, Teil A) und später vom Fahrmodus:
// Stimmen finden und bewerten, eine Äußerung sprechen und ihr Ende verlässlich
// melden – per end-Ereignis und, wenn das ausbleibt, per Watchdog – sowie
// Sätze nach einem Zeitplan aus Zeitstempeln sprechen (kein Drift).

export const LANG_PT = 'pt-BR';
export const LANG_DE = 'de-DE';

/* =========================================================================
 * Sprachkennungen und Stimmen
 * ========================================================================= */

/** 'pt_BR' → 'pt-br'. Safari schrieb die Kennung früher mit Unterstrich. */
export function normalizeLang(lang) {
  return String(lang || '').trim().replace(/_/g, '-').toLowerCase();
}

/**
 * Wie gut passt eine Stimme zur gewünschten Sprache?
 * 3 = genau (pt-BR), 2 = gleiche Sprache, andere Region (pt-PT),
 * 1 = nur Sprache ohne Region (pt), 0 = fremde Sprache.
 */
export function langScore(voiceLang, wanted) {
  const v = normalizeLang(voiceLang);
  const w = normalizeLang(wanted);
  if (!v || !w) return 0;
  if (v === w) return 3;
  const vBase = v.split('-')[0];
  const wBase = w.split('-')[0];
  if (vBase !== wBase) return 0;
  return v === vBase ? 1 : 2;
}

/** Qualitätsstufe aus der Stimmkennung von iOS: premium > enhanced > compact. */
export function voiceQuality(voice) {
  const key = `${voice?.voiceURI || ''} ${voice?.name || ''}`.toLowerCase();
  if (key.includes('premium')) return 'premium';
  if (key.includes('enhanced')) return 'enhanced';
  if (key.includes('compact')) return 'compact';
  return '';
}

// Spaßstimmen von iOS (Eloquence und die alten macOS-Stimmen) – nie die erste Wahl.
const NOVELTY = new Set([
  'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'fred', 'good news', 'jester',
  'junior', 'kathy', 'organ', 'ralph', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
]);

export function isNoveltyVoice(voice) {
  const name = String(voice?.name || '').toLowerCase().replace(/\s*\(.*\)$/, '').trim();
  const uri = String(voice?.voiceURI || '').toLowerCase();
  return NOVELTY.has(name) || uri.includes('eloquence');
}

/** Lokal = auf dem Gerät. Fehlt die Angabe, gilt die Stimme als lokal (iOS meldet sie immer). */
export function isLocalVoice(voice) {
  return voice?.localService !== false;
}

function voiceScore(voice, wanted) {
  const lang = langScore(voice.lang, wanted);
  if (!lang) return 0;
  let score = lang * 1000;
  if (isLocalVoice(voice)) score += 500;
  score += { premium: 300, enhanced: 200, '': 150, compact: 100 }[voiceQuality(voice)];
  if (isNoveltyVoice(voice)) score -= 400;
  if (voice.default) score += 10;
  return score;
}

/**
 * Passende Stimmen für eine Sprache, beste zuerst: genaue Region vor gleicher
 * Sprache, lokal vor Netz, premium vor enhanced vor compact, Spaßstimmen zuletzt.
 */
export function rankVoices(voices, wanted) {
  return (voices || [])
    .map((voice) => ({ voice, score: voiceScore(voice, wanted) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || String(a.voice.name).localeCompare(String(b.voice.name)))
    .map((e) => e.voice);
}

/** Die beste Stimme für eine Sprache oder null. */
export function bestVoice(voices, wanted) {
  return rankVoices(voices, wanted)[0] || null;
}

/** „Luciana · pt-BR · lokal · enhanced" */
export function describeVoice(voice) {
  if (!voice) return 'keine';
  const parts = [voice.name, voice.lang, isLocalVoice(voice) ? 'lokal' : 'aus dem Netz'];
  const q = voiceQuality(voice);
  if (q) parts.push(q);
  if (isNoveltyVoice(voice)) parts.push('Spaßstimme');
  return parts.join(' · ');
}

/** Zählt Stimmen: gesamt, genau pt-BR, genau de-DE, irgendein Portugiesisch, irgendein Deutsch. */
export function countVoices(voices) {
  const out = { total: 0, ptBR: 0, deDE: 0, pt: 0, de: 0 };
  for (const v of voices || []) {
    out.total += 1;
    const l = normalizeLang(v.lang);
    if (l === 'pt-br') out.ptBR += 1;
    if (l === 'de-de') out.deDE += 1;
    if (l === 'pt' || l.startsWith('pt-')) out.pt += 1;
    if (l === 'de' || l.startsWith('de-')) out.de += 1;
  }
  return out;
}

/** Sortierung für die Anzeige: pt-BR, de-DE, übriges Portugiesisch, übriges Deutsch, dann alle nach Kennung. */
export function sortVoicesForDisplay(voices) {
  const group = (v) => {
    const l = normalizeLang(v.lang);
    if (l === 'pt-br') return 0;
    if (l === 'de-de') return 1;
    if (l.startsWith('pt')) return 2;
    if (l.startsWith('de')) return 3;
    return 4;
  };
  return [...(voices || [])].sort((a, b) => group(a) - group(b)
    || normalizeLang(a.lang).localeCompare(normalizeLang(b.lang))
    || String(a.name).localeCompare(String(b.name)));
}

/**
 * Wartet auf die Stimmenliste. Safari liefert sie meist sofort, manchmal erst
 * nach "voiceschanged" – und iOS meldet das Ereignis nicht immer, deshalb wird
 * zusätzlich nachgefragt. Nach `timeoutMs` kommt, was da ist (auch leer).
 */
export function waitForVoices(synth, { timeoutMs = 3000, pollMs = 250, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout } = {}) {
  return new Promise((resolve) => {
    if (!synth || typeof synth.getVoices !== 'function') return resolve([]);
    const first = synth.getVoices() || [];
    if (first.length) return resolve(first);
    let done = false;
    let poll = null;
    let limit = null;
    const finish = () => {
      if (done) return;
      done = true;
      ct(poll); ct(limit);
      if (typeof synth.removeEventListener === 'function') synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices() || []);
    };
    const onChange = () => { if ((synth.getVoices() || []).length) finish(); };
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onChange);
    const tick = () => { if (done) return; if ((synth.getVoices() || []).length) finish(); else poll = st(tick, pollMs); };
    poll = st(tick, pollMs);
    limit = st(finish, timeoutMs);
  });
}

/* =========================================================================
 * Sprechen
 * ========================================================================= */

/** Grobe Dauer einer Äußerung in ms – nur für den Watchdog, nie für den Ablauf. */
export function estimateSpeechMs(text, rate = 1) {
  const chars = String(text || '').trim().length;
  const r = Math.min(2, Math.max(0.5, Number(rate) || 1));
  return Math.round(600 + (chars * 80) / r);
}

/** Frist, nach der es ohne end-Ereignis trotzdem weitergeht. */
export function watchdogMs(text, rate = 1) {
  return Math.round(estimateSpeechMs(text, rate) * 1.5 + 4000);
}

// iOS verliert die Ereignisse einer Äußerung, deren Objekt nicht mehr referenziert
// wird (Garbage Collection). Bis zum Ende bleibt jede hier festgehalten.
const keepAlive = new Set();

/**
 * Spricht einen Text und liefert ein Promise, das mit dem Ende der Äußerung
 * erfüllt wird – niemals verworfen, damit ein Ablauf immer weitergeht.
 *
 * Ergebnis: { reason, error, calledAt, startedAt, endedAt, durationMs, events }
 *   reason: 'end'        – end-Ereignis kam (der Normalfall)
 *           'cancelled'  – abgebrochen (cancel(), Unterbrechung)
 *           'error'      – error-Ereignis, Fehlercode in `error`
 *           'watchdog'   – kein end-Ereignis innerhalb der Frist; cancel() wurde gerufen
 *           'empty'      – nichts zu sprechen
 *           'unsupported'– keine Sprachausgabe im Browser
 *   durationMs: vom start-Ereignis (ersatzweise vom Aufruf) bis zum Ende.
 *
 * Der Watchdog läuft ab dem Aufruf und wird mit dem start-Ereignis neu gestellt.
 * War der Synthesizer pausiert (nach Anruf oder Siri), wird er vorher fortgesetzt –
 * sonst spricht iOS gar nicht.
 */
export function speak(synth, text, opts = {}) {
  const {
    voice = null, lang = '', rate = 1, pitch = 1, volume = 1,
    Utterance = globalThis.SpeechSynthesisUtterance,
    timeoutMs = watchdogMs(text, rate),
    onEvent = null,
    now = Date.now, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout,
  } = opts;
  const calledAt = now();
  const clean = String(text ?? '').trim();
  const result = { text: clean, reason: '', error: '', calledAt, startedAt: null, endedAt: null, durationMs: 0, boundaries: 0, events: [] };
  const immediate = (reason, error = '') => {
    result.reason = reason; result.error = error; result.endedAt = now();
    return Promise.resolve(result);
  };
  if (!clean) return immediate('empty');
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return immediate('unsupported', 'keine Sprachausgabe');

  return new Promise((resolve) => {
    const u = new Utterance(clean);
    if (voice) u.voice = voice;
    u.lang = lang || voice?.lang || '';
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    keepAlive.add(u);
    let timer = null;
    let settled = false;
    const note = (type, detail = {}) => {
      const entry = { type, at: now(), ...detail };
      result.events.push(entry);
      if (onEvent) { try { onEvent(entry, result); } catch { /* Protokoll darf den Ablauf nicht stören */ } }
    };
    const finish = (reason, error = '') => {
      if (settled) return;
      settled = true;
      ct(timer);
      keepAlive.delete(u);
      result.reason = reason; result.error = error; result.endedAt = now();
      result.durationMs = result.endedAt - (result.startedAt ?? calledAt);
      resolve(result);
    };
    const arm = (ms) => {
      ct(timer);
      timer = st(() => {
        note('watchdog', { afterMs: ms });
        try { synth.cancel(); } catch { /* egal – weiter */ }
        finish('watchdog');
      }, ms);
    };
    u.onstart = () => { result.startedAt = now(); note('start', { afterMs: result.startedAt - calledAt }); arm(timeoutMs); };
    u.onend = () => { note('end'); finish('end'); };
    u.onerror = (e) => {
      const code = String(e?.error || 'unbekannt');
      note('error', { error: code });
      finish(code === 'canceled' || code === 'interrupted' ? 'cancelled' : 'error', code);
    };
    u.onpause = () => note('pause');
    u.onresume = () => note('resume');
    u.onboundary = () => { result.boundaries += 1; };
    arm(timeoutMs);
    try {
      if (synth.paused && typeof synth.resume === 'function') { synth.resume(); note('resume-before-speak'); }
      synth.speak(u);
    } catch (err) {
      const message = String(err?.message || err);
      note('exception', { error: message });
      finish('error', message);
    }
  });
}

/** Bricht alles ab, was spricht oder wartet. */
export function stop(synth) {
  try { synth?.cancel?.(); } catch { /* nichts zu tun */ }
}

/** Zustand in einem Wort: spricht / pausiert / wartet / beendet. */
export function speechState(synth) {
  if (!synth) return 'nicht verfügbar';
  if (synth.paused) return 'pausiert';
  if (synth.speaking) return 'spricht';
  if (synth.pending) return 'wartet';
  return 'beendet';
}

/* =========================================================================
 * Zeitplan aus Zeitstempeln
 * ========================================================================= */

/**
 * Wartet bis zum Zeitpunkt `ts` (ms wie Date.now). Die Restzeit wird aus dem
 * Zeitstempel berechnet, nie aufaddiert – so driftet nichts. Liefert true, oder
 * false, wenn `signal` vorher abgebrochen wurde.
 */
export function waitUntil(ts, { now = Date.now, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout, signal = null } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const remaining = ts - now();
    if (remaining <= 0) return resolve(true); // Zeitpunkt ist schon da – nicht warten
    let timer = null;
    const onAbort = () => { ct(timer); resolve(false); };
    timer = st(() => { signal?.removeEventListener?.('abort', onAbort); resolve(true); }, remaining);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * Spricht Einträge nach Zeitplan: Eintrag i beginnt frühestens bei
 * startAt + i·intervalMs. Dauert ein Eintrag länger als der Abstand, folgt der
 * nächste sofort, der übernächste wieder zu seiner geplanten Zeit.
 * `speakItem(item, index)` liefert ein Promise (z. B. speak()).
 * Ergebnis: { startAt, endedAt, aborted, results: [{ index, scheduledAt, calledAt, lateMs, result }] }
 */
export async function runSequence(items, { intervalMs, speakItem, now = Date.now, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout, signal = null, onResult = null } = {}) {
  const startAt = now();
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const scheduledAt = startAt + i * intervalMs;
    const ok = await waitUntil(scheduledAt, { now, setTimeout: st, clearTimeout: ct, signal });
    if (!ok || signal?.aborted) break;
    const calledAt = now();
    const result = await speakItem(items[i], i);
    const entry = { index: i, scheduledAt, calledAt, lateMs: calledAt - scheduledAt, result };
    results.push(entry);
    if (onResult) onResult(entry);
    if (signal?.aborted) break;
  }
  return { startAt, endedAt: now(), aborted: !!signal?.aborted, results };
}

/* =========================================================================
 * Audiositzung: stilles Audio
 * ========================================================================= */

/**
 * Eine WAV-Datei aus Stille als data:-Adresse (16 Bit, mono), erzeugt im
 * Browser – keine Audiodatei im Repository. In Schleife abgespielt hält sie die
 * Audiositzung des Systems offen (Versuch aus docs/phase-3.md, Teil A).
 */
export function silentWavDataUri(seconds = 1, sampleRate = 8000) {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const view = new DataView(buf.buffer);
  const ascii = (offset, s) => { for (let i = 0; i < s.length; i++) buf[offset + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, dataBytes, true);
  // Die Abtastwerte bleiben 0 – das ist bei 16 Bit Stille.
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x2000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x2000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
