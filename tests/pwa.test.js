// Prüft die PWA-Hülle aus Phase 0: Manifest, Icons, Meta-Tags, Service Worker.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { ROOT, pngSize, readText } from './helpers/repo.js';

const manifest = JSON.parse(readText('manifest.webmanifest'));
const html = readText('index.html');
const sw = readText('sw.js');
const pkg = JSON.parse(readText('package.json'));

test('Manifest: Pflichtfelder, relative Pfade, Icons vorhanden', () => {
  assert.equal(manifest.name, 'estudar');
  assert.equal(manifest.short_name, 'estudar');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'de');
  assert.equal(manifest.start_url, './', 'start_url muss relativ sein (GitHub-Pages-Unterverzeichnis)');
  assert.equal(manifest.scope, './');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `Icon-Pfad muss relativ sein: ${icon.src}`);
    assert.ok(existsSync(join(ROOT, icon.src)), `Icon fehlt: ${icon.src}`);
    assert.equal(icon.type, 'image/png');
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(icon.src), { width: w, height: h }, `${icon.src}: sizes stimmt nicht`);
  }
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'), '192x192 fehlt');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && !i.purpose), '512x512 (any) fehlt');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), '512x512 maskable fehlt');
});

test('index.html: iOS-Installations-Tags und Manifest-Verweis', () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<meta charset="utf-8">/i);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="estudar"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style"/);
  assert.match(html, /name="theme-color" content="#0d1210"/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
  assert.deepEqual(pngSize('icons/icon-180.png'), { width: 180, height: 180 });
  assert.match(html, /<title>estudar<\/title>/);
  assert.match(html, /<script type="module" src="app\/main\.js">/);
  assert.match(readText('app/main.js'), /serviceWorker\.register\('sw\.js'/);
  assert.doesNotMatch(html, /(?:href|src)=["']\//, 'absolute Pfade brechen unter /estudar/');
});

test('Version ist in package.json, sw.js, index.html und app/main.js identisch', () => {
  const swVersion = sw.match(/var VERSION = '([^']+)'/)?.[1];
  const htmlVersion = html.match(/id="st-version">([^<]+)</)?.[1];
  const appVersion = readText('app/main.js').match(/export const APP_VERSION = '([^']+)'/)?.[1];
  assert.equal(swVersion, pkg.version, 'sw.js VERSION weicht von package.json ab');
  assert.equal(htmlVersion, pkg.version, 'index.html Version weicht von package.json ab');
  assert.equal(appVersion, pkg.version, 'app/main.js APP_VERSION weicht von package.json ab');
});

/**
 * Führt sw.js in einer Sandbox aus, löst "install" und "activate" aus und
 * prüft: alle Dateien der App-Hülle existieren und landen unter ihrer sauberen
 * Adresse im versionierten Cache; alte estudar-Caches werden gelöscht.
 */
async function runServiceWorker() {
  const scriptUrl = 'https://example.test/estudar/sw.js';
  const stores = new Map([['estudar-v0.0.0-alt', new Map()], ['fremd', new Map()]]);
  const listeners = {};
  const fetched = [];
  const resolveUrl = (input) => new URL(typeof input === 'string' ? input : input.url, scriptUrl).href;
  const clean = (href) => href.split('?')[0];

  const makeCache = (store) => ({
    put: async (key, response) => { store.set(clean(resolveUrl(key)), response); },
    match: async (key) => store.get(clean(resolveUrl(key))) ?? undefined,
    keys: async () => [...store.keys()],
  });
  const caches = {
    open: async (name) => { if (!stores.has(name)) stores.set(name, new Map()); return makeCache(stores.get(name)); },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const fetch = async (input) => {
    const href = resolveUrl(input);
    fetched.push(href);
    const rel = decodeURIComponent(clean(href).replace('https://example.test/estudar/', ''));
    const file = join(ROOT, rel === '' ? 'index.html' : rel);
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(readText(rel === '' ? 'index.html' : rel), { status: 200 });
  };
  const self = {
    location: new URL(scriptUrl),
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    skipWaiting: async () => { self.skipped = true; },
    clients: { claim: async () => { self.claimed = true; } },
  };
  const context = vm.createContext({ self, caches, fetch, Response, Request, URL, Promise, Error, TypeError, console });
  vm.runInContext(sw, context, { filename: 'sw.js' });
  // Top-Level-"var" in sw.js landet auf dem Sandbox-Global – so kommen wir ohne Regex an die echten Werte.
  const APP_SHELL = context.APP_SHELL;
  const VERSION = context.VERSION;

  const dispatch = async (type, extra = {}) => {
    const waits = [];
    const event = { waitUntil: (p) => waits.push(p), ...extra };
    for (const fn of listeners[type] ?? []) fn(event);
    await Promise.all(waits);
  };
  /** Schickt einen GET durch den fetch-Handler; offline=true lässt fetch() scheitern. */
  const request = async (path, { mode = 'no-cors', offline = false } = {}) => {
    const req = { url: new URL(path, scriptUrl).href, method: 'GET', mode };
    let responded;
    const realFetch = context.fetch;
    if (offline) context.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      for (const fn of listeners.fetch ?? []) fn({ request: req, respondWith: (p) => { responded = p; } });
      return responded ? await responded : undefined; // undefined = Handler hat die Anfrage dem Browser überlassen
    } finally { context.fetch = realFetch; }
  };
  await dispatch('install');
  await dispatch('activate');
  return { self, stores, fetched, listeners, APP_SHELL, VERSION, request };
}

test('sw.js: fetch-Handler – Cache zuerst, Offline-Fallback nur im App-Verzeichnis', async () => {
  const { request } = await runServiceWorker();
  const shell = await request('./index.html', { offline: true });
  assert.equal(shell.status, 200, 'App-Hülle muss offline aus dem Cache kommen');
  assert.match(await shell.text(), /<title>estudar<\/title>/);
  const root = await request('./?quelle=homescreen', { mode: 'navigate', offline: true });
  assert.equal(root.status, 200, 'Start-URL mit Query muss offline den Cache treffen');
  const unknownFlat = await request('./unbekannt', { mode: 'navigate', offline: true });
  assert.equal(unknownFlat.status, 200, 'unbekannte Adresse direkt im App-Verzeichnis fällt auf index.html zurück');
  const unknownDeep = await request('./unbekannt/seite', { mode: 'navigate', offline: true });
  assert.equal(unknownDeep.status, 503, 'tiefere Pfade bekommen keine index.html');
  const asset = await request('./gibt-es-nicht.png', { offline: true });
  assert.equal(asset.status, 503);
  assert.match(await asset.text(), /Offline und nicht im Cache/);
  const foreign = await request('https://fremd.example/x.js');
  assert.equal(foreign, undefined, 'fremde Ursprünge gehen am Service Worker vorbei');
});

/**
 * Alle relativen Dateien, die index.html und das Manifest referenzieren (ohne
 * sw.js, das der Browser selbst holt) – und rekursiv alles, was die JS-Module
 * per import laden. Fehlt eine davon im Precache, bricht die App offline.
 */
function referencedAssets() {
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const ref = m[1];
    if (/^(?:[a-z]+:|#)/i.test(ref) || ref === 'sw.js') continue;
    refs.add(ref);
  }
  for (const icon of manifest.icons) refs.add(icon.src);
  const queue = [...refs].filter((r) => r.endsWith('.js'));
  while (queue.length) {
    const file = queue.pop();
    if (!existsSync(join(ROOT, file))) continue;
    for (const m of readText(file).matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const resolved = posix.normalize(posix.join(posix.dirname(file), m[1]));
      if (!refs.has(resolved)) { refs.add(resolved); queue.push(resolved); }
    }
  }
  return [...refs];
}

test('sw.js: Precache enthält jede Datei der App-Hülle und die Dateien existieren', async () => {
  const { self, stores, fetched, APP_SHELL: shell, VERSION } = await runServiceWorker();
  assert.equal(VERSION, pkg.version);
  const cacheName = `estudar-v${pkg.version}`;
  assert.ok(stores.has(cacheName), `Cache ${cacheName} wurde nicht angelegt`);
  const cached = [...stores.get(cacheName).keys()].sort();
  assert.ok(Array.isArray(shell) && shell.length >= 5, 'APP_SHELL nicht gefunden');
  assert.ok(shell.every((p) => p.startsWith('./')), 'APP_SHELL-Einträge müssen relativ (./) sein');
  for (const path of shell) {
    const rel = path.replace(/^\.\//, '');
    if (rel !== '') assert.ok(existsSync(join(ROOT, rel)), `APP_SHELL verweist auf fehlende Datei: ${path}`);
    assert.ok(cached.includes(new URL(path, 'https://example.test/estudar/sw.js').href), `${path} nicht im Cache`);
  }
  for (const [rel, expected] of [['index.html', './index.html'], ['manifest.webmanifest', './manifest.webmanifest'], ['icons/icon-180.png', './icons/icon-180.png']]) {
    assert.ok(shell.includes(expected), `${rel} fehlt in APP_SHELL`);
  }
  assert.ok(fetched.every((u) => u.includes('?v=' + pkg.version)), 'Precache muss den HTTP-Cache per Versionsparameter umgehen');
  assert.notEqual(self.skipped, true, 'skipWaiting() darf bei der Installation nicht mehr laufen – die neue Fassung wartet auf den Nutzer');
  assert.equal(self.claimed, true, 'clients.claim() fehlt');
  assert.ok(!stores.has('estudar-v0.0.0-alt'), 'alter estudar-Cache wurde nicht gelöscht');
  assert.ok(stores.has('fremd'), 'fremde Caches dürfen nicht angefasst werden');
});

test('sw.js: alles, was index.html, Manifest und die Module referenzieren, steht in APP_SHELL', async () => {
  const { APP_SHELL } = await runServiceWorker();
  const shell = new Set(APP_SHELL.map((p) => p.replace(/^\.\//, '')));
  const refs = referencedAssets();
  assert.ok(refs.includes('vendor/ts-fsrs/index.js'), 'Modul-Importe müssen rekursiv erkannt werden');
  const missing = refs.filter((ref) => !shell.has(ref));
  assert.deepEqual(missing, [], 'referenzierte Dateien fehlen im Precache – offline würden sie fehlen');
});

test('sw.js: skipWaiting() erst auf die Nachricht SKIP_WAITING der Seite', async () => {
  const { self, listeners } = await runServiceWorker();
  assert.ok(listeners.message?.length, 'sw.js braucht einen message-Handler');
  for (const fn of listeners.message) fn({ data: { type: 'irgendwas' } });
  assert.notEqual(self.skipped, true);
  for (const fn of listeners.message) fn({ data: { type: 'SKIP_WAITING' } });
  assert.equal(self.skipped, true);
});

test('sw.js: VERSION ist gegenüber origin/main erhöht, wenn sich App-Dateien geändert haben', async () => {
  // Ohne Build-Schritt gibt es keinen automatischen Cache-Buster: Eine geänderte
  // App-Hülle erreicht installierte Geräte nur, wenn VERSION steigt.
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let mainSw;
  try { mainSw = git('show', 'origin/main:sw.js'); } catch { return; } // main hat noch keinen Service Worker (erste Auslieferung)
  const mainVersion = mainSw.match(/var VERSION = '([^']+)'/)?.[1];
  const { APP_SHELL } = await runServiceWorker();
  const appFiles = [...new Set(['sw.js', 'index.html', 'manifest.webmanifest', ...APP_SHELL.map((p) => p.replace(/^\.\//, '')).filter(Boolean)])];
  const changed = appFiles.filter((f) => {
    try { return git('show', `origin/main:${f}`) !== readText(f); } catch { return true; }
  });
  if (changed.length) {
    assert.notEqual(pkg.version, mainVersion, `App-Dateien geändert (${changed.join(', ')}), aber VERSION ist noch ${mainVersion} wie auf main`);
  }
});

test('sw.js: Installation scheitert, wenn eine Datei der Hülle fehlt', async () => {
  const broken = sw.replace("'./index.html',", "'./index.html',\n  './gibt-es-nicht.png',");
  const stores = new Map();
  const listeners = {};
  const self = { location: new URL('https://example.test/estudar/sw.js'), addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const caches = { open: async (n) => { stores.set(n, new Map()); return { put: async () => {}, match: async () => undefined }; }, keys: async () => [], delete: async () => true };
  const fetch = async (u) => new Response('', { status: u.includes('gibt-es-nicht') ? 404 : 200 });
  vm.runInContext(broken, vm.createContext({ self, caches, fetch, Response, Request, URL, Promise, Error, console }), { filename: 'sw.js' });
  const waits = [];
  for (const fn of listeners.install) fn({ waitUntil: (p) => waits.push(p) });
  await assert.rejects(Promise.all(waits), /Precache fehlgeschlagen/);
});

test('.nojekyll liegt im Stamm (GitHub Pages ohne Jekyll)', () => {
  assert.ok(existsSync(join(ROOT, '.nojekyll')));
});
