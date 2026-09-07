// Rendert icons/icon.svg und icons/icon-maskable.svg mit dem in der VM
// vorinstallierten Chromium (Playwright) in die PNG-Größen, die iOS, Android
// und Browser-Tabs brauchen. Aufruf: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = [
  { svg: 'icon.svg', size: 180, file: 'icon-180.png' },          // iOS apple-touch-icon
  { svg: 'icon.svg', size: 192, file: 'icon-192.png' },          // Manifest
  { svg: 'icon.svg', size: 512, file: 'icon-512.png' },          // Manifest
  { svg: 'icon-maskable.svg', size: 512, file: 'icon-512-maskable.png' },
  { svg: 'icon.svg', size: 32, file: 'favicon-32.png' },         // Browser-Tab
];

const browser = await chromium.launch();
try {
  for (const { svg, size, file } of OUT) {
    const data = readFileSync(join(root, 'icons', svg), 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style></head>` +
      `<body><img src="data:image/svg+xml;base64,${Buffer.from(data).toString('base64')}"></body></html>`,
    );
    await page.waitForFunction(() => document.images[0].complete && document.fonts.status === 'loaded');
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
    writeFileSync(join(root, 'icons', file), png);
    await page.close();
    console.log(`icons/${file} (${size}x${size}, ${png.length} Bytes)`);
  }
} finally {
  await browser.close();
}
