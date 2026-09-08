// estudar – Datenhaltung in IndexedDB.
//
// Speicher (siehe docs/phase-1.md): cards, cardStates, reviews, settings –
// dazu decks, weil ein Deck einen Namen braucht, der beim Umbenennen nicht in
// jeder Karte geändert werden soll.
//
// Alle Zeitangaben werden als ISO-8601-Strings (UTC) gespeichert. Sie sortieren
// als Text korrekt, lassen sich unverändert nach JSON exportieren, und ts-fsrs
// nimmt sie als Eingabe direkt an (siehe scheduler.js).
//
// Das Schema ist versioniert: DB_VERSION ist die IndexedDB-Version, migrate()
// bringt eine ältere Datenbank Schritt für Schritt auf den aktuellen Stand.

export const DB_NAME = 'estudar';
export const DB_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  requestRetention: 0.9,   // Zielretention
  dailyLimit: 40,          // Tageslimit für Wiederholungen
  typeAnswerVocab: false,  // Vokabeln DE→PT per Eingabefeld statt Antippen
});

export const CARD_TYPES = Object.freeze(['vocab', 'cloze', 'conjugation', 'sentence']);

/**
 * Schema-Migration. Läuft in der "versionchange"-Transaktion von IndexedDB.
 * Jede Schemaversion bekommt einen eigenen Block, damit eine Datenbank von
 * Version n auf n+k in einem Durchlauf nachgezogen werden kann.
 * @param {IDBDatabase} db
 * @param {number} oldVersion  0 = die Datenbank ist neu
 * @param {IDBTransaction} tx  die laufende versionchange-Transaktion
 */
export function migrate(db, oldVersion, tx) {
  if (oldVersion < 1) {
    const cards = db.createObjectStore('cards', { keyPath: 'id' });
    cards.createIndex('deckId', 'deckId');
    cards.createIndex('noteId', 'noteId');
    const states = db.createObjectStore('cardStates', { keyPath: 'cardId' });
    states.createIndex('due', 'due');
    const reviews = db.createObjectStore('reviews', { keyPath: 'id' });
    reviews.createIndex('cardId', 'cardId');
    reviews.createIndex('ts', 'ts');
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('decks', { keyPath: 'id' });
    tx.objectStore('settings').put({ key: 'schemaVersion', value: 1 });
  }
  // Version 2 käme hier: if (oldVersion < 2) { … }
}

export const STORES = Object.freeze(['decks', 'cards', 'cardStates', 'reviews', 'settings']);

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB-Anfrage gescheitert'));
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaktion gescheitert'));
    tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
  });
}

/** Öffnet (und bei Bedarf migriert) die Datenbank. */
export function openDatabase({ name = DB_NAME, version = DB_VERSION, factory = globalThis.indexedDB } = {}) {
  return new Promise((resolve, reject) => {
    if (!factory) return reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar'));
    const request = factory.open(name, version);
    request.onupgradeneeded = (event) => {
      migrate(request.result, event.oldVersion, request.transaction);
    };
    request.onblocked = () => reject(new Error('Datenbank ist durch ein anderes Fenster blockiert – bitte alle Fenster der App schließen'));
    request.onerror = () => reject(request.error || new Error('Datenbank ließ sich nicht öffnen'));
    request.onsuccess = () => {
      const idb = request.result;
      // Ein anderes Fenster will das Schema anheben: Verbindung freigeben.
      idb.onversionchange = () => idb.close();
      resolve(new Database(idb));
    };
  });
}

export class Database {
  constructor(idb) { this.idb = idb; }

  close() { this.idb.close(); }

  /* ---- generische Zugriffe ---- */

  async getAll(store, index, range) {
    const tx = this.idb.transaction(store, 'readonly');
    const source = index ? tx.objectStore(store).index(index) : tx.objectStore(store);
    return req(source.getAll(range));
  }

  async get(store, key) {
    return req(this.idb.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async count(store) {
    return req(this.idb.transaction(store, 'readonly').objectStore(store).count());
  }

  async put(store, value) {
    const tx = this.idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await done(tx);
    return value;
  }

  /** Mehrere Schreibvorgänge in EINER Transaktion: { store: [werte…] } bzw. deletes: { store: [schlüssel…] } */
  async write({ puts = {}, deletes = {}, clear = [] } = {}) {
    const stores = [...new Set([...Object.keys(puts), ...Object.keys(deletes), ...clear])];
    if (!stores.length) return;
    const tx = this.idb.transaction(stores, 'readwrite');
    for (const store of clear) tx.objectStore(store).clear();
    for (const [store, keys] of Object.entries(deletes)) {
      const os = tx.objectStore(store);
      for (const key of keys) os.delete(key);
    }
    for (const [store, values] of Object.entries(puts)) {
      const os = tx.objectStore(store);
      for (const value of values) os.put(value);
    }
    await done(tx);
  }

  /* ---- Einstellungen ---- */

  async getSettings() {
    const rows = await this.getAll('settings');
    const out = { ...DEFAULT_SETTINGS };
    for (const row of rows) out[row.key] = row.value;
    return out;
  }

  async setSetting(key, value) {
    await this.put('settings', { key, value });
  }

  /* ---- Decks ---- */

  listDecks() { return this.getAll('decks'); }

  async saveDeck(deck) { return this.put('decks', deck); }

  /** Löscht ein Deck samt Karten und Zuständen. Das Protokoll bleibt. */
  async deleteDeck(deckId) {
    const cards = await this.getAll('cards', 'deckId', IDBKeyRange.only(deckId));
    const ids = cards.map((c) => c.id);
    await this.write({ deletes: { decks: [deckId], cards: ids, cardStates: ids } });
    return ids.length;
  }

  /* ---- Karten ---- */

  listCards(deckId) {
    return deckId ? this.getAll('cards', 'deckId', IDBKeyRange.only(deckId)) : this.getAll('cards');
  }

  getCard(id) { return this.get('cards', id); }

  /** Speichert Karten und – wo angegeben – ihre Zustände in einer Transaktion. */
  async saveCards(cards, states = []) {
    await this.write({ puts: { cards, cardStates: states } });
  }

  /** Löscht eine Karte und ihren Zustand. Das Protokoll bleibt. */
  async deleteCard(id) {
    await this.write({ deletes: { cards: [id], cardStates: [id] } });
  }

  /* ---- Zustände & Protokoll ---- */

  listStates() { return this.getAll('cardStates'); }

  getState(cardId) { return this.get('cardStates', cardId); }

  /** Zustände mit Fälligkeit bis einschließlich `untilIso` (Index "due"). */
  listStatesDueUntil(untilIso) {
    return this.getAll('cardStates', 'due', IDBKeyRange.upperBound(untilIso));
  }

  listReviews() { return this.getAll('reviews'); }

  /** Protokolleinträge ab einem Zeitpunkt (Index "ts"). */
  listReviewsSince(sinceIso) {
    return this.getAll('reviews', 'ts', IDBKeyRange.lowerBound(sinceIso));
  }

  /** Eine Bewertung: neuer Zustand und Protokolleintrag zusammen, atomar. */
  async recordReview(state, review) {
    await this.write({ puts: { cardStates: [state], reviews: [review] } });
  }

  /* ---- Gesamtbestand (Sicherung) ---- */

  async dumpAll() {
    const [decks, cards, cardStates, reviews, settings] = await Promise.all([
      this.getAll('decks'), this.getAll('cards'), this.getAll('cardStates'), this.getAll('reviews'), this.getAll('settings'),
    ]);
    return { decks, cards, cardStates, reviews, settings };
  }

  /**
   * Schreibt einen kompletten Bestand. Mit clear=true werden decks, cards,
   * cardStates und settings vorher geleert – das Protokoll nie, es wird nur ergänzt.
   */
  async writeAll({ decks = [], cards = [], cardStates = [], reviews = [], settings = [] }, { clear = false } = {}) {
    await this.write({
      clear: clear ? ['decks', 'cards', 'cardStates', 'settings'] : [],
      puts: { decks, cards, cardStates, reviews, settings },
    });
  }

  /** Nur für Tests: alles löschen, auch das Protokoll. */
  async wipeForTests() {
    await this.write({ clear: [...STORES] });
  }
}

/** Zufällige, kurze, eindeutige Kennung (Zeit + Zufall), z. B. "m1k3z9-4f2a". */
export function newId(prefix = '') {
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, '0');
  return `${prefix}${time}-${rand}`;
}
