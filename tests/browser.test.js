// Browser-Test mit dem vorinstallierten Chromium: Seite laden, Service Worker
// abwarten, Netz kappen, neu laden – und die App muss immer noch starten und
// die fälligen Karten zeigen. Außerdem: ts-fsrs lässt sich im Browser als
// ES-Modul importieren. Die Bedienabläufe stehen in app.test.js.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.js';

let server, browser, context, page;
const consoleErrors = [];

before(async () => {
  server = await startStaticServer();
  browser = await chromium.launch();
  context = await browser.newContext({ serviceWorkers: 'allow' });
  page = await context.newPage();
  page.on('console', (msg) => {
    // Die absichtliche Anfrage nach einer fehlenden Datei (Offline-Test) erzeugt erwartbar eine Meldung.
    if (msg.type() === 'error' && !/gibt-es-nicht|unbekannt\//.test(msg.location()?.url || '')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/* Hinweis: context.setOffline() wirkt in Chromium nicht auf Anfragen, die der
 * Service Worker selbst stellt. Deshalb wird für den Offline-Test der Server
 * tatsächlich beendet – danach gibt es kein Netz mehr, nur noch den Cache. */

/** Wartet, bis die App gestartet ist und die Zahl der fälligen Karten zeigt. */
async function waitForApp() {
  await page.waitForFunction(() => /^\d+$/.test(document.getElementById('heute-count').textContent), null, { timeout: 15000 });
  return Number(await page.locator('#heute-count').textContent());
}

test('App startet, zeigt das Probe-Deck als fällig und richtet den Service Worker ein', async () => {
  const response = await page.goto(server.base);
  assert.equal(response.status(), 200);
  assert.equal(await page.title(), 'estudar');
  assert.equal(await waitForApp(), 20, 'beim ersten Start sind die 20 Probekarten fällig');
  await page.waitForFunction(() => document.getElementById('st-offline').dataset.state === 'ready', null, { timeout: 15000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  assert.equal(await page.locator('#st-offline').textContent(), 'bereit ✓');
  assert.equal(await page.locator('#st-mode').getAttribute('data-state'), 'browser');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  assert.equal(scope, server.base, 'Service-Worker-Scope muss das Unterverzeichnis sein');
});

test('App-Hülle liegt vollständig im Cache', async () => {
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('estudar-v')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname).sort();
  });
  for (const p of ['/estudar/', '/estudar/index.html', '/estudar/manifest.webmanifest', '/estudar/app/main.js', '/estudar/app/style.css', '/estudar/vendor/ts-fsrs/index.js', '/estudar/icons/icon-180.png', '/estudar/icons/icon-192.png', '/estudar/icons/icon-512.png', '/estudar/icons/icon-512-maskable.png', '/estudar/icons/favicon-32.png']) {
    assert.ok(cached.includes(p), `${p} fehlt im Cache: ${cached.join(', ')}`);
  }
  const withQuery = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('estudar-v')));
    return (await cache.keys()).map((r) => r.url).filter((u) => u.includes('?'));
  });
  assert.deepEqual(withQuery, [], 'Cache-Schlüssel dürfen den Versionsparameter nicht tragen');
});

test('Manifest wird geladen und die Icons sind erreichbar', async () => {
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.href);
    return { status: res.status, type: res.headers.get('content-type'), body: await res.json(), href: link.href };
  });
  assert.equal(manifest.status, 200);
  assert.match(manifest.type, /application\/manifest\+json/);
  assert.equal(manifest.body.name, 'estudar');
  for (const icon of manifest.body.icons) {
    const r = await page.evaluate(async ({ href, src }) => { const res = await fetch(new URL(src, href)); return { status: res.status, type: res.headers.get('content-type') }; }, { href: manifest.href, src: icon.src });
    assert.equal(r.status, 200, `Icon ${icon.src}`);
    assert.equal(r.type, 'image/png');
  }
  const touch = await page.evaluate(async () => { const res = await fetch(document.querySelector('link[rel="apple-touch-icon"]').href); return res.status; });
  assert.equal(touch, 200);
});

test('ts-fsrs lässt sich im Browser als ES-Modul importieren', async () => {
  const result = await page.evaluate(async () => {
    const m = await import('./vendor/ts-fsrs/index.js');
    const now = new Date('2026-09-07T12:00:00Z');
    const f = m.fsrs(m.generatorParameters({ request_retention: 0.9 }));
    const preview = f.repeat(m.createEmptyCard(now), now);
    return { version: m.FSRSVersion, dues: [1, 2, 3, 4].map((g) => preview[g].card.due.getTime() - now.getTime()) };
  });
  assert.match(result.version, /^v5\.4\.2\b/);
  assert.ok(result.dues.every((d) => d > 0));
  assert.ok(result.dues[0] < result.dues[1] && result.dues[1] < result.dues[2] && result.dues[2] < result.dues[3]);
});

test('offline: Neuladen und Navigation funktionieren aus dem Cache', async () => {
  // Auch der HTTP-Cache des Browsers wird geleert: Sonst könnte er eine Datei
  // liefern, die im Precache fehlt, und der Test würde mehr versprechen, als
  // der Service Worker nach Stunden im Flugmodus wirklich hält.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await cdp.detach();
  await server.close();
  await context.setOffline(true);
  try {
    await page.reload();
    assert.equal(await waitForApp(), 20, 'offline: App startet aus dem Cache, Daten kommen aus IndexedDB');
    await page.waitForFunction(() => document.getElementById('st-offline').dataset.state === 'ready', null, { timeout: 15000 });
    // Offline lernen und bewerten
    await page.click('#btn-lernen');
    await page.click('#session-card');
    await page.waitForSelector('#grade-bar:not([hidden])');
    assert.match(await page.locator('[data-ivl="3"]').textContent(), /^in \d+ /, 'Intervall kommt offline aus ts-fsrs');
    await page.click('[data-grade="4"]');
    await page.waitForFunction(() => document.getElementById('session-progress').textContent.startsWith('2 /'));
    assert.equal(await page.evaluate(() => window.estudar.db.count('reviews')), 1, 'Bewertung ist offline gespeichert');
    await page.goto(server.base + 'index.html');
    assert.equal(await waitForApp(), 19);
    await page.goto(server.base + '?quelle=homescreen');
    assert.equal(await waitForApp(), 19, 'Anfrage mit Query muss den Cache treffen');
    await page.goto(server.base + 'unbekannt');
    assert.equal(await waitForApp(), 19, 'unbekannte Adresse im App-Verzeichnis fällt offline auf index.html zurück');
    const deep = await page.goto(server.base + 'unbekannt/seite');
    assert.equal(deep.status(), 503, 'tiefere Pfade bekommen keine index.html (relative Verweise würden brechen)');
    await page.goto(server.base);
    // Zur Laufzeit geladene Datei (ts-fsrs) ist ebenfalls offline verfügbar.
    const version = await page.evaluate(async () => (await import('./vendor/ts-fsrs/index.js')).FSRSVersion);
    assert.match(version, /^v5\.4\.2\b/);
    // Unbekannte Datei liefert offline eine klare 503-Antwort statt eines Browserfehlers.
    const missing = await page.evaluate(async () => { const r = await fetch('./gibt-es-nicht.txt'); return { status: r.status, text: await r.text() }; });
    assert.equal(missing.status, 503);
    assert.match(missing.text, /Offline und nicht im Cache/);
  } finally {
    await context.setOffline(false);
  }
});

test('keine Konsolenfehler', () => {
  assert.deepEqual(consoleErrors, []);
});
