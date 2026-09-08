// Prüft die nach vendor/ kopierten Bibliotheken: exakt gepinnt, unverändert,
// als ES-Modul ohne Build lauffähig.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT, readText } from './helpers/repo.js';

const pkg = JSON.parse(readText('package.json'));
const lock = JSON.parse(readText('package-lock.json'));
const vendorInfo = JSON.parse(readText('vendor/ts-fsrs/vendor.json'));

test('ts-fsrs ist exakt gepinnt (package.json, package-lock.json, vendor.json)', () => {
  assert.equal(pkg.dependencies['ts-fsrs'], '5.4.2');
  assert.equal(lock.packages['node_modules/ts-fsrs'].version, '5.4.2');
  assert.match(lock.packages['node_modules/ts-fsrs'].integrity, /^sha512-/);
  assert.equal(vendorInfo.version, '5.4.2');
  assert.equal(vendorInfo.source, 'npm:ts-fsrs@5.4.2');
});

test('vendor/ts-fsrs: Prüfsummen stimmen, Dateien sind unverändert', () => {
  for (const [file, { sha256 }] of Object.entries(vendorInfo.files)) {
    const actual = createHash('sha256').update(readFileSync(join(ROOT, 'vendor/ts-fsrs', file))).digest('hex');
    assert.equal(actual, sha256, `vendor/ts-fsrs/${file} weicht von vendor.json ab`);
  }
  const installed = join(ROOT, 'node_modules/ts-fsrs/dist/index.mjs');
  if (existsSync(installed)) {
    assert.ok(readFileSync(installed).equals(readFileSync(join(ROOT, 'vendor/ts-fsrs/index.js'))), 'vendor-Datei ist nicht identisch mit node_modules');
  }
  assert.ok(existsSync(join(ROOT, 'vendor/ts-fsrs/LICENSE')));
});

test('vendor/ts-fsrs/index.js: reines ES-Modul ohne Abhängigkeiten', () => {
  const src = readText('vendor/ts-fsrs/index.js');
  assert.doesNotMatch(src, /^\s*(import|export)\s[^;]*from\s*['"][^./]/m, 'bare import gefunden');
  assert.doesNotMatch(src, /\brequire\s*\(/, 'require() gefunden');
  assert.doesNotMatch(src, /\bprocess\.env\b/, 'process.env gefunden');
  assert.match(src, /^export \{/m);
});

test('ts-fsrs läuft als ES-Modul und terminiert mit vier Bewertungen', async () => {
  const fsrsModule = await import('../vendor/ts-fsrs/index.js');
  assert.match(fsrsModule.FSRSVersion, /^v5\.4\.2\b/);
  const { fsrs, generatorParameters, createEmptyCard, Rating, State } = fsrsModule;
  const params = generatorParameters({ request_retention: 0.9 });
  assert.equal(params.request_retention, 0.9);
  const scheduler = fsrs(params);
  const now = new Date('2026-09-07T12:00:00Z');
  const card = createEmptyCard(now);
  assert.equal(card.state, State.New);
  const preview = scheduler.repeat(card, now);
  const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  assert.deepEqual(grades, [1, 2, 3, 4]);
  let last = 0;
  for (const g of grades) {
    const { card: next, log } = preview[g];
    assert.ok(next.due > now, `Fälligkeit muss in der Zukunft liegen (Rating ${g})`);
    assert.ok(next.due.getTime() >= last, 'höhere Bewertung darf nicht früher fällig werden');
    last = next.due.getTime();
    assert.ok(next.stability > 0 && next.difficulty >= 1 && next.difficulty <= 10);
    assert.equal(log.rating, g);
    assert.equal(log.review.getTime(), now.getTime());
  }
  assert.ok(preview[Rating.Easy].card.due - now >= 24 * 3600 * 1000, 'Easy sollte mindestens einen Tag entfernen');
});
