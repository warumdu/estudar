// estudar – Deckformat „flashdeck/1": Einlesen (JSON, CSV), Prüfen mit
// verständlichen Fehlermeldungen, Dublettenerkennung, Export.
//
// Reine Funktionen ohne DOM und ohne IndexedDB, damit sie in Node testbar sind.
// Die verbindliche Beschreibung des Formats steht in docs/deck-format.md –
// dieses Modul setzt genau das um, nicht mehr.

import { CARD_TYPES } from './db.js';
import { hasCloze, parseCloze } from './cards.js';

export const DECK_SCHEMA = 'flashdeck/1';
export const BACKUP_SCHEMA_PREFIX = 'estudar-backup/';
export const DIRECTIONS = Object.freeze(['de-pt', 'pt-de', 'both']);
/** Spalten, die eine CSV-Datei haben darf. Nur „front" ist Pflicht (Kopfzeile). */
export const CSV_COLUMNS = Object.freeze(['front', 'back', 'type', 'tags', 'example', 'hint', 'direction', 'id']);
export const SEPARATORS = Object.freeze({ ';': 'Semikolon', '\t': 'Tabulator', ',': 'Komma' });

/** Fehler, der die ganze Datei betrifft (kein JSON, falsches Schema, keine Kopfzeile …). */
export class DeckFormatError extends Error {}

/* =========================================================================
 * Normalisierung & Dubletten
 * ========================================================================= */

const STRIP_MARKS = /[\u0300-\u036f]/g;
const BOM = /^\ufeff/;

/** Vergleichsform: ohne Akzente, klein, Leerraum zusammengefasst. */
export function normalizeKey(text) {
  return String(text ?? '').normalize('NFD').replace(STRIP_MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Schlüssel einer Karte für die Dublettenerkennung: Vorder- und Rückseite normalisiert. */
export function cardKey(front, back) {
  return `${normalizeKey(front)}\u241f${normalizeKey(back)}`;
}

/* =========================================================================
 * Eine Karte prüfen
 * ========================================================================= */

const isStr = (v) => typeof v === 'string';
const cleanText = (v) => String(v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
const present = (v) => v !== undefined && v !== null && v !== '';

/** Tags: Liste von Texten oder ein Text mit Kommas/Leerzeichen. Liefert null bei ungültigem Typ. */
export function parseTags(value) {
  if (!present(value)) return [];
  if (isStr(value)) return value.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  if (Array.isArray(value) && value.every(isStr)) return value.map((t) => t.trim()).filter(Boolean);
  return null;
}

/**
 * Prüft ein rohes Kartenobjekt (aus JSON oder aus einer CSV-Zeile).
 * @param raw   das Objekt aus der Datei
 * @param where Ortsangabe für die Fehlermeldung, z. B. "Zeile 14" oder "Karte 3"
 * @returns {{ card: object } | { error: string }}
 */
export function validateCard(raw, where = 'Karte') {
  const fail = (msg) => ({ error: `${where}: ${msg}` });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('kein Karten-Objekt');
  const type = present(raw.type) ? raw.type : 'vocab';
  if (!CARD_TYPES.includes(type)) return fail(`unbekannter Typ „${String(raw.type)}" (erlaubt: ${CARD_TYPES.join(', ')})`);

  // Feldnamen je Typ – die Namen aus docs/deck-format.md zuerst, front/back als Ersatz.
  const frontNames = type === 'cloze' ? ['text', 'front'] : type === 'conjugation' ? ['prompt', 'front'] : ['front'];
  const backNames = type === 'conjugation' ? ['answer', 'back'] : ['back'];
  const pick = (names) => { for (const n of names) if (present(raw[n])) return [n, raw[n]]; return [names[0], undefined]; };
  const [frontName, frontRaw] = pick(frontNames);
  if (frontRaw === undefined) return fail(`Feld ${frontName} fehlt`);
  if (!isStr(frontRaw)) return fail(`Feld ${frontName} muss Text sein`);
  const front = cleanText(frontRaw);
  if (!front) return fail(`Feld ${frontName} ist leer`);

  let back = '';
  if (type === 'cloze') {
    if (!hasCloze(front)) return fail(`Feld ${frontName} braucht mindestens eine Lücke in der Form {{c1::Wort}}`);
  } else {
    const [backName, backRaw] = pick(backNames);
    if (backRaw === undefined) return fail(`Feld ${backName} fehlt`);
    if (!isStr(backRaw)) return fail(`Feld ${backName} muss Text sein`);
    back = cleanText(backRaw);
    if (!back) return fail(`Feld ${backName} ist leer`);
  }

  for (const name of ['example', 'hint', 'note', 'id']) {
    if (present(raw[name]) && !isStr(raw[name]) && !(name === 'id' && typeof raw[name] === 'number')) return fail(`Feld ${name} muss Text sein`);
  }
  const tags = parseTags(raw.tags);
  if (tags === null) return fail('Feld tags muss eine Liste von Texten sein, z. B. ["substantiv", "dia03"]');

  let direction;
  if (present(raw.direction)) {
    if (type !== 'vocab') return fail('Feld direction gibt es nur beim Typ vocab');
    if (!DIRECTIONS.includes(raw.direction)) return fail(`Feld direction muss de-pt, pt-de oder both sein, nicht „${String(raw.direction)}"`);
    direction = raw.direction;
  }
  if (type === 'vocab') direction = direction || 'de-pt';

  const card = {
    type, front, back,
    example: present(raw.example) ? cleanText(raw.example) : '',
    hint: present(raw.hint) ? cleanText(raw.hint) : present(raw.note) ? cleanText(raw.note) : '',
    tags,
    sourceId: present(raw.id) ? String(raw.id).trim() : null,
  };
  if (direction) card.direction = direction;
  return { card };
}

/* =========================================================================
 * Format erkennen
 * ========================================================================= */

const decoder = new TextDecoder('utf-8'); // entfernt eine BOM am Anfang von selbst

export function deckNameFromFile(fileName) {
  const base = String(fileName ?? '').split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '').trim();
  return base || 'Import';
}

/**
 * Erkennt am Inhalt (nicht nur am Namen), was in der Datei steckt.
 * @returns {{ format: 'json'|'csv'|'backup'|'zip'|'unknown', text?: string, separator?: string, candidates?: string[], reason?: string }}
 *   candidates ist gesetzt, wenn das Trennzeichen einer CSV nicht eindeutig ist – dann muss gefragt werden.
 */
export function detectFormat({ name = '', bytes }) {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { format: 'zip', ext };
  }
  const text = decoder.decode(bytes);
  const trimmed = text.replace(BOM, '').trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (/"schema"\s*:\s*"estudar-backup\//.test(trimmed.slice(0, 2000))) return { format: 'backup', text, ext };
    return { format: 'json', text, ext };
  }
  if (ext === 'json') return { format: 'unknown', text, ext, reason: 'Die Datei heißt .json, beginnt aber nicht mit einer geschweiften Klammer – sie enthält kein JSON.' };
  if (!trimmed) return { format: 'unknown', text, ext, reason: 'Die Datei ist leer.' };
  if (/[\x00-\x08\x0e-\x1f]/.test(trimmed.slice(0, 1000))) return { format: 'unknown', text, ext, reason: 'Die Datei ist keine Textdatei.' };
  if (ext === 'tsv') return { format: 'csv', text, ext, separator: '\t' };
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const counts = Object.keys(SEPARATORS).map((sep) => [sep, firstLine.split(sep).length - 1]).sort((a, b) => b[1] - a[1]);
  if (counts[0][1] === 0) return { format: 'csv', text, ext, separator: ';' };
  if (counts[1][1] === counts[0][1]) {
    return { format: 'csv', text, ext, candidates: counts.filter(([, n]) => n === counts[0][1]).map(([sep]) => sep) };
  }
  return { format: 'csv', text, ext, separator: counts[0][0] };
}

/* =========================================================================
 * JSON
 * ========================================================================= */

function parsedDeckInfo(rawDeck, fileName) {
  if (rawDeck !== undefined && (rawDeck === null || typeof rawDeck !== 'object' || Array.isArray(rawDeck))) {
    throw new DeckFormatError('Feld deck muss ein Objekt sein, z. B. { "name": "Módulo 2 · Dia 03" }.');
  }
  const d = rawDeck || {};
  if (present(d.name) && !isStr(d.name)) throw new DeckFormatError('Feld deck.name muss Text sein.');
  const tags = parseTags(d.tags);
  if (tags === null) throw new DeckFormatError('Feld deck.tags muss eine Liste von Texten sein.');
  for (const k of ['front_lang', 'back_lang']) {
    if (present(d[k]) && !isStr(d[k])) throw new DeckFormatError(`Feld deck.${k} muss Text sein.`);
  }
  const name = present(d.name) ? cleanText(d.name) : '';
  return { name: name || deckNameFromFile(fileName), nameFromFile: !name, front_lang: d.front_lang || 'de-DE', back_lang: d.back_lang || 'pt-BR', tags };
}

/**
 * Liest eine JSON-Datei im Deckformat.
 * Wirft DeckFormatError, wenn die Datei als Ganzes unbrauchbar ist. Fehler
 * einzelner Karten landen in `errors`, die Karte wird übersprungen.
 * @returns {{ format: 'json', deck: object, cards: object[], errors: string[], total: number }}
 */
export function parseDeckJson(text, { fileName = '' } = {}) {
  let data;
  try {
    data = JSON.parse(String(text).replace(BOM, ''));
  } catch (err) {
    throw new DeckFormatError(`Die Datei ist kein gültiges JSON – vermutlich abgeschnitten oder eine Klammer bzw. ein Komma zu viel oder zu wenig. (${err.message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new DeckFormatError('Die Datei enthält kein JSON-Objekt mit den Feldern schema, deck und cards.');
  }
  if (isStr(data.schema) && data.schema.startsWith(BACKUP_SCHEMA_PREFIX)) {
    throw new DeckFormatError('Das ist eine Sicherung der ganzen App, kein Kartenstapel. Sicherungen spielst du unter Einstellungen → „Sicherung importieren" ein.');
  }
  if (data.schema !== DECK_SCHEMA) {
    throw new DeckFormatError(`Feld schema ${present(data.schema) ? `ist „${String(data.schema)}"` : 'fehlt'} – erwartet wird "${DECK_SCHEMA}".`);
  }
  const deck = parsedDeckInfo(data.deck, fileName);
  if (!Array.isArray(data.cards)) throw new DeckFormatError('Feld cards fehlt oder ist keine Liste.');
  if (data.cards.length === 0) throw new DeckFormatError('Die Liste cards ist leer.');
  const cards = [];
  const errors = [];
  data.cards.forEach((raw, i) => {
    const id = raw && typeof raw === 'object' && present(raw.id) ? ` (${String(raw.id)})` : '';
    const result = validateCard(raw, `Karte ${i + 1}${id}`);
    if (result.error) errors.push(result.error);
    else cards.push(result.card);
  });
  return { format: 'json', deck, cards, errors, total: data.cards.length };
}

/* =========================================================================
 * CSV
 * ========================================================================= */

/**
 * Zerlegt CSV-Text in Datensätze (RFC 4180: Anführungszeichen, "" als Zeichen,
 * Zeilenumbrüche innerhalb von Anführungszeichen). Jeder Datensatz kennt die
 * Zeilennummer, in der er beginnt – die steht später in der Fehlermeldung.
 * @returns {{ line: number, fields: string[] }[]}
 */
export function parseCsvRecords(text, separator = ';') {
  const src = String(text).replace(BOM, '');
  const records = [];
  let fields = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;
  const endField = () => { fields.push(field); field = ''; };
  const endRecord = () => { endField(); records.push({ line: recordLine, fields }); fields = []; recordLine = line; };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      if (ch === '\n') line += 1;
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i += 1; continue; }
    if (ch === separator) { endField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { line += 1; endRecord(); i += 1; continue; }
    field += ch; i += 1;
  }
  if (field !== '' || fields.length) endRecord();
  return records;
}

/**
 * Liest eine CSV-/TSV-Datei im Deckformat: erste Zeile Spaltennamen (mindestens
 * „front"), Trennzeichen Semikolon, Tabulator oder Komma, Kodierung UTF-8.
 * @returns {{ format: 'csv', deck: object, cards: object[], errors: string[], total: number, columns: string[] }}
 */
export function parseDeckCsv(text, { fileName = '', separator = ';' } = {}) {
  const records = parseCsvRecords(text, separator).filter((r) => r.fields.some((f) => f.trim() !== ''));
  if (!records.length) throw new DeckFormatError('Die Datei ist leer.');
  const header = records[0];
  const columns = header.fields.map((f) => f.trim().toLowerCase());
  if (!columns.includes('front')) {
    throw new DeckFormatError(`Kopfzeile fehlt: Die erste Zeile muss die Spaltennamen enthalten, mindestens „front" (z. B. front;back;type;tags;example). Gefunden: „${header.fields.join(separator === '\t' ? ' ⇥ ' : separator)}".`);
  }
  const rows = records.slice(1);
  if (!rows.length) throw new DeckFormatError('Die Datei enthält nach der Kopfzeile keine Karten.');
  const cards = [];
  const errors = [];
  for (const row of rows) {
    const where = `Zeile ${row.line}`;
    const extra = row.fields.slice(columns.length).filter((f) => f.trim() !== '');
    if (extra.length) {
      errors.push(`${where}: ${row.fields.length} Spalten statt ${columns.length} – enthält ein Feld das Trennzeichen „${SEPARATORS[separator] || separator}"? Dann das Feld in Anführungszeichen setzen.`);
      continue;
    }
    const raw = {};
    columns.forEach((name, i) => { if (CSV_COLUMNS.includes(name)) raw[name] = (row.fields[i] ?? '').trim(); });
    const result = validateCard(raw, where);
    if (result.error) errors.push(result.error);
    else cards.push(result.card);
  }
  const name = deckNameFromFile(fileName);
  return { format: 'csv', deck: { name, nameFromFile: true, front_lang: 'de-DE', back_lang: 'pt-BR', tags: [] }, cards, errors, total: rows.length, columns };
}

/** Liest Text im erkannten Format. */
export function parseDeck(text, { format, fileName = '', separator = ';' }) {
  if (format === 'json') return parseDeckJson(text, { fileName });
  if (format === 'csv') return parseDeckCsv(text, { fileName, separator });
  throw new DeckFormatError(`Unbekanntes Format „${format}".`);
}

/* =========================================================================
 * Importplan: Ausklappen (beide Richtungen), Dubletten
 * ========================================================================= */

/**
 * Macht aus geprüften Karten die Karten, die wirklich entstehen: eine Vokabel
 * mit direction "both" wird zu zwei Karten (de-pt und pt-de) mit gemeinsamer Gruppe.
 */
export function expandCards(cards) {
  const out = [];
  cards.forEach((c, group) => {
    if (c.type === 'vocab' && c.direction === 'both') {
      out.push({ ...c, direction: 'de-pt', group });
      out.push({ ...c, front: c.back, back: c.front, direction: 'pt-de', group });
    } else {
      out.push({ ...c, group });
    }
  });
  return out;
}

/**
 * Teilt die Karten in neue und Dubletten. Dublette = gleiche Vorder- und
 * Rückseite (normalisiert) wie eine Karte im Zieldeck oder eine frühere Karte
 * derselben Datei. Dubletten werden übersprungen, nie überschrieben.
 * @returns {{ fresh: object[], duplicates: object[] }}
 */
export function planImport(cards, existingCards = []) {
  const seen = new Set(existingCards.map((c) => cardKey(c.front, c.back)));
  const fresh = [];
  const duplicates = [];
  for (const c of expandCards(cards)) {
    const key = cardKey(c.front, c.back);
    if (seen.has(key)) { duplicates.push(c); continue; }
    seen.add(key);
    fresh.push(c);
  }
  return { fresh, duplicates };
}

function randomBase() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, '0')}`;
}

/**
 * Baut die Kartendatensätze für die Datenbank. Kennungen sind innerhalb des
 * Imports garantiert eindeutig (Basis + laufende Nummer); createdAt steigt je
 * Karte um eine Millisekunde, damit neue Karten in Dateireihenfolge drankommen.
 */
export function buildImportRecords(fresh, { deckId, now = new Date(), base = randomBase() }) {
  return fresh.map((e, i) => {
    const ts = new Date(now.getTime() + i).toISOString();
    const card = {
      id: `c-${base}-${i.toString(36)}`,
      noteId: `n-${base}-${e.group.toString(36)}`,
      deckId,
      type: e.type,
      front: e.front,
      back: e.back,
      example: e.example || '',
      hint: e.hint || '',
      tags: e.tags || [],
      createdAt: ts,
      updatedAt: ts,
      suspended: false,
    };
    if (e.direction) card.direction = e.direction;
    if (e.sourceId) card.sourceId = e.sourceId;
    return card;
  });
}

/** Klartext einer Karte für die Vorschau. */
export function cardPreviewText(card) {
  if (card.type === 'cloze') {
    return parseCloze(card.front).map((p) => (p.cloze !== undefined ? `[${p.cloze}]` : p.text)).join('');
  }
  const arrow = card.type === 'vocab' && card.direction === 'both' ? ' ⇄ ' : ' → ';
  return `${card.front}${arrow}${card.back}`;
}

/* =========================================================================
 * Export eines Decks im Deckformat (ohne Lernzustand)
 * ========================================================================= */

const swapped = (a, b) => normalizeKey(a.front) === normalizeKey(b.back) && normalizeKey(a.back) === normalizeKey(b.front);

/**
 * Deck + Karten → Objekt im Deckformat. Vokabelpaare (gleiche noteId, de-pt und
 * pt-de mit vertauschten Seiten) werden zu EINER Karte mit direction "both".
 */
export function deckToFile(deck, cards) {
  const sorted = [...cards].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  const byNote = new Map();
  for (const c of sorted) if (c.noteId) byNote.set(c.noteId, [...(byNote.get(c.noteId) || []), c]);
  const skip = new Set();
  const out = [];
  for (const c of sorted) {
    if (skip.has(c.id)) continue;
    const entry = {};
    if (c.sourceId) entry.id = c.sourceId;
    entry.type = c.type;
    if (c.type === 'cloze') {
      entry.text = c.front;
      if (c.hint) entry.note = c.hint;
    } else if (c.type === 'conjugation') {
      entry.prompt = c.front;
      entry.answer = c.back;
      if (c.hint) entry.hint = c.hint;
    } else {
      let front = c.front, back = c.back, direction = c.direction;
      if (c.type === 'vocab') {
        const siblings = (byNote.get(c.noteId) || []).filter((s) => s.id !== c.id && s.type === 'vocab');
        const partner = siblings.find((s) => swapped(c, s) && s.direction !== c.direction);
        if (partner && siblings.length === 1) {
          skip.add(partner.id);
          if (c.direction === 'pt-de') { front = partner.front; back = partner.back; }
          direction = 'both';
        }
      }
      entry.front = front;
      entry.back = back;
      if (c.type === 'vocab' && direction && direction !== 'de-pt') entry.direction = direction;
      if (c.hint) entry.hint = c.hint;
    }
    if (c.example) entry.example = c.example;
    if (c.tags?.length) entry.tags = [...c.tags];
    out.push(entry);
  }
  return {
    schema: DECK_SCHEMA,
    deck: { name: deck.name, front_lang: 'de-DE', back_lang: 'pt-BR', tags: [...(deck.tags || [])] },
    cards: out,
  };
}

/** Dateiname für den Export, z. B. "deck-modulo-2-dia-03.json". */
export function deckFileName(deck) {
  const slug = normalizeKey(deck.name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `deck-${slug || 'ohne-namen'}.json`;
}
