// Erzeugt audio/testton.wav – den Testton der Diagnoseseite (Phase 3, Teil A,
// Aufgabe 2: Hypothese zum Ton im Auto). Reines Node, keine Bibliothek: drei
// aufsteigende Töne und ein Akkord, gut drei Sekunden, deutlich hörbar.
// Deterministisch – zweimal ausführen ergibt dieselben Bytes (tests/audio.test.js
// prüft, dass die eingecheckte Datei genau diesem Skript entspricht).
// Aufruf: npm run tone
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 16000;
export const DURATION_S = 3.1;
export const TONE_FILE = 'audio/testton.wav';

// [Startzeit s, Dauer s, Frequenzen Hz] – C5, E5, G5, dann alle drei zusammen.
export const NOTES = [
  [0.00, 0.55, [523.25]],
  [0.70, 0.55, [659.25]],
  [1.40, 0.55, [783.99]],
  [2.10, 0.95, [523.25, 659.25, 783.99]],
];

/** Hüllkurve: 15 ms Einschwingen, dann linear ausklingen – kein Knacken, klarer Anschlag. */
function envelope(t, dur) {
  const attack = 0.015;
  if (t < 0 || t >= dur) return 0;
  if (t < attack) return t / attack;
  return 1 - (t - attack) / (dur - attack);
}

/** Abtastwerte als Float32 in [-1, 1]. */
export function toneSamples(sampleRate = SAMPLE_RATE, duration = DURATION_S) {
  const n = Math.round(sampleRate * duration);
  const out = new Float32Array(n);
  for (const [start, dur, freqs] of NOTES) {
    const from = Math.round(start * sampleRate);
    const to = Math.min(n, Math.round((start + dur) * sampleRate));
    for (let i = from; i < to; i++) {
      const t = (i - from) / sampleRate;
      const env = envelope(t, dur);
      let v = 0;
      for (const f of freqs) {
        // Grundton plus leiser zweiter Oberton – klingt wie ein Glockenspiel, nicht wie ein Prüfsignal.
        v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t);
      }
      out[i] += (0.55 / freqs.length) * env * v;
    }
  }
  return out;
}

/** Fertige WAV-Datei (RIFF, PCM 16 Bit, mono) als Buffer. */
export function toneWav(sampleRate = SAMPLE_RATE, duration = DURATION_S) {
  const samples = toneSamples(sampleRate, duration);
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const wav = toneWav();
  writeFileSync(join(root, TONE_FILE), wav);
  console.log(`${TONE_FILE}: ${wav.length} Bytes, ${DURATION_S} s, ${SAMPLE_RATE} Hz mono 16 Bit`);
}
