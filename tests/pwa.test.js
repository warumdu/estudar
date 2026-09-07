// Prüft die PWA-Hülle aus Phase 0: Manifest, Icons, Meta-Tags, Service Worker.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  assert.match(html, /<h1>Hallo<\/h1>/);
  assert.match(html, /serviceWorker\.register\('sw\.js'/);
  assert.doesNotMatch(html, /href="\/|src="\//, 'absolute Pfade brechen unter /estudar/');
});

test('Version ist in package.json, sw.js und index.html identisch', () => {
  const swVersion = sw.match(/var VERSION = '([^']+)'/)?.[1];
  const htmlVersion = html.match(/id="st-version">([^<]+)</)?.[1];
  assert.equal(swVersion, pkg.version, 'sw.js VERSION weicht von package.json ab');
  assert.equal(htmlVersion, pkg.version, 'index.html Version weicht von package.json ab');
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
  const context = vm.createContext({ self, caches, fetch, Response, Request, URL, Promise, Error, console });
  vm.runInContext(sw, context, { filename: 'sw.js' });

  const dispatch = async (type, extra = {}) => {
    const waits = [];
    const event = { waitUntil: (p) => waits.push(p), ...extra };
    for (const fn of listeners[type] ?? []) fn(event);
    await Promise.all(waits);
  };
  await dispatch('install');
  await dispatch('activate');
  return { self, stores, fetched, listeners };
}

test('sw.js: Precache enthält jede Datei der App-Hülle und die Dateien existieren', async () => {
  const { self, stores, fetched } = await runServiceWorker();
  const cacheName = `estudar-v${pkg.version}`;
  assert.ok(stores.has(cacheName), `Cache ${cacheName} wurde nicht angelegt`);
  const cached = [...stores.get(cacheName).keys()].sort();
  const shell = [...sw.matchAll(/^\s*'(\.\/[^']*)'/gm)].map((m) => m[1]);
  assert.ok(shell.length >= 5, 'APP_SHELL nicht gefunden');
  for (const path of shell) {
    const rel = path.replace(/^\.\//, '');
    if (rel !== '') assert.ok(existsSync(join(ROOT, rel)), `APP_SHELL verweist auf fehlende Datei: ${path}`);
    assert.ok(cached.includes(new URL(path, 'https://example.test/estudar/sw.js').href), `${path} nicht im Cache`);
  }
  for (const [rel, expected] of [['index.html', './index.html'], ['manifest.webmanifest', './manifest.webmanifest'], ['icons/icon-180.png', './icons/icon-180.png']]) {
    assert.ok(shell.includes(expected), `${rel} fehlt in APP_SHELL`);
  }
  assert.ok(fetched.every((u) => u.includes('?v=' + pkg.version)), 'Precache muss den HTTP-Cache per Versionsparameter umgehen');
  assert.equal(self.skipped, true, 'skipWaiting() fehlt');
  assert.equal(self.claimed, true, 'clients.claim() fehlt');
  assert.ok(!stores.has('estudar-v0.0.0-alt'), 'alter estudar-Cache wurde nicht gelöscht');
  assert.ok(stores.has('fremd'), 'fremde Caches dürfen nicht angefasst werden');
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
