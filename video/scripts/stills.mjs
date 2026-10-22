// Quick visual check: bundles once, renders chosen frames of both formats to
// out/stills/. Usage: node scripts/stills.mjs 30 100 160
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const browser = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(p => fs.existsSync(p));
const frames = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const only = process.argv.find(a => a.startsWith('--id='))?.slice(5);
const serveUrl = await bundle({ entryPoint: path.join(HERE, '../src/index.ts') });
for (const id of only ? [only] : ['plot-4x5']) {
  const composition = await selectComposition({ serveUrl, id, browserExecutable: browser });
  for (const frame of frames) {
    const output = path.join(HERE, `../out/stills/${id}-${frame}.png`);
    await renderStill({ composition, serveUrl, frame, output, browserExecutable: browser, scale: Number(process.argv.find(a => a.startsWith('--scale='))?.slice(8) ?? 0.5) });
    console.log(output);
  }
}
