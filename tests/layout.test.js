// Die Lernsession passt auf einen Bildschirm: Kopfzeile oben, Frage und Lösung
// mittig, die vier Knöpfe fest am unteren Rand – nie scrollt die Seite, nur der
// mittlere Bereich bei sehr langem Inhalt. Geprüft bei 375×667 (kleines iPhone)
// und 430×932, mit und ohne Beispielsatz, mit dreizeiliger Lösung und mit einer
// sichtbaren Höhe, die kleiner ist als das Fenster (iOS-Home-Bildschirm-App).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.js';

let server, browser;
before(async () => { server = await startStaticServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const CARDS = [
  { id: 'l-ohne', front: 'der Bahnhof', back: 'a estação', example: '' },
  { id: 'l-mit', front: 'das Wochenende', back: 'o fim de semana', example: 'No fim de semana eu descanso e visito a minha família.' },
  { id: 'l-drei', front: 'sich um etwas kümmern', back: 'cuidar de alguma coisa com muita atenção e paciência todos os dias', example: 'Ela cuida das plantas.' },
  { id: 'l-lang', front: 'ein sehr langer Satz', back: Array(12).fill('Ontem à noite, depois de um dia muito longo e cansativo no trabalho, eu finalmente consegui descansar um pouco.').join(' '), example: '' },
];

async function startSession(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(server.base);
  await page.waitForFunction(() => window.estudar && window.estudar.db && /^\d+$/.test(document.getElementById('heute-count').textContent), null, { timeout: 15000 });
  await page.evaluate(async (cards) => {
    const S = await import(new URL('app/scheduler.js', location.href).href);
    const now = new Date();
    const ts = now.toISOString();
    const full = cards.map((c) => ({ ...c, noteId: `n-${c.id}`, deckId: 'deck-probe', type: 'vocab', direction: 'de-pt', hint: '', tags: [], createdAt: ts, updatedAt: ts, suspended: false }));
    await window.estudar.db.write({ clear: ['cards', 'cardStates', 'reviews'], puts: { cards: full, cardStates: full.map((c) => S.newState(c.id, now)) } });
  }, CARDS);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('heute-count').textContent === '4', null, { timeout: 15000 });
  await page.click('#btn-lernen');
  await page.waitForSelector('#screen-session:not([hidden])');
  return { context, page, errors };
}

/** Maße der Session: Fenster, Seite, Kopf, Mitte, Knopfleiste. */
const measure = (page) => page.evaluate(() => {
  const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  const area = document.getElementById('session-card');
  const body = area.querySelector('.card-body').getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  return {
    innerHeight: window.innerHeight,
    pageScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    scrollY: window.scrollY,
    head: rect('session-progress'),
    area: rect('session-card'),
    areaScrolls: area.scrollHeight > area.clientHeight + 1,
    centered: Math.abs((body.top + body.bottom) / 2 - (areaRect.top + areaRect.bottom) / 2) <= 2,
    bottom: rect('session-bottom'),
    grades: document.getElementById('grade-bar').hidden ? null : [...document.querySelectorAll('#grade-bar .grade')].map((b) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; }),
  };
});

for (const viewport of [{ width: 375, height: 667 }, { width: 430, height: 932 }]) {
  test(`Session bei ${viewport.width}×${viewport.height}: nie scrollen, Knöpfe fest unten, nichts springt`, async () => {
    const { context, page, errors } = await startSession(viewport);
    try {
      let firstBottom = null;
      let firstHead = null;
      const seen = new Set();
      for (let i = 0; i < CARDS.length; i++) {
        await page.waitForSelector('#session-card:not([hidden])');
        const front = await page.locator('#q-text').textContent();
        const card = CARDS.find((c) => c.front === front);
        assert.ok(card && !seen.has(card.id), `unerwartete Karte: ${front}`);
        seen.add(card.id);
        const before = await measure(page);
        assert.ok(before.pageScroll <= before.innerHeight, `${card.id}: Seite scrollt vor dem Aufdecken (${before.pageScroll} > ${before.innerHeight})`);
        assert.equal(before.scrollY, 0);
        assert.equal(before.grades, null, 'vor dem Aufdecken keine Knöpfe');
        assert.ok(before.bottom.bottom <= before.innerHeight, 'Knopfleiste liegt vor dem Aufdecken innerhalb der sichtbaren Höhe');
        if (card.id !== 'l-lang') {
          assert.equal(before.areaScrolls, false, `${card.id}: der mittlere Bereich muss ohne Scrollen passen`);
          assert.ok(before.centered, `${card.id}: Frage ist vertikal zentriert`);
        }

        await page.click('#session-card');
        await page.waitForSelector('#grade-bar:not([hidden])');
        const after = await measure(page);
        assert.ok(after.pageScroll <= after.innerHeight, `${card.id}: Seite scrollt nach dem Aufdecken (${after.pageScroll} > ${after.innerHeight})`);
        assert.equal(after.scrollY, 0);
        assert.deepEqual(after.head, before.head, 'Kopfzeile springt nicht');
        assert.deepEqual(after.area, before.area, 'der mittlere Bereich ändert seine Größe beim Aufdecken nicht');
        assert.deepEqual(after.bottom, before.bottom, 'die Knopfleiste ändert beim Aufdecken weder Höhe noch Lage');
        assert.equal(after.grades.length, 4);
        for (const g of after.grades) {
          assert.ok(g.top >= after.bottom.top && g.bottom <= after.bottom.bottom, 'Knopf liegt in der Leiste');
          assert.ok(g.bottom <= after.innerHeight, `Knopf ragt unter den Rand (${g.bottom} > ${after.innerHeight})`);
          assert.ok(g.bottom - g.top >= 60, 'Knopf ist groß genug zum Treffen');
        }
        assert.ok(after.innerHeight - after.grades[0].bottom <= 12, 'Knöpfe sitzen am unteren Rand');
        if (card.id === 'l-lang') {
          assert.equal(after.areaScrolls, true, 'ein sehr langer Satz scrollt nur im mittleren Bereich');
        } else {
          assert.equal(after.areaScrolls, false, `${card.id}: Frage plus Lösung passen ohne Scrollen`);
          assert.ok(after.centered, `${card.id}: Frage und Lösung sind vertikal zentriert`);
        }
        firstBottom ??= after.bottom;
        firstHead ??= after.head;
        assert.deepEqual(after.bottom, firstBottom, 'die Position der Knöpfe bleibt über die ganze Session gleich');
        assert.deepEqual(after.head, firstHead);

        await page.click('[data-grade="4"]');
        await page.waitForFunction((f) => document.getElementById('q-text').textContent !== f || !document.getElementById('session-summary').hidden, card.front);
      }
      await page.waitForSelector('#session-summary:not([hidden])');
      assert.ok(await page.locator('#session-bottom').isHidden(), 'Zusammenfassung ohne leere Knopfleiste');
      const sum = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, inner: window.innerHeight }));
      assert.ok(sum.page <= sum.inner, 'auch die Zusammenfassung scrollt nicht');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}

test('Sichtbare Höhe statt 100vh: ist der sichtbare Bereich kleiner als das Fenster, bleiben die Knöpfe darin', async () => {
  const { context, page } = await startSession({ width: 375, height: 667 });
  try {
    // Aus dem Fenster gesetzt: --visible-h kommt aus visualViewport/innerHeight.
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--visible-h')), '667px');
    // iOS-Home-Bildschirm-App nachgestellt: Fenster meldet 667, sichtbar sind nur 560.
    await page.evaluate(() => document.documentElement.style.setProperty('--visible-h', '560px'));
    await page.click('#session-card');
    await page.waitForSelector('#grade-bar:not([hidden])');
    const m = await measure(page);
    assert.ok(m.grades.every((g) => g.bottom <= 560), `Knöpfe müssen oberhalb der sichtbaren Kante liegen: ${JSON.stringify(m.grades)}`);
    assert.ok(560 - m.grades[0].bottom <= 12);
    // Fenster ändert sich (Drehen, Tastatur): die Variable folgt.
    await page.setViewportSize({ width: 375, height: 600 });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--visible-h') === '600px');
  } finally {
    await context.close();
  }
});
