/* estudar – Service Worker
 *
 * Klassischer (nicht-modularer) Service Worker, damit er auf allen iOS-Versionen
 * läuft, die installierbare Web-Apps unterstützen. Alle Pfade sind relativ zur
 * Adresse dieser Datei, damit die App in einem Unterverzeichnis wie
 * name.github.io/estudar/ und unter einer Wurzeladresse gleichermaßen funktioniert.
 *
 * Strategie: Beim Installieren wird die komplette App-Hülle (APP_SHELL) in einen
 * versionierten Cache geladen. Anfragen werden zuerst aus dem Cache beantwortet,
 * erst dann aus dem Netz. Dadurch startet die App im Flugmodus und antwortet
 * ohne Netzverzögerung. Eine neue Auslieferung bekommt eine neue VERSION; der
 * neue Worker räumt beim Aktivieren alle alten Caches ab.
 *
 * Aktualisierung nur auf Wunsch: Ein neu installierter Worker wartet, bis die
 * Seite ihm { type: 'SKIP_WAITING' } schickt (Knopf „Aktualisieren"). Vorher
 * läuft die alte Fassung ungestört weiter – auch mitten in einer Lernsession.
 */
'use strict';

var SCOPE_PATH = new URL('./', self.location.href).pathname; // z. B. "/estudar/"
var VERSION = '0.2.0'; // bei JEDER Auslieferung erhöhen – sonst sehen installierte Geräte die Änderung nie (tests/pwa.test.js wacht darüber)
var CACHE_NAME = 'estudar-v' + VERSION;
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/style.css',
  './app/main.js',
  './app/db.js',
  './app/scheduler.js',
  './app/compare.js',
  './app/cards.js',
  './app/backup.js',
  './app/deckformat.js',
  './app/seed.js',
  './vendor/ts-fsrs/index.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  // Kein skipWaiting(): die neue Fassung wartet, bis der Nutzer sie antippt.
  event.waitUntil(precache());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf('estudar-v') === 0 && key !== CACHE_NAME;
      }).map(function (key) { return caches.delete(key); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fremde Adressen gibt es nicht – kein CDN
  event.respondWith(cacheFirst(request));
});

/* Lädt jede Datei der App-Hülle frisch vom Server (Versionsparameter umgeht
 * den HTTP-Cache) und legt sie unter ihrer sauberen Adresse im Cache ab. Schlägt
 * eine Datei fehl, scheitert die Installation – lieber die alte Fassung behalten
 * als eine halbe neue. */
function precache() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(APP_SHELL.map(function (path) {
      return fetch(path + '?v=' + VERSION).then(function (response) {
        if (!response.ok) throw new Error('Precache fehlgeschlagen: ' + path + ' (' + response.status + ')');
        return cache.put(path, response);
      });
    }));
  });
}

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok && response.type === 'basic') {
          // Nicht abwarten: die Antwort soll sofort raus. Ein voller Speicher
          // darf die Anfrage nicht scheitern lassen.
          cache.put(request, response.clone()).catch(function () {});
        }
        return response;
      }).catch(function () {
        // Offline und unbekannte Adresse: Navigationen direkt im App-Verzeichnis
        // (z. B. "/estudar/?x=1" oder "/estudar/irgendwas") bekommen die App-Seite.
        // Tiefere Pfade nicht – dort würden die relativen Verweise der Seite ins
        // Leere laufen, also lieber eine ehrliche Fehlermeldung.
        if (request.mode === 'navigate' && isInScopeRoot(new URL(request.url))) {
          return cache.match('./index.html').then(function (fallback) {
            return fallback || offlineResponse(request);
          });
        }
        return offlineResponse(request);
      });
    });
  });
}

function isInScopeRoot(url) {
  return url.pathname.indexOf(SCOPE_PATH) === 0 && url.pathname.slice(SCOPE_PATH.length).indexOf('/') === -1;
}

function offlineResponse(request) {
  return new Response('Offline und nicht im Cache: ' + new URL(request.url).pathname, {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
