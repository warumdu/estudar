// estudar – Oberfläche. Fünf Bildschirme: Heute, Session, Decks, Karte, Einstellungen.
// Kein Framework, kein Build: dieses Modul wird direkt vom Browser geladen.

import { openDatabase, newId } from './db.js';
import * as S from './scheduler.js';
import { compareAnswer, ACCENT_CHARS } from './compare.js';
import { TYPE_LABELS, parseCloze, needsTyping, typedSolution, createCards, validateCardInput, splitTags } from './cards.js';
import { buildBackup, backupFileName, parseBackup, previewImport, applyImport } from './backup.js';
import { probeDeck } from './seed.js';

export const APP_VERSION = '0.1.0';

const $ = (id) => document.getElementById(id);
const SCREENS = ['heute', 'session', 'decks', 'karte', 'einstellungen'];

const app = {
  db: null,
  settings: null,
  scheduler: null,
  session: null,        // laufende Lernsession (siehe startSession)
  registration: null,   // Service-Worker-Registrierung
  pendingUpdate: false, // neue Fassung wartet
  updateAccepted: false,
  editingCardId: null,
  lastDeckId: null,
  expandedDecks: new Set(),
};

/* =========================================================================
 * Start
 * ========================================================================= */

async function boot() {
  showStandaloneStatus();
  setupServiceWorker();
  try {
    app.db = await openDatabase();
  } catch (err) {
    fatal(`Die Datenbank ließ sich nicht öffnen: ${err.message}`);
    return;
  }
  app.settings = await app.db.getSettings();
  app.scheduler = S.makeScheduler(app.settings);
  await seedIfEmpty();
  bindEvents();
  window.addEventListener('hashchange', route);
  route();
}

function fatal(text) {
  const el = document.createElement('p');
  el.className = 'error';
  el.textContent = text;
  $('app').prepend(el);
}

/** Beim allerersten Start: Probe-Deck anlegen. Nach dem Löschen kommt es nicht wieder. */
async function seedIfEmpty() {
  if (app.settings.seeded) return;
  if ((await app.db.count('cards')) === 0) {
    const now = new Date();
    const { deck, cards } = probeDeck(now);
    await app.db.write({ puts: { decks: [deck], cards, cardStates: cards.map((c) => S.newState(c.id, now)) } });
  }
  await app.db.setSetting('seeded', true);
  app.settings.seeded = true;
}

/* =========================================================================
 * Navigation
 * ========================================================================= */

function currentRoute() {
  const hash = location.hash.replace(/^#/, '');
  const [screen, ...rest] = hash.split('/');
  return { screen: SCREENS.includes(screen) ? screen : 'heute', arg: rest.join('/') || null };
}

function route() {
  const { screen, arg } = currentRoute();
  if (screen === 'session' && !app.session) { location.replace('#heute'); return; }
  // Verlässt man die Session anders als über ihre Knöpfe (Reiter, Zurück-Geste), ist
  // sie beendet: Bewertungen sind gespeichert, die Liste wäre später veraltet.
  // Einzige Ausnahme: die aktuelle Karte bearbeiten (Stift) und zurückkommen.
  const editingCurrent = screen === 'karte' && arg && app.session?.current?.id === arg;
  if (app.session && screen !== 'session' && !editingCurrent) app.session = null;
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== screen;
  for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('active', a.dataset.tab === screen);
  document.body.classList.toggle('in-session', screen === 'session');
  if (app.pendingUpdate && screen !== 'session') showUpdateHint(); // wartete während der Session
  window.scrollTo(0, 0);
  const render = { heute: renderHeute, session: renderSession, decks: renderDecks, karte: () => renderKarte(arg), einstellungen: renderEinstellungen }[screen];
  render().catch((err) => { console.error(err); toast(`Fehler: ${err.message}`); });
}

function go(hash) { location.hash = hash; }

/* =========================================================================
 * Gemeinsame Helfer
 * ========================================================================= */

let toastTimer = 0;
function toast(text, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Einfacher Dialog: Rückfrage (Promise<boolean>) oder Eingabe (Promise<string|null>). */
function dialog({ text, okLabel = 'OK', danger = false, input = null }) {
  return new Promise((resolve) => {
    const box = $('dialog');
    const inp = $('dialog-input');
    $('dialog-text').textContent = text;
    inp.hidden = input === null;
    inp.value = input ?? '';
    const ok = $('dialog-ok');
    ok.textContent = okLabel;
    ok.classList.toggle('danger', danger);
    ok.classList.toggle('primary', !danger);
    box.hidden = false;
    if (input !== null) setTimeout(() => { inp.focus(); inp.select(); }, 50);
    const finish = (result) => {
      box.hidden = true;
      ok.onclick = null; $('dialog-cancel').onclick = null; inp.onkeydown = null;
      resolve(result);
    };
    ok.onclick = () => finish(input === null ? true : inp.value.trim());
    $('dialog-cancel').onclick = () => finish(input === null ? false : null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } };
  });
}

const confirmDialog = (text, opts = {}) => dialog({ text, ...opts });
const promptDialog = (text, value = '', opts = {}) => dialog({ text, input: value, ...opts });

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

async function loadAll() {
  const now = new Date();
  const [cards, states, reviewsToday, decks] = await Promise.all([
    app.db.listCards(), app.db.listStates(), app.db.listReviewsSince(S.startOfDay(now).toISOString()), app.db.listDecks(),
  ]);
  return { now, cards, states, reviewsToday, decks };
}

const formatDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

const formatDateTime = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* =========================================================================
 * 1. Heute
 * ========================================================================= */

async function renderHeute() {
  const { now, cards, states, reviewsToday } = await loadAll();
  const q = S.buildQueue({ cards, states, reviewsToday, settings: app.settings, now });
  const count = q.queue.length;
  const anyCards = cards.some((c) => !c.suspended);
  $('heute-count').textContent = String(count);
  $('heute-label').textContent = count === 0 ? 'Nichts fällig' : count === 1 ? 'fällige Karte' : 'fällige Karten';
  const notes = [];
  const waiting = q.backlog + q.deferredSiblings; // fällig, aber erst an den nächsten Tagen dran
  if (q.backlog > 0 && count > 0) notes.push(`Insgesamt ${q.dueTotal} fällig – der Rest verteilt sich auf die nächsten Tage (Tageslimit ${app.settings.dailyLimit}).`);
  if (q.backlog > 0 && count === 0) notes.push(`Tageslimit erreicht – ${q.backlog} weitere Wiederholung${q.backlog === 1 ? '' : 'en'} kommen an den nächsten Tagen.`);
  if (q.deferredSiblings > 0) notes.push(`${q.deferredSiblings} Gegenrichtung${q.deferredSiblings === 1 ? '' : 'en'} kommt erst morgen dran.`);
  if (count === 0 && anyCards && waiting === 0) notes.push('Für heute ist nichts fällig. Du kannst trotzdem üben – das ändert die Terminierung nicht.');
  $('heute-note').textContent = notes.join(' ');
  $('heute-note').hidden = notes.length === 0;
  $('btn-lernen').hidden = count === 0;
  $('btn-ueben').hidden = !(count === 0 && anyCards);
  $('heute-empty').hidden = anyCards;
  const doneToday = new Set(reviewsToday.map((r) => r.cardId)).size;
  $('heute-done').textContent = doneToday === 1 ? '1 Karte' : `${doneToday} Karten`;
  const next = S.nextDue({ cards, states, now });
  $('heute-next').textContent = count > 0 ? 'jetzt' : waiting > 0 ? 'morgen' : next ? S.nextDueText(next, now) : '–';
}

/* =========================================================================
 * 2. Session
 * ========================================================================= */

async function startSession(mode) {
  const { now, cards, states, reviewsToday } = await loadAll();
  const queue = mode === 'learn'
    ? S.buildQueue({ cards, states, reviewsToday, settings: app.settings, now }).queue
    : S.buildPracticeQueue({ cards, states, limit: app.settings.dailyLimit });
  if (!queue.length) { toast('Nichts zu lernen.'); return; }
  app.session = {
    mode, queue: queue.map((c) => c.id), index: 0,
    answers: 0, hits: 0, seen: new Set(), startedAt: Date.now(),
    current: null, currentState: null, preview: null, revealed: false, shownAt: 0, finished: false,
  };
  go('#session');
}

async function renderSession() {
  const s = app.session;
  if (s.finished) { showSummary(); return; }
  await showCard();
}

function setSessionView({ card = false, typing = false, grades = false, summary = false }) {
  $('session-card').hidden = !card;
  $('typing').hidden = !typing;
  $('grade-bar').hidden = !grades;
  $('session-summary').hidden = !summary;
  $('btn-session-edit').hidden = summary;
}

function renderQuestion(card, revealed) {
  const q = $('q-text');
  q.replaceChildren();
  if (card.type === 'cloze') {
    for (const part of parseCloze(card.front)) {
      if (part.cloze === undefined) q.append(document.createTextNode(part.text));
      else if (revealed) q.append(el('span', { class: 'filled', text: part.cloze }));
      else q.append(el('span', { class: 'gap', text: part.hint ? `[${part.hint}]` : '…' }));
    }
  } else {
    q.textContent = card.front;
  }
}

async function showCard() {
  const s = app.session;
  if (s.index >= s.queue.length) { finishSession(); return; }
  const id = s.queue[s.index];
  const card = await app.db.getCard(id);
  if (!card || card.suspended) { s.index += 1; return showCard(); } // inzwischen gelöscht oder pausiert
  const state = (await app.db.getState(id)) || S.newState(id);
  const now = new Date();
  Object.assign(s, { current: card, currentState: state, revealed: false, shownAt: performance.now() });
  s.preview = s.mode === 'learn' ? S.previewGrades(app.scheduler, state, now) : null;

  $('session-progress').textContent = `${s.index + 1} / ${s.queue.length}`;
  const typeLabel = card.type === 'vocab' ? (card.direction === 'pt-de' ? 'Vokabel · PT → DE' : 'Vokabel · DE → PT') : TYPE_LABELS[card.type] || card.type;
  $('q-type').textContent = s.mode === 'practice' ? `${typeLabel} · Übung ohne Terminierung` : typeLabel;
  renderQuestion(card, false);
  $('q-hint').textContent = card.hint || '';
  $('q-hint').hidden = !card.hint;
  $('a-block').hidden = true;
  $('a-verdict').hidden = true;
  $('a-text').replaceChildren();
  $('a-example').textContent = '';

  const typing = needsTyping(card, app.settings);
  $('tap-hint').textContent = typing ? 'Antwort eingeben und prüfen – oder antippen für die Lösung' : 'Antippen zeigt die Lösung';
  setSessionView({ card: true, typing });
  if (typing) {
    const input = $('typing-input');
    input.value = '';
    input.focus();
  }
}

/** Lösung zeigen. `typed` = Eingabe aus dem Tippfeld (oder undefined bei Antippen). */
function reveal(typed) {
  const s = app.session;
  if (!s || s.revealed || !s.current) return;
  s.revealed = true;
  const card = s.current;
  renderQuestion(card, true);
  const answerEl = $('a-text');
  answerEl.replaceChildren();
  const solution = typedSolution(card);
  const verdictEl = $('a-verdict');
  if (typed !== undefined && typed.trim() !== '') {
    const result = compareAnswer(typed, solution);
    for (const m of result.marks) answerEl.append(m.differs ? el('span', { class: 'diff', text: m.char }) : document.createTextNode(m.char));
    if (result.verdict === 'wrong') answerEl.append(el('span', { class: 'typed' }, ['Deine Eingabe: ', el('s', { text: typed.trim() })]));
    verdictEl.textContent = { exact: 'Richtig', accents: 'Richtig – Akzente oder Schreibung weichen ab', wrong: 'Falsch' }[result.verdict];
    verdictEl.className = `verdict ${result.verdict}`;
    verdictEl.hidden = false;
    s.lastVerdict = result.verdict;
  } else {
    answerEl.textContent = card.type === 'cloze' ? solution : card.back;
    verdictEl.hidden = true;
    s.lastVerdict = null;
  }
  $('a-example').textContent = card.example || '';
  $('a-block').hidden = false;
  $('tap-hint').hidden = true;

  const bar = $('grade-bar');
  bar.classList.toggle('practice', s.mode === 'practice');
  for (const g of S.GRADES) {
    const ivl = bar.querySelector(`[data-ivl="${g}"]`);
    ivl.textContent = s.mode === 'learn' ? s.preview[g].text : 'ohne Wertung';
  }
  setSessionView({ card: true, grades: true });
}

async function grade(g) {
  const s = app.session;
  if (!s || !s.revealed || !s.current || s.saving) return;
  const id = s.current.id;
  const durationMs = performance.now() - s.shownAt;
  let requeue = false;
  if (s.mode === 'learn') {
    const { state, review } = S.applyGrade(app.scheduler, s.currentState, g, new Date(), durationMs);
    s.saving = true; // doppeltes Antippen abfangen, solange geschrieben wird
    try {
      await app.db.recordReview(state, review);
    } catch (err) {
      // Nichts verstellen: die Karte bleibt aufgedeckt, die Bewertung kann wiederholt werden.
      toast(`Bewertung nicht gespeichert: ${err.message}`, 4000);
      return;
    } finally {
      s.saving = false;
    }
    // Lernschritte (1 min, 10 min): die Karte kommt in derselben Session wieder,
    // nach mindestens drei anderen Karten.
    const soon = new Date(state.due).getTime() - Date.now() < 30 * 60_000;
    requeue = state.state !== S.State.Review && soon;
  }
  s.answers += 1;
  if (g !== S.Rating.Again) s.hits += 1;
  s.seen.add(id);
  s.revealed = false;
  s.index += 1;
  if (requeue) s.queue.splice(Math.min(s.index + 3, s.queue.length), 0, id);
  $('tap-hint').hidden = false;
  await showCard();
}

function finishSession() {
  const s = app.session;
  if (!s) return;
  s.finished = true;
  s.endedAt = Date.now();
  showSummary();
}

function showSummary() {
  const s = app.session;
  $('summary-title').textContent = s.mode === 'practice' ? 'Übung beendet' : 'Fertig für heute';
  $('sum-cards').textContent = String(s.seen.size);
  $('sum-rate').textContent = s.answers ? `${Math.round((s.hits / s.answers) * 100)} %` : '–';
  $('sum-duration').textContent = formatDuration((s.endedAt || Date.now()) - s.startedAt);
  setSessionView({ summary: true });
  if (app.pendingUpdate) showUpdateHint();
}

function leaveSession() {
  const s = app.session;
  if (!s) { go('#heute'); return; }
  if (!s.finished && s.answers > 0) { finishSession(); return; }
  app.session = null;
  go('#heute');
}

/* =========================================================================
 * 3. Decks
 * ========================================================================= */

async function renderDecks() {
  const { now, cards, states, decks } = await loadAll();
  const stateById = new Map(states.map((s) => [s.cardId, s]));
  const list = $('deck-list');
  list.replaceChildren();
  $('decks-empty').hidden = decks.length > 0;
  decks.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  for (const deck of decks) {
    const deckCards = cards.filter((c) => c.deckId === deck.id);
    const due = deckCards.filter((c) => !c.suspended && stateById.has(c.id) && S.isDue(stateById.get(c.id), now)).length;
    const open = app.expandedDecks.has(deck.id);
    const meta = `${deckCards.length} Karte${deckCards.length === 1 ? '' : 'n'} · ${due} fällig`;
    const head = el('div', { class: 'deck-head', onclick: () => { app.expandedDecks.has(deck.id) ? app.expandedDecks.delete(deck.id) : app.expandedDecks.add(deck.id); renderDecks(); } }, [
      el('span', { class: 'name', text: deck.name }),
      el('span', { class: 'meta', text: meta }),
      el('span', { class: 'muted', text: open ? '▾' : '▸' }),
    ]);
    const node = el('div', { class: 'deck', dataset: { deckId: deck.id } }, [head]);
    if (open) {
      const actions = el('div', { class: 'deck-actions' }, [
        el('button', { type: 'button', class: 'btn small', text: '+ Karte', onclick: () => { app.lastDeckId = deck.id; go('#karte'); } }),
        el('button', { type: 'button', class: 'btn small', text: 'Umbenennen', onclick: () => renameDeck(deck) }),
        el('button', { type: 'button', class: 'btn small danger', text: 'Löschen', onclick: () => deleteDeck(deck, deckCards.length) }),
      ]);
      const ul = el('ul', { class: 'card-list' });
      deckCards.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      for (const c of deckCards) {
        ul.append(el('li', { dataset: { cardId: c.id }, onclick: () => go(`#karte/${c.id}`) }, [
          el('span', { class: 'front', text: c.type === 'cloze' ? parseCloze(c.front).map((p) => (p.cloze !== undefined ? `[${p.cloze}]` : p.text)).join('') : c.front }),
          el('span', { class: 'back', text: c.type === 'cloze' ? TYPE_LABELS.cloze : c.back }),
        ]));
      }
      if (!deckCards.length) ul.append(el('li', { class: 'muted', text: 'Keine Karten in diesem Deck.' }));
      node.append(el('div', { class: 'deck-body' }, [actions, ul]));
    }
    list.append(node);
  }
}

async function createDeck() {
  const name = await promptDialog('Name des neuen Decks', '', { okLabel: 'Anlegen' });
  if (!name) return null;
  const ts = new Date().toISOString();
  const deck = { id: newId('d-'), name, createdAt: ts, updatedAt: ts };
  await app.db.saveDeck(deck);
  toast(`Deck „${name}" angelegt`);
  return deck;
}

async function renameDeck(deck) {
  const name = await promptDialog('Neuer Name', deck.name, { okLabel: 'Umbenennen' });
  if (!name || name === deck.name) return;
  await app.db.saveDeck({ ...deck, name, updatedAt: new Date().toISOString() });
  renderDecks();
}

async function deleteDeck(deck, cardCount) {
  const ok = await confirmDialog(`Deck „${deck.name}" mit ${cardCount} Karte${cardCount === 1 ? '' : 'n'} löschen? Der Lernfortschritt dieser Karten geht verloren. Das Protokoll bleibt.`, { okLabel: 'Löschen', danger: true });
  if (!ok) return;
  await app.db.deleteDeck(deck.id);
  app.expandedDecks.delete(deck.id);
  toast('Deck gelöscht');
  renderDecks();
}

/* =========================================================================
 * 4. Karte
 * ========================================================================= */

const FIELD_LABELS = {
  vocab: ['Deutsch', 'Português'],
  cloze: ['Text mit Lücke, z. B. Ontem eu {{c1::fui}} ao mercado.', null],
  conjugation: ['Aufgabe, z. B. falar · pretérito perfeito · nós', 'Form, z. B. falamos'],
  sentence: ['Vorderseite', 'Rückseite'],
};

function selectedType() {
  return document.querySelector('#f-type input:checked')?.value || 'vocab';
}

function applyTypeToForm(type) {
  const [front, back] = FIELD_LABELS[type] || FIELD_LABELS.sentence;
  $('f-front-label').textContent = front;
  $('f-back-field').hidden = back === null;
  if (back !== null) $('f-back-label').textContent = back;
  $('f-both-field').hidden = type !== 'vocab' || app.editingCardId !== null;
  const ptFront = type === 'cloze' || type === 'sentence';
  $('f-front').setAttribute('autocapitalize', ptFront ? 'off' : 'sentences');
  $('f-front').setAttribute('autocorrect', ptFront ? 'off' : 'on');
}

async function fillDeckSelect(selectedId) {
  const decks = (await app.db.listDecks()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sel = $('f-deck');
  sel.replaceChildren();
  for (const d of decks) sel.append(el('option', { value: d.id, text: d.name }));
  sel.append(el('option', { value: '__new__', text: '+ Neues Deck …' }));
  const want = selectedId || app.lastDeckId;
  sel.value = decks.some((d) => d.id === want) ? want : decks[0]?.id || '__new__';
  return decks;
}

async function renderKarte(cardId) {
  app.editingCardId = cardId;
  $('f-error').hidden = true;
  const radios = document.querySelectorAll('#f-type input');
  if (cardId) {
    const card = await app.db.getCard(cardId);
    if (!card) { toast('Karte nicht gefunden'); go('#decks'); return; }
    $('karte-title').textContent = 'Karte bearbeiten';
    await fillDeckSelect(card.deckId);
    for (const r of radios) { r.checked = r.value === card.type; r.disabled = true; }
    $('f-front').value = card.front;
    $('f-back').value = card.back || '';
    $('f-example').value = card.example || '';
    $('f-hint').value = card.hint || '';
    $('f-tags').value = (card.tags || []).join(', ');
    $('f-both').checked = false;
    $('btn-card-cancel').hidden = false;
    $('btn-card-delete').hidden = false;
    $('btn-card-save').textContent = 'Änderung speichern';
  } else {
    $('karte-title').textContent = 'Neue Karte';
    await fillDeckSelect();
    for (const r of radios) r.disabled = false;
    clearCardForm();
    $('btn-card-cancel').hidden = true;
    $('btn-card-delete').hidden = true;
    $('btn-card-save').textContent = 'Speichern';
  }
  applyTypeToForm(selectedType());
}

function clearCardForm() {
  for (const id of ['f-front', 'f-back', 'f-example', 'f-hint', 'f-tags']) $(id).value = '';
  $('f-error').hidden = true;
}

async function saveCard(event) {
  event.preventDefault();
  const type = selectedType();
  const front = $('f-front').value;
  const back = $('f-back').value;
  const error = validateCardInput({ type, front, back });
  if (error) { $('f-error').textContent = error; $('f-error').hidden = false; return; }
  let deckId = $('f-deck').value;
  if (deckId === '__new__') {
    const deck = await createDeck();
    if (!deck) return;
    deckId = deck.id;
    await fillDeckSelect(deckId);
  }
  app.lastDeckId = deckId;
  const tags = splitTags($('f-tags').value);
  const example = $('f-example').value;
  const hint = $('f-hint').value;
  const now = new Date();

  if (app.editingCardId) {
    const old = await app.db.getCard(app.editingCardId);
    if (!old) { toast('Karte nicht gefunden'); go('#decks'); return; }
    const updated = { ...old, deckId, front: front.trim(), back: type === 'cloze' ? '' : back.trim(), example: example.trim(), hint: hint.trim(), tags, updatedAt: now.toISOString() };
    await app.db.saveCards([updated]);
    toast('Änderung gespeichert');
    if (app.session && !app.session.finished) go('#session'); else go('#decks');
    return;
  }

  const cards = createCards({ deckId, type, front, back: type === 'cloze' ? '' : back, example, hint, tags, bothDirections: type === 'vocab' && $('f-both').checked, now });
  await app.db.saveCards(cards, cards.map((c) => S.newState(c.id, now)));
  app.savedInRow = (app.savedInRow || 0) + cards.length;
  toast(cards.length === 2 ? `Gespeichert (2 Karten) · ${app.savedInRow} in Folge` : `Gespeichert · ${app.savedInRow} in Folge`);
  // Maske bleibt offen und leer für die nächste Karte; Deck, Typ und Ankreuzfeld bleiben stehen.
  clearCardForm();
  $('f-front').focus();
}

async function deleteCurrentCard() {
  const id = app.editingCardId;
  if (!id) return;
  const ok = await confirmDialog('Diese Karte löschen? Das Protokoll bleibt.', { okLabel: 'Löschen', danger: true });
  if (!ok) return;
  await app.db.deleteCard(id);
  const s = app.session;
  if (s) {
    // Aus der Liste nehmen; Vorkommen vor der aktuellen Position verschieben den Zeiger.
    s.index -= s.queue.slice(0, s.index).filter((q) => q === id).length;
    s.queue = s.queue.filter((q) => q !== id);
    s.current = null;
  }
  toast('Karte gelöscht');
  if (s && !s.finished) go('#session'); else go('#decks');
}

/* =========================================================================
 * 5. Einstellungen
 * ========================================================================= */

async function renderEinstellungen() {
  $('s-retention').value = String(app.settings.requestRetention.toFixed(2)).replace('.', ',');
  $('s-limit').value = String(app.settings.dailyLimit);
  $('s-typing').checked = !!app.settings.typeAnswerVocab;
  $('s-last-backup').textContent = app.settings.lastBackupAt ? formatDateTime(app.settings.lastBackupAt) : 'noch nie';
  $('s-card-count').textContent = String(await app.db.count('cards'));
  $('import-preview').hidden = true;
}

async function saveRetention() {
  const raw = $('s-retention').value.replace(',', '.');
  const value = S.clampRetention(raw);
  $('s-retention').value = value.toFixed(2).replace('.', ',');
  app.settings.requestRetention = value;
  app.scheduler = S.makeScheduler(app.settings);
  await app.db.setSetting('requestRetention', value);
  toast(`Zielretention ${value.toFixed(2).replace('.', ',')}`);
}

async function saveLimit() {
  const n = parseInt($('s-limit').value, 10);
  const value = Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 40;
  $('s-limit').value = String(value);
  app.settings.dailyLimit = value;
  await app.db.setSetting('dailyLimit', value);
  toast(`Tageslimit ${value}`);
}

async function saveTyping() {
  app.settings.typeAnswerVocab = $('s-typing').checked;
  await app.db.setSetting('typeAnswerVocab', app.settings.typeAnswerVocab);
}

/* ---- Sicherung ---- */

async function exportBackup() {
  const now = new Date();
  const data = await app.db.dumpAll();
  const json = JSON.stringify(buildBackup({ ...data, appVersion: APP_VERSION, now }), null, 1);
  const name = backupFileName(now);
  const file = new File([json], name, { type: 'application/json' });
  let delivered = false;
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      delivered = true;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // abgebrochen – keine Sicherung
      // Teilen nicht möglich (z. B. Aktivierung abgelaufen): auf Download ausweichen.
    }
  }
  if (!delivered) {
    // Kein Teilen-Blatt (Browser ohne Web Share, oder die Aktivierung war verstrichen):
    // Datei als Download anbieten. Ob sie wirklich gespeichert wurde, sieht die App
    // nicht – deshalb zählt das nicht als bestätigte Sicherung.
    const url = URL.createObjectURL(file);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 10_000);
    toast(`Teilen nicht möglich – ${name} als Download angeboten. Prüfe in „Dateien", ob sie da ist.`, 5000);
    return;
  }
  const ts = now.toISOString();
  app.settings.lastBackupAt = ts;
  await app.db.setSetting('lastBackupAt', ts);
  if (!$('screen-einstellungen').hidden) $('s-last-backup').textContent = formatDateTime(ts);
  toast('Sicherung erstellt');
}

async function importBackupFile(file) {
  const box = $('import-preview');
  box.replaceChildren();
  box.hidden = false;
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (err) {
    box.append(el('p', { class: 'error', text: err.message }));
    box.append(el('button', { type: 'button', class: 'btn wide', text: 'Schließen', onclick: () => { box.hidden = true; } }));
    return;
  }
  const current = await app.db.dumpAll();
  const p = previewImport(backup, current);
  box.append(el('p', {}, [el('strong', { text: file.name })]));
  box.append(el('ul', {}, [
    el('li', { text: `Datei: ${p.file.cards} Karten in ${p.file.decks} Decks, ${p.file.reviews} Protokolleinträge${p.file.exportedAt ? `, gesichert am ${formatDateTime(p.file.exportedAt)}` : ''}` }),
    el('li', { text: `Bestand jetzt: ${p.local.cards} Karten in ${p.local.decks} Decks` }),
    el('li', { text: `Zusammenführen: ${p.merge.newCards} neue, ${p.merge.updatedCards} aktualisierte, ${p.merge.unchangedCards} unveränderte Karten; Einstellungen bleiben` }),
    el('li', { text: `Ersetzen: danach ${p.replace.resultingCards} Karten, ${p.replace.removedCards} bisherige verschwinden; Einstellungen aus der Datei` }),
    el('li', { text: 'Das Protokoll wird in beiden Fällen nur ergänzt, nie gelöscht.' }),
  ]));
  const run = async (mode) => {
    if (mode === 'replace') {
      const ok = await confirmDialog(`Wirklich ersetzen? ${p.replace.removedCards} Karte${p.replace.removedCards === 1 ? '' : 'n'} und aller Lernfortschritt außerhalb der Datei gehen verloren.`, { okLabel: 'Ersetzen', danger: true });
      if (!ok) return;
    }
    try {
      const result = applyImport(backup, current, mode);
      await app.db.writeAll(result, { clear: result.clear });
      if (result.clear) await app.db.setSetting('schemaVersion', 1);
      await app.db.setSetting('seeded', true);
    } catch (err) {
      // Die Transaktion ist abgebrochen, der Bestand unverändert.
      box.replaceChildren(
        el('p', { class: 'error', text: `Import fehlgeschlagen, nichts wurde geändert: ${err.message}` }),
        el('button', { type: 'button', class: 'btn wide', text: 'Schließen', onclick: () => { box.hidden = true; } }),
      );
      return;
    }
    app.settings = await app.db.getSettings();
    app.scheduler = S.makeScheduler(app.settings);
    app.session = null;
    box.hidden = true;
    toast(mode === 'replace' ? 'Bestand ersetzt' : 'Zusammengeführt');
    renderEinstellungen();
  };
  box.append(el('div', { class: 'dialog-actions' }, [
    el('button', { type: 'button', class: 'btn', text: 'Abbrechen', onclick: () => { box.hidden = true; } }),
    el('button', { type: 'button', class: 'btn', id: 'btn-import-merge', text: 'Zusammenführen', onclick: () => run('merge') }),
    el('button', { type: 'button', class: 'btn danger', id: 'btn-import-replace', text: 'Ersetzen', onclick: () => run('replace') }),
  ]));
}

/* =========================================================================
 * Service Worker & Update-Hinweis
 * ========================================================================= */

function showStandaloneStatus() {
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const modeEl = $('st-mode');
  modeEl.textContent = standalone ? 'als App vom Home-Bildschirm ✓' : 'im Browser';
  modeEl.className = `value ${standalone ? 'ok' : ''}`;
  modeEl.dataset.state = standalone ? 'standalone' : 'browser';
}

function setOffline(state, text) {
  const e = $('st-offline');
  e.dataset.state = state;
  e.textContent = text;
  e.className = `value ${state === 'ready' ? 'ok' : state === 'error' ? 'bad' : 'pending'}`;
}

function showUpdateHint() {
  if (document.body.classList.contains('in-session') && app.session && !app.session.finished) return; // nie während einer Session
  $('update-hint').hidden = false;
  $('update-status').textContent = 'Eine neue Fassung wartet. Tippe oben auf „Aktualisieren".';
}

function offerUpdate() {
  app.pendingUpdate = true;
  showUpdateHint();
}

function acceptUpdate() {
  app.updateAccepted = true;
  const waiting = app.registration?.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setOffline('error', 'nicht möglich (Browser ohne Service Worker)');
    return;
  }
  // Neu geladen wird nur, wenn der Nutzer die neue Fassung angetippt hat –
  // nie selbsttätig (Phase 0 tat das noch).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (app.updateAccepted) window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((registration) => {
      app.registration = registration;
      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
          if (worker.state === 'redundant' && !navigator.serviceWorker.controller) {
            setOffline('error', 'Fehler: Installation gescheitert – bitte mit Internet neu laden');
          }
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate();
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    }).catch((err) => {
      setOffline('error', `Fehler: ${err && err.message ? err.message : err}`);
    });
    navigator.serviceWorker.ready.then(() => setOffline('ready', 'bereit ✓'));
  });
}

async function checkForUpdate() {
  const status = $('update-status');
  if (!app.registration) { status.textContent = 'Der Service Worker ist noch nicht bereit.'; return; }
  status.textContent = 'Suche …';
  try {
    await app.registration.update();
    if (app.registration.installing) {
      status.textContent = 'Neue Fassung wird geladen …';
    } else if (app.registration.waiting) {
      offerUpdate();
    } else {
      status.textContent = `Keine neue Fassung. Du hast ${APP_VERSION}.`;
    }
  } catch (err) {
    status.textContent = navigator.onLine === false ? 'Offline – Suche später mit Internet noch einmal.' : `Suche fehlgeschlagen: ${err.message}`;
  }
}

/* =========================================================================
 * Ereignisse
 * ========================================================================= */

function bindEvents() {
  $('btn-lernen').addEventListener('click', () => startSession('learn'));
  $('btn-ueben').addEventListener('click', () => startSession('practice'));

  // Session
  $('session-card').addEventListener('click', () => reveal($('typing').hidden ? undefined : $('typing-input').value));
  $('session-card').addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); } });
  $('typing-form').addEventListener('submit', (e) => { e.preventDefault(); reveal($('typing-input').value); });
  for (const btn of document.querySelectorAll('#grade-bar .grade')) {
    btn.addEventListener('click', () => grade(Number(btn.dataset.grade)));
  }
  $('btn-session-abbrechen').addEventListener('click', leaveSession);
  $('btn-session-edit').addEventListener('click', () => { if (app.session?.current) go(`#karte/${app.session.current.id}`); });
  $('btn-sum-heute').addEventListener('click', () => { app.session = null; go('#heute'); });
  $('btn-sum-backup').addEventListener('click', exportBackup);
  const bar = $('accent-bar');
  for (const ch of ACCENT_CHARS) {
    const b = el('button', { type: 'button', text: ch });
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // Tastatur bleibt offen
    b.addEventListener('click', () => insertAtCaret($('typing-input'), ch));
    bar.append(b);
  }
  document.addEventListener('keydown', (e) => {
    if (!app.session || $('screen-session').hidden || app.session.finished) return;
    if (document.activeElement === $('typing-input')) return;
    if (e.key >= '1' && e.key <= '4' && app.session.revealed) grade(Number(e.key));
  });

  // Decks
  $('btn-deck-neu').addEventListener('click', async () => { if (await createDeck()) renderDecks(); });

  // Karte
  $('card-form').addEventListener('submit', (e) => saveCard(e).catch((err) => { $('f-error').textContent = err.message; $('f-error').hidden = false; }));
  $('f-type').addEventListener('change', () => applyTypeToForm(selectedType()));
  $('f-deck').addEventListener('change', async () => {
    if ($('f-deck').value !== '__new__') { app.lastDeckId = $('f-deck').value; return; }
    const deck = await createDeck();
    await fillDeckSelect(deck?.id);
    if (deck) app.lastDeckId = deck.id;
  });
  $('btn-card-cancel').addEventListener('click', () => { if (app.session && !app.session.finished) go('#session'); else go('#decks'); });
  $('btn-card-delete').addEventListener('click', deleteCurrentCard);

  // Einstellungen
  $('s-retention').addEventListener('change', saveRetention);
  $('s-limit').addEventListener('change', saveLimit);
  $('s-typing').addEventListener('change', saveTyping);
  $('btn-export').addEventListener('click', exportBackup);
  $('s-import').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) importBackupFile(file).catch((err) => toast(`Import fehlgeschlagen: ${err.message}`));
  });
  $('btn-check-update').addEventListener('click', checkForUpdate);
  $('btn-update').addEventListener('click', acceptUpdate);

  // Zurück in der App: Heute aktualisieren.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentRoute().screen === 'heute') renderHeute().catch(() => {});
  });
}

function insertAtCaret(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
}

// Für Tests: Zugriff auf Datenbank, Zustand und Neuzeichnen.
app.route = route;
window.estudar = app;

boot().catch((err) => { console.error(err); fatal(`Start fehlgeschlagen: ${err.message}`); });
