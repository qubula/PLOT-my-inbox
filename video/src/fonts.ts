// Loads the app's fonts before the first frame renders.
import { continueRender, delayRender, staticFile } from 'remotion';

const FONTS: [string, string, string][] = [
  ['Rubik Mono One', 'rubik-mono-one-latin-400-normal.woff2', '400'],
  ['Rubik', 'rubik-latin-400-normal.woff2', '400'],
  ['Roboto Mono', 'roboto-mono-latin-300-normal.woff2', '300'],
  ['Roboto Mono', 'roboto-mono-latin-400-normal.woff2', '400'],
  ['Roboto Mono', 'roboto-mono-latin-600-normal.woff2', '600'],
  ['Inter', 'inter-latin-500-normal.woff2', '500'],
  ['Inter', 'inter-latin-600-normal.woff2', '600'],
  ['Inter', 'inter-latin-700-normal.woff2', '700'],
];
let started = false;
export const loadFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const h = delayRender('fonts');
  Promise.all(FONTS.map(async ([family, file, weight]) => {
    const f = new FontFace(family, `url(${staticFile('fonts/' + file)})`, { weight });
    await f.load(); document.fonts.add(f);
  })).then(() => continueRender(h)).catch(e => { console.error(e); continueRender(h); });
};
export const LOGO = "'Rubik Mono One', sans-serif";
export const UI = "Inter, -apple-system, 'Helvetica Neue', sans-serif";
export const MONO = "'Roboto Mono', ui-monospace, monospace";
export const RUBIK = "Rubik, sans-serif";
