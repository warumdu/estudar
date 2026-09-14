// Der Testton der Diagnoseseite (audio/testton.wav): gültiges WAV, rund drei
// Sekunden, deutlich hörbar, und die eingecheckte Datei entspricht genau dem
// Skript, das sie erzeugt (scripts/make-tone.js) – kein Fremdmaterial im Repo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DURATION_S, SAMPLE_RATE, TONE_FILE, toneSamples, toneWav } from '../scripts/make-tone.js';
import { ROOT, readText } from './helpers/repo.js';

test('audio/testton.wav: WAV-Kopf, Länge, Lautstärke', () => {
  const bytes = readFileSync(join(ROOT, TONE_FILE));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM');
  assert.equal(bytes.readUInt16LE(22), 1, 'mono');
  assert.equal(bytes.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(bytes.readUInt16LE(34), 16, '16 Bit');
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  const dataBytes = bytes.readUInt32LE(40);
  assert.equal(bytes.length, 44 + dataBytes);
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'RIFF-Länge');
  const seconds = dataBytes / 2 / SAMPLE_RATE;
  assert.ok(seconds >= 2.5 && seconds <= 3.5, `etwa drei Sekunden, nicht ${seconds}`);
  assert.equal(seconds, DURATION_S);
  assert.ok(bytes.length < 150_000, 'klein genug für den Offline-Cache');

  // Deutlich hörbar: Spitze über der halben Aussteuerung, nie übersteuert.
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
  assert.ok(peak > 0.5 * 32767 && peak < 32767, `Spitze ${peak}`);
  // Es ist kein Dauerton: die Lücken zwischen den Tönen sind still.
  const at = (s) => Math.abs(bytes.readInt16LE(44 + Math.round(s * SAMPLE_RATE) * 2));
  assert.ok(at(0.62) < 50 && at(1.32) < 50, 'zwischen den Tönen ist Stille');
  assert.ok(at(0.10) > 1000 && at(2.20) > 1000, 'in den Tönen ist Signal');
});

test('audio/testton.wav entspricht scripts/make-tone.js (deterministisch)', () => {
  const generated = toneWav();
  assert.ok(generated.equals(toneWav()), 'zwei Läufe ergeben dieselben Bytes');
  assert.ok(generated.equals(readFileSync(join(ROOT, TONE_FILE))), 'Datei im Repo weicht vom Skript ab – npm run tone');
  const samples = toneSamples();
  assert.ok(samples.every((v) => v >= -1 && v <= 1));
});

test('Testton liegt im Precache und wird von der Diagnoseseite über ein <audio>-Element geladen', () => {
  assert.match(readText('sw.js'), /'\.\/audio\/testton\.wav'/);
  assert.match(readText('diagnose.html'), /<audio id="tone" src="audio\/testton\.wav"/);
  assert.match(readText('package.json'), /"tone": "node scripts\/make-tone\.js"/);
});
