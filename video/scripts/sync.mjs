// Copies what the video needs from the app into the project, so the film always
// matches the app: fonts, the tree stages (web/js/tree.js), the demo inbox's
// numbers and a real cluster's layout. Music and sound effects come from
// ../Audio; see README for credits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const APP = path.join(ROOT, '..', 'web');
const OUT = path.join(ROOT, 'src', 'generated');
fs.mkdirSync(OUT, { recursive: true });

// Fonts (the app's own: Rubik Mono One, Rubik, Roboto Mono, Inter)
const FD = path.join(ROOT, 'public', 'fonts'); fs.mkdirSync(FD, { recursive: true });
const fonts = [
  ['rubik-mono-one', 'rubik-mono-one-latin-400-normal.woff2'],
  ['rubik', 'rubik-latin-400-normal.woff2'],
  ['roboto-mono', 'roboto-mono-latin-300-normal.woff2'],
  ['roboto-mono', 'roboto-mono-latin-400-normal.woff2'],
  ['roboto-mono', 'roboto-mono-latin-600-normal.woff2'],
  ['inter', 'inter-latin-500-normal.woff2'],
  ['inter', 'inter-latin-600-normal.woff2'],
  ['inter', 'inter-latin-700-normal.woff2'],
];
for (const [pkg, f] of fonts) fs.copyFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', f), path.join(FD, f));

// Tree stages, straight from the app
const tree = fs.readFileSync(path.join(APP, 'js', 'tree.js'), 'utf8');
const stages = [...tree.matchAll(/`(<svg[\s\S]*?<\/svg>)`/g)].map(m => m[1].replace(/\s+/g, ' '));
fs.writeFileSync(path.join(OUT, 'tree.json'), JSON.stringify(stages));

// Numbers and names
const S = JSON.parse(fs.readFileSync(path.join(APP, 'output', 'cluster_structure.json'), 'utf8'));
const themes = S.galaxies.map(g => ({ id: g.id, title: g.title, size: g.size, age: g.age, spaces: g.macros.length }));

// A few real subject lines for the opening inbox list, newest first
const metaDir = path.join(APP, 'output', 'emails_meta');
const all = [];
for (const f of fs.readdirSync(metaDir)) {
  const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
  for (const t of m.threads) for (const n of t.nodes) all.push(n);
  for (const n of m.floating) all.push(n);
}
all.sort((a, b) => (a.date_str < b.date_str ? 1 : -1));
const seen = new Set(); const inbox = [];
for (const n of all) { if (seen.has(n.subject)) continue; seen.add(n.subject); inbox.push({ s: n.subject, from: n.sender, d: n.date_str.slice(0, 10) }); if (inbox.length >= 40) break; }

fs.writeFileSync(path.join(OUT, 'inbox.json'), JSON.stringify({
  emails: S.email_count, themes: S.galaxy_count, spaces: S.macro_count, clusters: S.sub_cluster_count,
  themeList: themes, list: inbox,
}));
// Audio: the music and effects in /Audio at the repo root
const A = path.join(ROOT, '..', 'Audio');
const AD = path.join(ROOT, 'public', 'audio'); fs.mkdirSync(AD, { recursive: true });
const AUDIO = {
  'music.mp3': 'musinova-idm-electronic-science-technology-483366.mp3',
  'riser.mp3': 'dbsound-simple-short-riser-2-613769.mp3',
  'shimmer.mp3': 'Ethereal,_shimmering_#2-1791553675461.mp3',
  'ping-1.mp3': 'email_inbox_notifica_#2-1791553586714.mp3',
  'ping-2.mp3': 'email_inbox_notifica_#3-1791553578877.mp3',
  'ping-3.mp3': 'inbox_notification_s_#3-1791553604512.mp3',
  'pop.mp3': 'soft_pop_#4-1791553448647.mp3',
  'scribble.mp3': 'freesound_community-scribble-6144.mp3',
  'pencil.mp3': 'u_viypcpsnud-pencil_scribble_9-389258.mp3',
  'crumple.mp3': 'oxidvideos-crumpling-paper-wrapping-478933.mp3',
  'drip.mp3': 'freesound_community-water-drip-45622.mp3',
};
for (const [to, from] of Object.entries(AUDIO)) fs.copyFileSync(path.join(A, from), path.join(AD, to));
console.log('synced', stages.length, 'tree stages,', inbox.length, 'subjects,', Object.keys(AUDIO).length, 'sounds');
