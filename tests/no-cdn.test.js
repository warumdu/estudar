// Wächter: Die App darf zur Laufzeit nichts von fremden Servern laden.
// Kein CDN, keine Google Fonts, kein import von http(s)://. Alles liegt im Repo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTextFile, listRepoFiles, readText } from './helpers/repo.js';

const CDN_HOSTS = [
  'cdn.jsdelivr.net', 'jsdelivr.net', 'unpkg.com', 'esm.sh', 'esm.run', 'cdnjs.cloudflare.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'skypack.dev', 'jspm.io', 'jspm.dev',
  'ga.jspm.io', 'cdn.skypack.dev', 'raw.githack.com', 'rawgit.com', 'statically.io',
  'code.jquery.com', 'ajax.googleapis.com', 'cdn.tailwindcss.com', 'unpkg.org',
];

// Dateien, die der Browser lädt: alles außer Doku, Tests, Skripten und Konfiguration.
function isAppFile(f) {
  if (f.startsWith('tests/') || f.startsWith('scripts/') || f.startsWith('docs/')) return false;
  if (/\.(md|json|lock|yml|yaml|txt)$/i.test(f) || f.startsWith('.')) return false;
  if (f === 'package.json' || f === 'package-lock.json' || f === 'AUFTRAG.md') return false;
  return /\.(html|js|mjs|css|webmanifest|svg)$/i.test(f);
}

const LOAD_PATTERNS = [
  /(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i,           // <script src="https://…">, <link href="//…">
  /\bfrom\s*["'](?:https?:)?\/\//,                          // import x from "https://…"
  /\bimport\s*\(\s*["'](?:https?:)?\/\//,                   // import("https://…")
  /\bimportScripts\s*\(\s*["'](?:https?:)?\/\//,            // importScripts("https://…")
  /\burl\(\s*["']?(?:https?:)?\/\//i,                       // CSS url(https://…)
  /\bfetch\s*\(\s*["'](?:https?:)?\/\//,                    // fetch("https://…")
  /@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i,          // CSS @import
];

test('kein CDN-Hostname irgendwo im Repository', () => {
  const hits = [];
  for (const f of listRepoFiles().filter(isTextFile)) {
    if (f === 'tests/no-cdn.test.js') continue; // enthält die Liste selbst
    const text = readText(f).toLowerCase();
    for (const host of CDN_HOSTS) {
      if (text.includes(host)) hits.push(`${f}: ${host}`);
    }
  }
  assert.deepEqual(hits, [], 'CDN-Verweise gefunden');
});

test('App-Dateien laden nichts von http(s)://', () => {
  const hits = [];
  for (const f of listRepoFiles().filter(isAppFile)) {
    const lines = readText(f).split('\n');
    lines.forEach((line, i) => {
      for (const re of LOAD_PATTERNS) {
        if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [], 'externe Ladevorgänge gefunden');
});

test('index.html und sw.js enthalten überhaupt keine fremde Adresse', () => {
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) {
    const text = readText(f);
    assert.doesNotMatch(text, /https?:\/\//, `${f} enthält eine http(s)-Adresse`);
  }
});
