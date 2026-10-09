// Screenshots of the running app for the interface scene (public/ui/*.png, 1440 × 900 at 2x).
//   cd web && python3 -m http.server 8765      (in another terminal)
//   node scripts/capture-ui.mjs
// Uses Playwright (npm i -g playwright). The app loads p5.js from a CDN and its
// fonts from Google; if those are blocked, set P5 to a local copy of
// p5.min.js 1.9.4 and the fonts are served from public/fonts.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'ui');
const FONTS = path.join(ROOT, 'public', 'fonts');
const URL = process.env.APP_URL || 'http://localhost:8765/index.html';
const CLUSTER = 'Summer Fashion Seasonal Discount Campaign';

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
if (process.env.P5) await p.route('**/p5.min.js', r => r.fulfill({ path: process.env.P5, contentType: 'application/javascript' }));
await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: [
  ['Rubik', 400, 'rubik-latin-400-normal'], ['Rubik Mono One', 400, 'rubik-mono-one-latin-400-normal'],
  ['Roboto Mono', 400, 'roboto-mono-latin-400-normal'], ['Roboto Mono', 600, 'roboto-mono-latin-600-normal'],
].map(([f, w, file]) => `@font-face{font-family:'${f}';font-weight:${w};src:url(/__fonts/${file}.woff2)}`).join('\n') }));
await p.route('**/__fonts/*', r => r.fulfill({ path: path.join(FONTS, r.request().url().split('/__fonts/')[1]), contentType: 'font/woff2' }));

await p.goto(URL);
await p.waitForTimeout(2500);
// demo log in, skip the tour
for (const id of ['#ob-email-btn', '#ob-confirm-btn', '#ob-enter-plot-btn', '#tour-skip']) { await p.click(id, { timeout: 5000 }); await p.waitForTimeout(1200); }
await p.addStyleTag({ content: '#nav-hint{display:none!important}' });

// the same cluster the map scene dives into
const subId = await p.evaluate(t => { for (const g of _vizData.galaxies) for (const m of g.macros) for (const s of m.subClusters) if (s.title === t) return s.id; }, CLUSTER);
await p.evaluate(id => window.openSubById(id), subId);
await p.waitForTimeout(4000);
await p.mouse.move(1430, 890); await p.waitForTimeout(600);
await p.screenshot({ path: path.join(OUT, 'cluster.png') });

// open its first email
await p.evaluate(() => window._tourGoEmailSelected()); await p.waitForTimeout(3000);
await p.mouse.move(1430, 890); await p.waitForTimeout(500);
await p.screenshot({ path: path.join(OUT, 'email.png') });

// read mode, then highlight a phrase in yellow
await p.click('#btn-expand-email'); await p.waitForTimeout(1800);
await p.screenshot({ path: path.join(OUT, 'read.png') });
await p.evaluate(() => {
  const body = document.getElementById('email-modal-body');
  const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const i = n.textContent.indexOf('20% discount');
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + '20% discount on our latest collection'.length);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.querySelector('#email-modal-colors-panel .color-swatch[data-color="#F9FF8D"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    getSelection().removeAllRanges();
    return;
  }
});
await p.waitForTimeout(800);
await p.mouse.move(1430, 890); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(OUT, 'highlight.png') });
await browser.close();
console.log('saved 4 screenshots to', OUT);
