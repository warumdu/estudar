// Kopiert die in package.json exakt gepinnten Bibliotheken aus node_modules/
// nach vendor/, damit die App sie ohne Build-Schritt und ohne CDN laden kann.
//
// Aufruf in der VM:   npm install && npm run vendor
// Version wechseln:   npm install ts-fsrs@<version> --save-exact && npm run vendor
//
// Es wird nur der fertige ES-Modul-Bundle kopiert (dist/index.mjs -> index.js),
// dazu die Typdefinition als Lesehilfe und die Lizenz. vendor.json hält Version
// und SHA-256 jeder Datei fest; tests/vendor.test.js prüft das gegen den Bestand.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const LIBS = [
  {
    name: 'ts-fsrs',
    files: [
      ['dist/index.mjs', 'index.js'],
      ['dist/index.d.ts', 'index.d.ts'],
      ['LICENSE', 'LICENSE'],
    ],
  },
];

for (const lib of LIBS) {
  const pinned = pkg.dependencies?.[lib.name];
  if (!pinned || !/^\d+\.\d+\.\d+$/.test(pinned)) {
    throw new Error(`${lib.name}: package.json muss eine exakte Version pinnen (ohne ^ oder ~), gefunden: ${pinned}`);
  }
  const src = join(root, 'node_modules', lib.name);
  const installed = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
  if (installed !== pinned) {
    throw new Error(`${lib.name}: node_modules hat ${installed}, package.json pinnt ${pinned}. Erst "npm install" ausführen.`);
  }
  const dest = join(root, 'vendor', lib.name);
  mkdirSync(dest, { recursive: true });
  const manifest = { name: lib.name, version: pinned, source: `npm:${lib.name}@${pinned}`, files: {} };
  for (const [from, to] of lib.files) {
    copyFileSync(join(src, from), join(dest, to));
    const sha256 = createHash('sha256').update(readFileSync(join(dest, to))).digest('hex');
    manifest.files[to] = { from, sha256 };
  }
  writeFileSync(join(dest, 'vendor.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${lib.name}@${pinned} -> vendor/${lib.name}/ (${lib.files.length} Dateien)`);
}
