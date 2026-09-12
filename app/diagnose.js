// estudar – Diagnoseseite für den Fahrmodus (Phase 3, Teil A: messen, bevor gebaut wird).
//
// Misst, was das iPhone kann – Stimmen, Sprachausgabe, Wake Lock, sichtbare
// Höhe, Dauerbetrieb, Audiositzung – und protokolliert alles mit Zeitstempel,
// damit das Ergebnis als Text in den Chat kann. Die Seite ändert nichts an den
// Karten; die Datenbank wird gar nicht geöffnet.

import {
  LANG_DE, LANG_PT, bestVoice, countVoices, describeVoice, isLocalVoice, normalizeLang,
  runSequence, silentWavDataUri, sortVoicesForDisplay, speak, speechState, stop, voiceQuality, waitForVoices,
} from './speech.js';

const $ = (id) => document.getElementById(id);
const synth = globalThis.speechSynthesis || null;
const Utterance = globalThis.SpeechSynthesisUtterance;

const SAMPLE_PT = 'Bom dia! Hoje eu vou ao mercado comprar pão, café e frutas.';
const SAMPLE_DE = 'Guten Morgen! Heute fahre ich mit dem Auto zur Arbeit und höre Vokabeln.';
const PROBE = { pt: 'Bom dia, tudo bem?', de: 'Guten Morgen, wie geht es dir?', other: 'Eins, zwei, drei.' };
const ENDURANCE_DE = ['Guten Morgen.', 'Heute ist es warm.', 'Wo ist der Bahnhof?', 'Morgen arbeite ich.', 'Wir fahren ans Meer.'];
const ENDURANCE_PT = ['Bom dia, tudo bem?', 'Eu gosto de café.', 'Onde fica a estação?', 'Amanhã eu vou trabalhar.', 'Nós vamos à praia.'];

const state = {
  voices: [],
  bestPt: null,
  bestDe: null,
  endurance: null,   // AbortController des laufenden Dauertests
  silent: null,      // <audio> mit Stille in Schleife
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
}

/* =========================================================================
 * 1 · Stimmen
 * ========================================================================= */

function applyVoices(voices, trigger) {
  state.voices = voices;
  state.bestPt = bestVoice(voices, LANG_PT);
  state.bestDe = bestVoice(voices, LANG_DE);
  const c = countVoices(voices);
  $('voices-summary').textContent = c.total ? `${c.total} Stimmen · pt-BR: ${c.ptBR} · de-DE: ${c.deDE}` : 'Keine Stimmen gefunden.';
  $('voices-best-pt').textContent = describeVoice(state.bestPt) + (state.bestPt && c.ptBR === 0 ? ' – kein pt-BR!' : '');
  $('voices-best-de').textContent = describeVoice(state.bestDe) + (state.bestDe && c.deDE === 0 ? ' – kein de-DE!' : '');
  $('voices-hint-pt').hidden = c.ptBR > 0;
  renderVoiceList();
  const detail = (prefix) => sortVoicesForDisplay(voices).filter((v) => normalizeLang(v.lang).startsWith(prefix))
    .map((v) => `${v.name} [${v.lang}, ${isLocalVoice(v) ? 'lokal' : 'Netz'}${voiceQuality(v) ? `, ${voiceQuality(v)}` : ''}${v.voiceURI ? `, ${v.voiceURI}` : ''}]`).join('; ');
  log(`Stimmen (${trigger}): ${c.total} gefunden · pt-BR ${c.ptBR} · de-DE ${c.deDE} · beste pt-BR: ${describeVoice(state.bestPt)} · beste de-DE: ${describeVoice(state.bestDe)}`);
  if (c.pt) log(`  Portugiesisch: ${detail('pt')}`);
  if (c.de) log(`  Deutsch: ${detail('de')}`);
}

function renderVoiceList() {
  const list = $('voices-list');
  list.replaceChildren();
  for (const v of sortVoicesForDisplay(state.voices)) {
    const l = normalizeLang(v.lang);
    const classes = [];
    if (l === 'pt-br' || l === 'de-de') classes.push('hl');
    if (v === state.bestPt || v === state.bestDe) classes.push('best');
    const meta = [v.lang, isLocalVoice(v) ? 'lokal' : 'aus dem Netz'];
    if (voiceQuality(v)) meta.push(voiceQuality(v));
    if (v.default) meta.push('Standard');
    list.append(el('li', { class: classes.join(' ') }, [
      el('div', { class: 'v-name' }, [el('b', { text: v.name }), el('span', { text: meta.join(' · ') })]),
      el('button', { type: 'button', class: 'play', 'aria-label': `Hörprobe ${v.name}`, text: '▶', onclick: () => probe(v) }),
    ]));
  }
}

function probe(voice) {
  const base = normalizeLang(voice.lang).split('-')[0];
  const text = base === 'pt' ? PROBE.pt : base === 'de' ? PROBE.de : PROBE.other;
  return speakNow(`Hörprobe ${voice.name}`, text, voice, voice.lang);
}

async function loadVoices() {
  if (!synth) { $('voices-summary').textContent = 'Dieser Browser hat keine Sprachausgabe (speechSynthesis fehlt).'; return; }
  const t0 = Date.now();
  const voices = await waitForVoices(synth, { timeoutMs: 3000 });
  applyVoices(voices, `beim Start, nach ${sec(Date.now() - t0)}`);
  synth.addEventListener('voiceschanged', () => {
    const fresh = synth.getVoices() || [];
    const key = (vs) => vs.map((v) => `${v.name}|${v.lang}`).join(',');
    if (key(fresh) === key(state.voices)) return;
    applyVoices(fresh, 'voiceschanged');
  });
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
  log(`${label}: speak() „${text}" · Stimme ${voice ? describeVoice(voice) : `Systemstandard für ${lang}`} · Tempo ${fmtRate(rate)}`);
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
  log(`Seite wieder sichtbar – Wake Lock ${verdict} · Sprachausgabe ${synth ? speechState(synth) : 'fehlt'} · stilles Audio ${!state.silent ? 'aus' : state.silent.paused ? 'pausiert' : 'läuft'}`);
  if (!held && w.requestedAt && $('wl-auto').checked) requestWakeLock('automatisch nach Rückkehr');
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
  log(`Dauertest: ${count} Sätze alle ${intervalMs / 1000} s · de-DE ${describeVoice(state.bestDe)} · pt-BR ${describeVoice(state.bestPt)} · Tempo ${fmtRate(rate)}`);
  const run = await runSequence(items, {
    intervalMs,
    signal: ctrl.signal,
    speakItem: (item) => {
      status.textContent = `Satz ${item.n} von ${count} …`;
      const voice = item.de ? state.bestDe : state.bestPt;
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
  log(`— Diagnose gestartet · Fassung ${$('diag-version').textContent} · ${systemInfo()} · ${standalone ? 'als App vom Home-Bildschirm' : 'im Browser'} · speechSynthesis ${synth ? 'vorhanden' : 'FEHLT'} · Wake-Lock-API ${'wakeLock' in navigator ? 'vorhanden' : 'fehlt'} · audioSession ${navigator.audioSession ? `vorhanden (${navigator.audioSession.type})` : 'fehlt'} · Fenster ${window.innerWidth}×${window.innerHeight}, sichtbar ${visibleHeight()} px`);

  $('btn-test-pt').addEventListener('click', () => speakNow('Test pt-BR', SAMPLE_PT, state.bestPt, LANG_PT));
  $('btn-test-de').addEventListener('click', () => speakNow('Test de-DE', SAMPLE_DE, state.bestDe, LANG_DE));
  $('btn-stop').addEventListener('click', () => { stopEndurance(); log('Stopp: cancel()'); $('test-status').textContent = 'gestoppt'; });
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
  renderStatus();
  setInterval(renderStatus, 250);
  loadVoices().catch((err) => log(`Stimmen: Fehler ${err?.message || err}`));
}

// Für Tests: Zustand, Dauertest mit anderem Abstand, Protokoll.
window.diagnose = { state, runEndurance, speakNow, log, get logLines() { return logLines; } };

boot();
