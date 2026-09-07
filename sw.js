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
 */
'use strict';

var VERSION = '0.0.1'; // bei jeder Auslieferung erhöhen (siehe tests/pwa.test.js)
var CACHE_NAME = 'estudar-v' + VERSION;
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
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
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        if (request.mode === 'navigate') {
          return cache.match('./index.html').then(function (fallback) {
            return fallback || offlineResponse(request);
          });
        }
        return offlineResponse(request);
      });
    });
  });
}

function offlineResponse(request) {
  return new Response('Offline und nicht im Cache: ' + new URL(request.url).pathname, {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
