// estudar – Diagnoseseite für den Fahrmodus (Phase 3, Teil A: messen, bevor gebaut wird).
//
// Misst, was das iPhone kann – Stimmen, Sprachausgabe, Wake Lock, sichtbare
// Höhe, Dauerbetrieb, Audiositzung – und protokolliert alles mit Zeitstempel,
// damit das Ergebnis als Text in den Chat kann. Die Seite ändert nichts an den
// Karten; die Datenbank wird gar nicht geöffnet.

import {
  LANG_DE, LANG_PT, SYSTEM_VOICE, bestVoice, countVoices, describeVoice, diffVoices, isLocalVoice, normalizeLang,
  pickVoice, runSequence, silentWavDataUri, sortVoicesForDisplay, speak, speechState, stop, voiceKey, voiceQuality, waitForVoices,
} from './speech.js';

const $ = (id) => document.getElementById(id);
const synth = globalThis.speechSynthesis || null;
const Utterance = globalThis.SpeechSynthesisUtterance;

const SAMPLE_PT = 'Bom dia! Hoje eu vou ao mercado comprar pão, café e frutas.';
const SAMPLE_DE = 'Guten Morgen! Heute fahre ich mit dem Auto zur Arbeit und höre Vokabeln.';
const PROBE = { pt: 'Bom dia, tudo bem?', de: 'Guten Morgen, wie geht es dir?', other: 'Eins, zwei, drei.' };
const ENDURANCE_DE = ['Guten Morgen.', 'Heute ist es warm.', 'Wo ist der Bahnhof?', 'Morgen arbeite ich.', 'Wir fahren ans Meer.'];
const ENDURANCE_PT = ['Bom dia, tudo bem?', 'Eu gosto de café.', 'Onde fica a estação?', 'Amanhã eu vou trabalhar.', 'Nós vamos à praia.'];
const BOTH_SPOKEN = 'Eins, zwei, drei.'; // derselbe Inhalt wie die drei Töne der Datei
const TONE_TIMEOUT_MS = 15000;           // Frist, nach der „Beides nacheinander" ohne ended-Ereignis weitergeht

// Gemerkte Stimmwahl (Kennung je Sprache) – dieselben Schlüssel nutzt später der Fahrmodus.
const VOICE_KEYS = { [LANG_PT]: 'estudar-voice-pt-BR', [LANG_DE]: 'estudar-voice-de-DE' };

const state = {
  voices: [],
  bestPt: null,       // App-Vorschlag (★)
  bestDe: null,
  pt: { voice: null, source: 'keine' },   // tatsächlich genutzt: gewählt / beste / system / keine
  de: { voice: null, source: 'keine' },
  endurance: null,    // AbortController des laufenden Dauertests
  silent: null,       // <audio> mit Stille in Schleife
  tone: null,         // <audio> mit der Testdatei
  toneRun: null,      // laufende Wiedergabe: { label, startedAt, resolve }
  tonePausedByPage: 0, // Zeitstempel des letzten pause() von der Seite – das pause-Ereignis kommt erst danach
  both: null,         // AbortController von „Beides nacheinander"
  wake: { sentinel: null, requestedAt: null, releasedAt: null, releasedHidden: false },
  lastHeight: null,
  pendingHeight: null,
  pendingHeightSince: 0,
  lastSpeech: null,
};

/* =========================================================================
 * Protokoll – bleibt in localStorage, damit ein Neuladen nichts verliert
 * ========================================================================= */

const LOG_KEY = 'estudar-diagnose-log';
const LOG_MAX = 600;
let logLines = [];

function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) logLines = JSON.parse(raw).slice(-LOG_MAX);
  } catch { logLines = []; }
}

function saveLog() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(logLines.slice(-LOG_MAX))); } catch { /* voller Speicher: egal */ }
}

function stamp(ms = Date.now()) {
  const d = new Date(ms);
  const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${t},${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function log(text) {
  logLines.push(`${stamp()}  ${text}`);
  if (logLines.length > LOG_MAX) logLines.splice(0, logLines.length - LOG_MAX);
  saveLog();
  renderLog();
}

function renderLog() {
  const box = $('log');
  box.textContent = logLines.join('\n');
  box.scrollTop = box.scrollHeight;
}

const sec = (ms) => `${(Math.max(0, ms) / 1000).toFixed(2).replace('.', ',')} s`;
const signedSec = (ms) => `${ms < 0 ? '−' : '+'}${sec(Math.abs(ms))}`;
const fmtRate = (r) => String(r).replace('.', ',');

let toastTimer = 0;
function toast(text, ms = 1800) {
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

/* =========================================================================
 * Gerät und Zustand
 * ========================================================================= */

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function systemInfo() {
  const ua = navigator.userAgent || '';
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)(?:_(\d+))?/);
  const version = ua.match(/Version\/(\d+(?:\.\d+)*)/);
  const parts = [];
  if (ios) parts.push(`iOS ${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ''}`);
  else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) parts.push('iPadOS');
  else if (/Android/.test(ua)) parts.push('Android');
  else parts.push('kein iOS');
  if (version) parts.push(`Safari ${version[1]}`);
  else if (/Chrome\//.test(ua)) parts.push('Chromium');
  else parts.push('anderer Browser');
  return parts.join(' · ');
}

function visibleHeight() {
  return Math.round(window.visualViewport?.height || window.innerHeight);
}

function renderStatus() {
  const speech = synth ? speechState(synth) : 'nicht verfügbar';
  $('st-speech').textContent = speech;
  if (state.lastSpeech !== null && speech !== state.lastSpeech && (speech === 'pausiert' || state.lastSpeech === 'pausiert')) {
    log(`Sprachausgabe: ${state.lastSpeech} → ${speech}`);
  }
  state.lastSpeech = speech;

  const h = visibleHeight();
  $('st-height').textContent = `${h} px sichtbar · Fenster ${window.innerHeight} px · Bildschirm ${screen.height} px`;
  // Ins Protokoll erst, wenn die neue Höhe eine Sekunde steht – in Safari zappelt sie beim Scrollen.
  if (state.lastHeight === null) state.lastHeight = h;
  if (h !== state.lastHeight) {
    if (state.pendingHeight !== h) { state.pendingHeight = h; state.pendingHeightSince = Date.now(); }
    else if (Date.now() - state.pendingHeightSince >= 1000) { log(`Sichtbare Höhe: ${state.lastHeight} → ${h} px`); state.lastHeight = h; }
  } else {
    state.pendingHeight = null;
  }

  const w = state.wake;
  let wl;
  if (!('wakeLock' in navigator)) wl = 'nicht unterstützt';
  else if (w.sentinel && !w.sentinel.released) wl = `aktiv seit ${stamp(w.requestedAt).slice(0, 8)}`;
  else if (w.releasedAt) wl = `freigegeben ${stamp(w.releasedAt).slice(0, 8)}${w.releasedHidden ? ' (beim Wechsel in den Hintergrund)' : ''}`;
  else if (w.requestedAt) wl = 'Anforderung gescheitert';
  else wl = 'nicht angefordert';
  $('st-wakelock').textContent = wl;
  $('wl-status').textContent = wl;

  const a = state.silent;
  $('st-audio').textContent = !a ? 'aus' : a.paused ? 'pausiert' : `läuft (${a.currentTime.toFixed(1).replace('.', ',')} s)`;

  const s = navigator.audioSession;
  $('st-session').textContent = s ? `Typ ${s.type}${s.state ? ` · ${s.state}` : ''}` : 'API nicht vorhanden';

  $('st-tone').textContent = describeToneElement();
  const m = navigator.mediaSession;
  $('st-media').textContent = !m ? 'API nicht vorhanden' : `${m.metadata ? `„${m.metadata.title}" gesetzt` : 'ohne Angaben'} · ${m.playbackState || 'none'}`;
}

/* =========================================================================
 * 1 · Stimmen
 * ========================================================================= */

const READY = ['nichts geladen', 'Metadaten', 'aktuelle Daten', 'genug zum Abspielen', 'ganz geladen'];
const NETWORK = ['leer', 'bereit', 'lädt', 'keine Quelle'];

function describeToneElement() {
  const a = state.tone;
  if (!a) return '…';
  const parts = [a.paused ? (a.ended ? 'zu Ende' : 'pausiert') : 'spielt', `${a.currentTime.toFixed(1).replace('.', ',')} / ${Number.isFinite(a.duration) ? a.duration.toFixed(1).replace('.', ',') : '?'} s`];
  parts.push(`readyState ${a.readyState} (${READY[a.readyState] || '?'})`, `network ${a.networkState} (${NETWORK[a.networkState] || '?'})`);
  if (a.muted || a.volume < 1) parts.push(`${a.muted ? 'stumm' : `Lautstärke ${a.volume}`}`);
  if (a.error) parts.push(`Fehler ${a.error.code}`);
  return parts.join(' · ');
}

/* =========================================================================
 * 1 · Stimmen
 * ========================================================================= */

function loadChoice(lang) {
  try { return localStorage.getItem(VOICE_KEYS[lang]) || ''; } catch { return ''; }
}

function saveChoice(lang, key) {
  try { if (key) localStorage.setItem(VOICE_KEYS[lang], key); else localStorage.removeItem(VOICE_KEYS[lang]); } catch { /* voller Speicher: egal */ }
}

/** Kurzform: Kennung, ersatzweise Name und Sprache. */
function voiceLine(v) {
  const q = voiceQuality(v);
  return `${v.name} [${v.lang}, ${isLocalVoice(v) ? 'lokal' : 'Netz'}${q ? `, ${q}` : ''}] ${voiceKey(v)}`;
}

function describeChoice(c) {
  if (c.source === 'system') return 'Systemstimme (keine Stimme gesetzt, nur die Sprache)';
  if (!c.voice) return 'keine';
  return `${describeVoice(c.voice)} (${c.source})`;
}

/** Wählt für beide Sprachen die Stimme: gemerkte Kennung, sonst App-Vorschlag. */
function resolveChoices() {
  state.bestPt = bestVoice(state.voices, LANG_PT);
  state.bestDe = bestVoice(state.voices, LANG_DE);
  state.pt = pickVoice(state.voices, LANG_PT, loadChoice(LANG_PT));
  state.de = pickVoice(state.voices, LANG_DE, loadChoice(LANG_DE));
  $('voices-best-pt').textContent = describeChoice(state.pt);
  $('voices-best-de').textContent = describeChoice(state.de);
}

function applyVoices(voices, trigger, previous = null) {
  state.voices = voices;
  resolveChoices();
  const c = countVoices(voices);
  $('voices-summary').textContent = c.total ? `${c.total} Stimmen · pt-BR: ${c.ptBR} · de-DE: ${c.deDE}` : 'Keine Stimmen gefunden.';
  $('voices-hint-pt').hidden = c.ptBR > 0;
  $('voices-all-count').textContent = String(c.total);
  renderVoiceGroups();
  renderVoiceList();
  log(`Stimmen (${trigger}): ${c.total} gefunden · pt-BR ${c.ptBR} · de-DE ${c.deDE} · genutzt pt-BR: ${describeChoice(state.pt)} · de-DE: ${describeChoice(state.de)}`);
  if (previous) {
    const d = diffVoices(previous, voices);
    if (!d.changed) log(`  Kennungen unverändert (${voices.length} wie zuvor)`);
    else {
      log(`  Kennungen GEÄNDERT: ${d.added.length} neu, ${d.removed.length} weg`);
      for (const v of d.added) log(`  + ${voiceLine(v)}`);
      for (const v of d.removed) log(`  − ${voiceLine(v)}`);
    }
  }
  const interesting = sortVoicesForDisplay(voices).filter((v) => { const l = normalizeLang(v.lang); return l === 'pt-br' || l === 'de-de'; });
  for (const v of interesting) log(`  ${v === state.bestPt || v === state.bestDe ? '★' : '·'} ${voiceLine(v)}`);
  const other = sortVoicesForDisplay(voices).filter((v) => { const l = normalizeLang(v.lang); return (l.startsWith('pt') || l.startsWith('de')) && l !== 'pt-br' && l !== 'de-de'; });
  if (other.length) log(`  weitere pt/de: ${other.map((v) => voiceLine(v)).join('; ')}`);
}

function voiceRow(v, { radio = null, best = false, chosen = false, hl = false, showKey = false } = {}) {
  const classes = [];
  if (hl) classes.push('hl');
  if (best) classes.push('best');
  if (chosen) classes.push('chosen');
  const meta = [v.lang, isLocalVoice(v) ? 'lokal' : 'aus dem Netz'];
  if (voiceQuality(v)) meta.push(voiceQuality(v));
  if (v.default) meta.push('Standard');
  const name = [el('b', { text: v.name }), el('span', { text: meta.join(' · ') })];
  if (showKey) name.push(el('code', { text: voiceKey(v) }));
  const li = el('li', { class: classes.join(' ') }, [
    radio,
    el('div', { class: 'v-name' }, name),
    el('button', { type: 'button', class: 'play', 'aria-label': `Hörprobe ${v.name}`, text: '▶', onclick: (e) => { e.stopPropagation(); probe(v); } }),
  ]);
  return li;
}

/** pt-BR und de-DE untereinander, je mit Auswahl, Kennung, Hörprobe und der Systemstimme als letzter Wahl. */
function renderVoiceGroups() {
  for (const [lang, id, choice, best] of [[LANG_PT, 'voices-pt', state.pt, state.bestPt], [LANG_DE, 'voices-de', state.de, state.bestDe]]) {
    const list = $(id);
    list.replaceChildren();
    const group = `voice-${lang}`;
    const stored = loadChoice(lang);
    const voices = sortVoicesForDisplay(state.voices).filter((v) => normalizeLang(v.lang) === normalizeLang(lang));
    if (!voices.length) list.append(el('li', { class: 'empty', text: `keine ${lang}-Stimme gemeldet` }));
    for (const v of voices) {
      const key = voiceKey(v);
      const isChosen = choice.source !== 'system' && choice.voice === v;
      const radio = el('input', { type: 'radio', name: group, value: key, 'aria-label': `${v.name} wählen`, onchange: () => chooseVoice(lang, key) });
      if (isChosen) radio.checked = true;
      const li = voiceRow(v, { radio, best: v === best, chosen: isChosen, showKey: true });
      li.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { radio.checked = true; chooseVoice(lang, key); } });
      list.append(li);
    }
    const sysRadio = el('input', { type: 'radio', name: group, value: SYSTEM_VOICE, 'aria-label': `Systemstimme für ${lang} wählen`, onchange: () => chooseVoice(lang, SYSTEM_VOICE) });
    if (choice.source === 'system') sysRadio.checked = true;
    const sys = el('li', { class: choice.source === 'system' ? 'chosen' : '' }, [
      sysRadio,
      el('div', { class: 'v-name' }, [el('b', { text: `Systemstimme für ${lang}` }), el('span', { text: 'keine Stimme setzen, nur die Sprache – iOS wählt selbst' })]),
      el('button', { type: 'button', class: 'play', 'aria-label': `Hörprobe Systemstimme ${lang}`, text: '▶', onclick: (e) => { e.stopPropagation(); speakNow(`Hörprobe Systemstimme ${lang}`, lang === LANG_PT ? PROBE.pt : PROBE.de, null, lang); } }),
    ]);
    sys.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { sysRadio.checked = true; chooseVoice(lang, SYSTEM_VOICE); } });
    list.append(sys);
    if (stored && stored !== SYSTEM_VOICE && choice.source !== 'gewählt') {
      list.append(el('li', { class: 'empty', text: `gemerkte Wahl „${stored}" ist nicht (mehr) in der Liste – App-Vorschlag wird genutzt` }));
    }
  }
}

function chooseVoice(lang, key) {
  saveChoice(lang, key);
  resolveChoices();
  renderVoiceGroups();
  const c = lang === LANG_PT ? state.pt : state.de;
  log(`Stimme ${lang} gewählt: ${describeChoice(c)}${c.voice ? ` · ${voiceKey(c.voice)}` : ''} (gemerkt)`);
  toast(`${lang}: ${c.source === 'system' ? 'Systemstimme' : c.voice?.name || 'keine'}`);
}

function renderVoiceList() {
  const list = $('voices-list');
  list.replaceChildren();
  for (const v of sortVoicesForDisplay(state.voices)) {
    const l = normalizeLang(v.lang);
    list.append(voiceRow(v, { hl: l === 'pt-br' || l === 'de-de', best: v === state.bestPt || v === state.bestDe }));
  }
}

function probe(voice) {
  const base = normalizeLang(voice.lang).split('-')[0];
  const text = base === 'pt' ? PROBE.pt : base === 'de' ? PROBE.de : PROBE.other;
  return speakNow(`Hörprobe ${voice.name}`, text, voice, voice.lang);
}

/** Liest getVoices() erneut und wendet die Liste an, wenn sich etwas geändert hat (oder `force`). */
function rereadVoices(trigger, { force = false } = {}) {
  if (!synth) return;
  const fresh = synth.getVoices() || [];
  const d = diffVoices(state.voices, fresh);
  if (!d.changed && !force) return;
  applyVoices(fresh, trigger, state.voices);
}

async function loadVoices() {
  if (!synth) { $('voices-summary').textContent = 'Dieser Browser hat keine Sprachausgabe (speechSynthesis fehlt).'; return; }
  const t0 = Date.now();
  const voices = await waitForVoices(synth, { timeoutMs: 3000 });
  applyVoices(voices, `beim Start, nach ${sec(Date.now() - t0)}`);
  synth.addEventListener('voiceschanged', () => rereadVoices('voiceschanged-Ereignis'));
}

/* =========================================================================
 * 2 · Testsätze und Hörproben
 * ========================================================================= */

function currentRate() {
  const checked = document.querySelector('input[name="rate"]:checked');
  return Number(checked ? checked.value : 0.9) || 0.9;
}

function describeResult(r) {
  const dur = sec(r.durationMs);
  switch (r.reason) {
    case 'end': return `Ende nach ${dur} (end-Ereignis${r.boundaries ? `, ${r.boundaries}× boundary` : ''})`;
    case 'cancelled': return `abgebrochen nach ${dur} (${r.error})`;
    case 'error': return `Fehler „${r.error}" nach ${dur}`;
    case 'watchdog': return `KEIN Ende-Ereignis – Watchdog nach ${dur}`;
    case 'empty': return 'nichts zu sprechen';
    case 'unsupported': return 'keine Sprachausgabe in diesem Browser';
    default: return r.reason;
  }
}

function logEvent(label, e) {
  if (e.type === 'start') log(`${label}: spricht (start-Ereignis nach ${sec(e.afterMs)})`);
  else if (e.type === 'error') log(`${label}: error-Ereignis „${e.error}"`);
  else if (e.type === 'watchdog') log(`${label}: kein Ende-Ereignis nach ${sec(e.afterMs)} – Watchdog bricht ab`);
  else if (e.type === 'exception') log(`${label}: Ausnahme beim Sprechen: ${e.error}`);
  else if (e.type !== 'end') log(`${label}: ${e.type}-Ereignis`);
}

/** Spricht sofort (bricht Laufendes ab) und protokolliert Aufruf, Ereignisse und Ergebnis. */
async function speakNow(label, text, voice, lang) {
  stop(synth);
  const rate = currentRate();
  $('test-status').textContent = `${label} …`;
  log(`${label}: speak() „${text}" · Stimme ${voice ? `${describeVoice(voice)} · ${voiceKey(voice)}` : `Systemstandard für ${lang}`} · Tempo ${fmtRate(rate)}`);
  const r = await speak(synth, text, { voice, lang, rate, Utterance, onEvent: (e) => logEvent(label, e) });
  const summary = describeResult(r);
  log(`${label}: ${summary}`);
  $('test-status').textContent = `${label}: ${summary}`;
  return r;
}

/* =========================================================================
 * 3 · Wake Lock
 * ========================================================================= */

async function requestWakeLock(origin) {
  const w = state.wake;
  w.requestedAt = Date.now();
  if (!('wakeLock' in navigator)) { log(`Wake Lock (${origin}): nicht unterstützt – iOS 16.4 oder neuer nötig`); renderStatus(); return false; }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    w.sentinel = sentinel;
    w.releasedAt = null;
    w.releasedHidden = false;
    sentinel.addEventListener('release', () => {
      if (w.sentinel !== sentinel) return;
      w.releasedAt = Date.now();
      w.releasedHidden = document.visibilityState === 'hidden';
      log(`Wake Lock: freigegeben (Seite ${w.releasedHidden ? 'im Hintergrund' : 'sichtbar'})`);
      renderStatus();
    });
    log(`Wake Lock (${origin}): aktiv`);
    renderStatus();
    return true;
  } catch (err) {
    w.sentinel = null;
    log(`Wake Lock (${origin}): gescheitert – ${err?.name || 'Fehler'}: ${err?.message || err}`);
    renderStatus();
    return false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    log('Seite in den Hintergrund (visibilitychange: hidden)');
    return;
  }
  const w = state.wake;
  const held = !!(w.sentinel && !w.sentinel.released);
  const verdict = held ? 'steht noch' : w.requestedAt ? 'steht NICHT mehr' : 'war nicht angefordert';
  log(`Seite wieder sichtbar – Wake Lock ${verdict} · Sprachausgabe ${synth ? speechState(synth) : 'fehlt'} · stilles Audio ${!state.silent ? 'aus' : state.silent.paused ? 'pausiert' : 'läuft'} · Testdatei ${!state.tone ? '–' : state.tone.paused ? 'pausiert' : 'spielt'}`);
  if (!held && w.requestedAt) requestWakeLock('automatisch nach Rückkehr');
  rereadVoices('nach Rückkehr in die Seite');
  renderStatus();
}

/* =========================================================================
 * 5 · Dauertest
 * ========================================================================= */

function enduranceItems(count) {
  const items = [];
  for (let n = 1; n <= count; n++) {
    const de = n % 2 === 1;
    const text = de
      ? `Satz ${n}: ${ENDURANCE_DE[((n - 1) / 2) % ENDURANCE_DE.length]}`
      : `Frase ${n}: ${ENDURANCE_PT[(n / 2 - 1) % ENDURANCE_PT.length]}`;
    items.push({ n, de, text });
  }
  return items;
}

async function runEndurance({ count = 10, intervalMs = 5000 } = {}) {
  if (state.endurance) { toast('Der Dauertest läuft schon'); return null; }
  if (!synth) { log('Dauertest: keine Sprachausgabe in diesem Browser'); return null; }
  stop(synth);
  const ctrl = new AbortController();
  state.endurance = ctrl;
  const rate = currentRate();
  const items = enduranceItems(count);
  const stats = { spoken: 0, ends: 0, watchdog: 0, errors: 0, cancelled: 0, maxLate: 0 };
  const status = $('endurance-status');
  log(`Dauertest: ${count} Sätze alle ${intervalMs / 1000} s · de-DE ${describeChoice(state.de)} · pt-BR ${describeChoice(state.pt)} · Tempo ${fmtRate(rate)}`);
  const run = await runSequence(items, {
    intervalMs,
    signal: ctrl.signal,
    speakItem: (item) => {
      status.textContent = `Satz ${item.n} von ${count} …`;
      const voice = item.de ? state.de.voice : state.pt.voice;
      const lang = item.de ? LANG_DE : LANG_PT;
      return speak(synth, item.text, { voice, lang, rate, Utterance, onEvent: (e) => { if (e.type !== 'start' && e.type !== 'end') logEvent(`Satz ${item.n}`, e); } });
    },
    onResult: (entry) => {
      const item = items[entry.index];
      const r = entry.result;
      stats.spoken += 1;
      if (r.reason === 'end') stats.ends += 1;
      else if (r.reason === 'watchdog') stats.watchdog += 1;
      else if (r.reason === 'cancelled') stats.cancelled += 1;
      else stats.errors += 1;
      stats.maxLate = Math.max(stats.maxLate, entry.lateMs);
      const startDelay = r.startedAt ? sec(r.startedAt - r.calledAt) : '–';
      log(`Satz ${item.n}/${count} (${item.de ? 'de' : 'pt'}): Plan ${signedSec(entry.lateMs)} · start nach ${startDelay} · ${describeResult(r)}`);
      status.textContent = `Satz ${item.n} von ${count}: ${describeResult(r)}`;
    },
  });
  state.endurance = null;
  const summary = `Dauertest ${run.aborted ? 'abgebrochen' : 'fertig'}: ${stats.spoken} von ${count} gesprochen · end-Ereignisse ${stats.ends} · Watchdog ${stats.watchdog} · abgebrochen ${stats.cancelled} · Fehler ${stats.errors} · größte Verspätung ${sec(stats.maxLate)} · Dauer ${sec(run.endedAt - run.startAt)}`;
  log(summary);
  status.textContent = summary;
  return { run, stats };
}

function stopEndurance() {
  if (state.endurance) { state.endurance.abort(); log('Dauertest: Stopp gedrückt'); }
  stop(synth);
}

/* =========================================================================
 * 6 · Audiositzung: stilles Audio in Schleife, navigator.audioSession
 * ========================================================================= */

async function setSilentAudio(on) {
  if (on) {
    if (!state.silent) {
      const audio = new Audio();
      audio.src = silentWavDataUri(1);
      audio.loop = true;
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.addEventListener('pause', () => { if ($('sw-silent').checked) log('Stilles Audio: pause-Ereignis (vom System angehalten?)'); });
      audio.addEventListener('error', () => log(`Stilles Audio: Fehler ${audio.error?.code || ''}`));
      state.silent = audio;
    }
    try {
      await state.silent.play();
      log('Stilles Audio: läuft (Schleife)');
    } catch (err) {
      log(`Stilles Audio: play() gescheitert – ${err?.name || 'Fehler'}: ${err?.message || err}`);
      $('sw-silent').checked = false;
    }
  } else if (state.silent) {
    state.silent.pause();
    log('Stilles Audio: aus');
  }
  renderStatus();
}

function setupAudioSession() {
  const s = navigator.audioSession;
  if (!s) { $('session-note').textContent = 'navigator.audioSession gibt es in diesem Browser nicht (iOS 17 oder neuer).'; return; }
  $('row-session').hidden = false;
  $('sw-session').checked = s.type === 'playback';
  $('sw-session').addEventListener('change', (e) => {
    try {
      s.type = e.target.checked ? 'playback' : 'auto';
      log(`Audiositzung: Typ auf „${s.type}" gestellt`);
    } catch (err) {
      log(`Audiositzung: Typ ließ sich nicht setzen – ${err?.message || err}`);
    }
    renderStatus();
  });
  if (typeof s.addEventListener === 'function') s.addEventListener('statechange', () => log(`Audiositzung: Zustand ${s.state}`));
}

/* =========================================================================
 * 7 · Ton im Auto: Datei über <audio>, Media Session, beides nacheinander
 * ========================================================================= */

function setupTone() {
  const a = $('tone');
  state.tone = a;
  const evt = (type) => a.addEventListener(type, () => {
    const run = state.toneRun;
    const label = run ? run.label : 'Testdatei';
    const t = `${a.currentTime.toFixed(2).replace('.', ',')} s`;
    if (type === 'playing') log(`${label}: playing-Ereignis nach ${run ? sec(Date.now() - run.startedAt) : '–'} · readyState ${a.readyState}`);
    else if (type === 'ended') { log(`${label}: ended-Ereignis bei ${t} (Dauer ${Number.isFinite(a.duration) ? sec(a.duration * 1000) : '?'})`); finishTone('ended'); }
    else if (type === 'pause') { if (!a.ended) log(`${label}: pause-Ereignis bei ${t}${Date.now() - state.tonePausedByPage < 1000 ? ' (Stopp von der Seite)' : ' – nicht von der Seite, also vom System (CarPlay, Anruf, Siri)'}`); }
    else if (type === 'error') { log(`${label}: error-Ereignis – Code ${a.error?.code || '?'} ${a.error?.message || ''}`); finishTone('error'); }
    else if (type === 'stalled' || type === 'waiting' || type === 'suspend') log(`${label}: ${type}-Ereignis bei ${t}`);
    else if (type === 'play') log(`${label}: play-Ereignis`);
  });
  for (const type of ['play', 'playing', 'pause', 'ended', 'error', 'stalled', 'waiting']) evt(type);
  const loaded = () => log(`Testdatei geladen: Dauer ${sec(a.duration * 1000)} · ${a.currentSrc.split('/').pop()}`);
  if (a.readyState >= 1) loaded(); else a.addEventListener('loadedmetadata', loaded, { once: true });
  setupMediaSession();
}

function setupMediaSession() {
  const m = navigator.mediaSession;
  if (!m) { log('Media Session: API nicht vorhanden'); return; }
  try {
    m.metadata = new MediaMetadata({ title: 'estudar Testton', artist: 'estudar Diagnose', album: 'Fahrmodus, Teil A' });
    log('Media Session: Titel „estudar Testton", Interpret „estudar Diagnose" gesetzt');
  } catch (err) {
    log(`Media Session: Angaben ließen sich nicht setzen – ${err?.message || err}`);
  }
  const handlers = {
    play: () => { log('Media Session: play vom System – Datei wird abgespielt'); playTone('Testdatei (System)'); },
    pause: () => { log('Media Session: pause vom System'); state.tonePausedByPage = Date.now(); state.tone?.pause(); },
    stop: () => { log('Media Session: stop vom System'); stopTone(); },
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try { m.setActionHandler(action, fn); } catch { /* Aktion nicht unterstützt */ }
  }
}

function setPlaybackState(value) {
  const m = navigator.mediaSession;
  if (!m) return;
  try { m.playbackState = value; } catch { /* egal */ }
}

function finishTone(reason) {
  const run = state.toneRun;
  if (!run) return;
  state.toneRun = null;
  setPlaybackState(reason === 'ended' ? 'none' : 'paused');
  run.resolve({ reason, durationMs: Date.now() - run.startedAt });
}

/** Spielt die Testdatei über das <audio>-Element; das Promise wird nie verworfen. */
async function playTone(label = 'Testdatei') {
  const a = state.tone;
  if (!a) return { reason: 'unsupported', durationMs: 0 };
  if (state.toneRun) { toast('Die Datei spielt schon'); return { reason: 'busy', durationMs: 0 }; }
  const status = $('tone-status');
  a.currentTime = 0;
  log(`${label}: play() · vorher ${describeToneElement()}`);
  status.textContent = `${label} …`;
  const done = new Promise((resolve) => { state.toneRun = { label, startedAt: Date.now(), resolve }; });
  try {
    await a.play();
    log(`${label}: play() erfüllt – Wiedergabe läuft · ${describeToneElement()}`);
    setPlaybackState('playing');
  } catch (err) {
    log(`${label}: play() ABGELEHNT – ${err?.name || 'Fehler'}: ${err?.message || err}`);
    finishTone('rejected');
  }
  const r = await done;
  const text = r.reason === 'ended' ? `Ende nach ${sec(r.durationMs)} (ended-Ereignis)` : r.reason === 'stopped' ? `gestoppt nach ${sec(r.durationMs)}` : r.reason === 'rejected' ? 'play() abgelehnt' : r.reason === 'timeout' ? `KEIN ended-Ereignis – Frist nach ${sec(r.durationMs)}` : `Fehler (${r.reason})`;
  log(`${label}: ${text} · nachher ${describeToneElement()}`);
  status.textContent = `${label}: ${text}`;
  renderStatus();
  return r;
}

function stopTone() {
  const a = state.tone;
  if (!a) return;
  state.tonePausedByPage = Date.now();
  a.pause();
  finishTone('stopped');
}

/** Erst die Datei, dann derselbe Inhalt gesprochen – mit der gewählten de-DE-Stimme. */
async function playBoth() {
  if (state.both) { toast('Läuft schon'); return null; }
  const ctrl = new AbortController();
  state.both = ctrl;
  stop(synth);
  log('Beides nacheinander: 1. Datei über <audio>, 2. „Eins, zwei, drei" gesprochen');
  let timer = 0;
  const limit = new Promise((resolve) => { timer = setTimeout(() => resolve({ reason: 'timeout', durationMs: TONE_TIMEOUT_MS }), TONE_TIMEOUT_MS); });
  const file = await Promise.race([playTone('Beides 1/2 Datei'), limit]);
  clearTimeout(timer);
  if (file.reason === 'timeout') { log(`Beides 1/2 Datei: kein ended-Ereignis nach ${sec(TONE_TIMEOUT_MS)} – weiter mit der Sprachausgabe`); stopTone(); }
  let spoken = null;
  if (!ctrl.signal.aborted) {
    spoken = await speakNow('Beides 2/2 Sprache', BOTH_SPOKEN, state.de.voice, LANG_DE);
  }
  state.both = null;
  const summary = `Beides nacheinander fertig: Datei ${file.reason === 'ended' ? 'zu Ende gespielt' : file.reason} · Sprache ${spoken ? describeResult(spoken) : 'übersprungen'}`;
  log(summary);
  $('tone-status').textContent = summary;
  return { file, spoken };
}

/* =========================================================================
 * Protokoll teilen
 * ========================================================================= */

async function copyLog() {
  const text = logLines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Protokoll kopiert');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('log'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Kopieren nicht möglich – Text ist markiert');
  }
}

async function shareLog() {
  const text = logLines.join('\n');
  if (!navigator.share) return copyLog();
  try {
    await navigator.share({ text });
  } catch (err) {
    if (err?.name !== 'AbortError') toast(`Teilen nicht möglich: ${err?.message || err}`);
  }
}

function clearLog() {
  logLines = [];
  saveLog();
  renderLog();
  log('Protokoll geleert');
}

/* =========================================================================
 * Start
 * ========================================================================= */

function boot() {
  loadLog();
  renderLog();
  const standalone = isStandalone();
  const mode = $('st-mode');
  mode.textContent = standalone ? 'als App vom Home-Bildschirm ✓' : 'im Browser';
  mode.className = `value ${standalone ? 'ok' : ''}`;
  mode.dataset.state = standalone ? 'standalone' : 'browser';
  $('st-system').textContent = systemInfo();
  log(`— Diagnose gestartet · Fassung ${$('diag-version').textContent} · ${systemInfo()} · ${standalone ? 'als App vom Home-Bildschirm' : 'im Browser'} · speechSynthesis ${synth ? 'vorhanden' : 'FEHLT'} · Wake-Lock-API ${'wakeLock' in navigator ? 'vorhanden' : 'fehlt'} · audioSession ${navigator.audioSession ? `vorhanden (${navigator.audioSession.type})` : 'fehlt'} · mediaSession ${navigator.mediaSession ? 'vorhanden' : 'fehlt'} · Fenster ${window.innerWidth}×${window.innerHeight}, sichtbar ${visibleHeight()} px`);

  $('btn-voices-reload').addEventListener('click', () => { log('Stimmliste neu einlesen: getVoices()'); rereadVoices('Knopf', { force: true }); });
  $('btn-test-pt').addEventListener('click', () => speakNow('Test pt-BR', SAMPLE_PT, state.pt.voice, LANG_PT));
  $('btn-test-de').addEventListener('click', () => speakNow('Test de-DE', SAMPLE_DE, state.de.voice, LANG_DE));
  $('btn-stop').addEventListener('click', () => { stopEndurance(); log('Stopp: cancel()'); $('test-status').textContent = 'gestoppt'; });
  $('btn-tone').addEventListener('click', () => playTone());
  $('btn-both').addEventListener('click', () => playBoth());
  $('btn-tone-stop').addEventListener('click', () => { if (state.both) state.both.abort(); stopTone(); stop(synth); log('Stopp: Datei und Sprachausgabe'); });
  $('btn-wakelock').addEventListener('click', () => requestWakeLock('Knopf'));
  $('btn-endurance').addEventListener('click', () => runEndurance({ count: 10 }));
  $('btn-endurance-long').addEventListener('click', () => runEndurance({ count: 60 }));
  $('btn-endurance-stop').addEventListener('click', stopEndurance);
  $('sw-silent').addEventListener('change', (e) => setSilentAudio(e.target.checked));
  $('btn-log-copy').addEventListener('click', copyLog);
  $('btn-log-share').addEventListener('click', shareLog);
  $('btn-log-clear').addEventListener('click', clearLog);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', (e) => { if (e.persisted) log('pageshow aus dem Seitencache (persisted)'); });

  setupAudioSession();
  setupTone();
  renderStatus();
  setInterval(renderStatus, 250);
  loadVoices().catch((err) => log(`Stimmen: Fehler ${err?.message || err}`));
}

// Für Tests: Zustand, Dauertest mit anderem Abstand, Protokoll.
window.diagnose = { state, runEndurance, speakNow, playTone, playBoth, rereadVoices, log, get logLines() { return logLines; } };

boot();
