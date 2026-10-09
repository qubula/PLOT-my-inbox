// Copies what the video needs from the app into the project, so the film always
// matches the app: fonts, the tree stages (web/js/tree.js), the demo inbox's
// numbers and a real cluster's layout. Music and sound effects come from
// ../Audio; see README for credits.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  'riser.mp3': 'dbsound-simple-short-riser-2-613769.mp3',
  'shimmer.mp3': 'Ethereal,_shimmering_#2-1791553675461.mp3',
  'mail.mp3': 'liecio-message-notification-190034.mp3',
  'pop.mp3': 'soft_pop_#4-1791553448647.mp3',
  'pencil.mp3': 'u_viypcpsnud-pencil_scribble_9-389258.mp3',
};
for (const [to, from] of Object.entries(AUDIO)) fs.copyFileSync(path.join(A, from), path.join(AD, to));

// Music: the stomp track is 6 phrases of 2 bars (3.4288 s at 140 BPM) plus an
// ending. PHRASES lists which phrase plays when; repeating the near-identical
// phrases 3 and 4 makes it longer, and the track's own last phrase and ending
// still close it. Cuts sit just before a kick, where the track is quiet.
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const SONG = path.join(A, 'bombinsound-stomp-drum-percussion-version-6-power-up-577420.mp3');
const PHRASE = 3.4288;
const PHRASES = [0, 1, 2, 3, 4, 3, 4, 3, 4, 3, 4, 3, 5];
const parts = PHRASES.map((k, i) => `[0:a]atrim=${(k * PHRASE).toFixed(4)}:${((k + 1) * PHRASE).toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=${(PHRASE - 0.004).toFixed(4)}:d=0.004[p${i}]`);
parts.push(`[0:a]atrim=${(6 * PHRASE).toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.004[tail]`);
const filter = parts.join(';') + ';' + PHRASES.map((_, i) => `[p${i}]`).join('') + `[tail]concat=n=${PHRASES.length + 1}:v=0:a=1[out]`;
ff(['-i', SONG, '-filter_complex', filter, '-map', '[out]', '-ar', '44100', '-b:a', '256k', path.join(AD, 'music.mp3')]);

// A short paper flick for each email card that lands, cut from the crumple recording
ff(['-i', path.join(A, 'oxidvideos-crumpling-paper-wrapping-478933.mp3'), '-af', 'atrim=0.330:0.440,asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=0.05:d=0.06', path.join(AD, 'flick.mp3')]);
console.log('synced', stages.length, 'tree stages,', inbox.length, 'subjects,', Object.keys(AUDIO).length + 2, 'sounds');
