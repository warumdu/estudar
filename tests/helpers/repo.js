// Gemeinsame Helfer für die Node-Tests: Repo-Wurzel, Dateiliste, PNG-Maße.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results']);

/** Alle Dateien im Repo (relativ zur Wurzel, mit "/"), ohne .git und node_modules. */
export function listRepoFiles(dir = ROOT) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...listRepoFiles(full));
    } else {
      out.push(relative(ROOT, full).split('\\').join('/'));
    }
  }
  return out.sort();
}

export function readText(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

export function isTextFile(relPath) {
  return !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|otf|zip|xlsx|pdf|tgz)$/i.test(relPath);
}

/** Breite und Höhe eines PNG aus dem IHDR-Chunk. */
export function pngSize(relPath) {
  const buf = readFileSync(join(ROOT, relPath));
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error(`${relPath}: keine PNG-Signatur`);
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${relPath}: IHDR fehlt`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
