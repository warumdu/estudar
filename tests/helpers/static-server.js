// Kleiner statischer Server, der das Repo so ausliefert wie GitHub Pages:
// unter einem Unterverzeichnis (/estudar/), mit passenden MIME-Typen und
// Cache-Control: max-age=600. Nur für die Browser-Tests in der VM.
// Mit server.override(pfad, text) lässt sich eine Datei für den Test ersetzen
// (z. B. sw.js mit anderer VERSION, um eine neue Auslieferung nachzustellen).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './repo.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export async function startStaticServer({ prefix = '/estudar', root = ROOT } = {}) {
  const overrides = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = url.pathname;
    if (path === prefix) {
      res.writeHead(301, { Location: prefix + '/' });
      return res.end();
    }
    if (!path.startsWith(prefix + '/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    path = decodeURIComponent(path.slice(prefix.length + 1));
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root) || file.includes(`${join(root, 'node_modules')}`) || file.includes(`${join(root, '.git')}`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    if (overrides.has(path)) {
      const body = Buffer.from(overrides.get(path), 'utf8');
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    try {
      const st = await stat(file);
      if (st.isDirectory()) {
        res.writeHead(301, { Location: url.pathname + '/' });
        return res.end();
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'max-age=600',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    base: `http://127.0.0.1:${port}${prefix}/`,
    override: (path, text) => { if (text == null) overrides.delete(path); else overrides.set(path, text); },
    close: () => new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(resolve);
      server.closeAllConnections();
    }),
  };
}
