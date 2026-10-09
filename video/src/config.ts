// Copy, timings and colours for the PLOT video. Change a line and re-render.
// The edit is cut to the music: 140 BPM, so one bar is 1.714 s (about 51.4 frames).
import inbox from './generated/inbox.json';
import cluster from './generated/cluster.json';

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
export const BAR = 0.4286 * 4 * FPS;   // beat measured from the track
export const BEAT = BAR / 4;
export const bars = (n: number) => Math.round(n * BAR);
export const INBOX = inbox;
export const CLUSTER = cluster;

// The app's colours (web/panel.css, web/js/sketch.js)
export const C = {
  themes: '#1C1C1C', spaces: '#2F2F2F', light: '#F5F5F5',
  panel: '#D9D9D9', button: '#CFCECE', space: '#EFEFEF', cluster: '#AFAFAF',
  attach: '#0022FF', ink: '#000000', onDark: '#E8E8E8', green: '#62E599',
  threads: ['#3797B8', '#E6D539', '#CD3D5C', '#FF9FD4', '#E8A26B', '#FF4A00', '#62E599'],
};

// The opening runs on sound effects only. The music starts at REVEAL, when the
// pile of emails drops away and PLOT appears; every segment after that is whole bars.
// Text cards ('words') stand on their own between the scenes, so the screen
// never asks you to read and watch at the same time.
export const REVEAL = 206;
export type Seg = { key: string; dur: number; words?: Word[]; tone?: 'light' | 'dark' };
export type Word = { t: string; accent?: string };
export const SEGMENTS: Seg[] = [
  { key: 'intro', dur: REVEAL + bars(1) },   // we keep everything → the pile → and read none of it → the flood → PLOT
  { key: 'whatIs', dur: bars(1), tone: 'dark', words: [{ t: 'PLOT sorts' }, { t: 'your inbox' }, { t: 'by meaning.', accent: '#3797B8' }] },
  { key: 'levels', dur: bars(1), tone: 'light', words: [{ t: 'Themes.' }, { t: 'Spaces.' }, { t: 'Clusters.', accent: '#E6D539' }] },
  { key: 'map', dur: bars(6) },
  { key: 'openWords', dur: bars(1), tone: 'dark', words: [{ t: 'Click an email' }, { t: 'to read it.', accent: '#FF9FD4' }] },
  { key: 'uiOpen', dur: bars(2) },
  { key: 'markWords', dur: bars(1), tone: 'light', words: [{ t: 'Highlight' }, { t: 'what matters.', accent: '#F9FF8D' }] },
  { key: 'uiRead', dur: bars(2) },
  { key: 'ageWords', dur: bars(1), tone: 'dark', words: [{ t: 'Old emails' }, { t: 'fade away.', accent: '#AFAFAF' }] },
  { key: 'decay', dur: bars(2) },
  { key: 'orgWords', dur: bars(1), tone: 'light', words: [{ t: 'You decide' }, { t: 'what goes where.', accent: '#62E599' }] },
  { key: 'organise', dur: bars(3) },
  { key: 'treeWords', dur: bars(1), tone: 'dark', words: [{ t: 'Delete old mail.' }, { t: 'Grow your tree.', accent: '#62E599' }] },
  { key: 'tree', dur: bars(2) },
  { key: 'end', dur: bars(3) },              // the music's own ending plays under the end card
];
export const START: Record<string, number> = (() => { const o: Record<string, number> = {}; let t = 0; for (const s of SEGMENTS) { o[s.key] = t; t += s.dur; } return o; })();
export const TOTAL = SEGMENTS.reduce((a, s) => a + s.dur, 0);
export const segDur = (key: string) => SEGMENTS.find(s => s.key === key)!.dur;

// No numbers from the demo inbox on screen: every inbox is different.
export const COPY = {
  keep: [{ t: 'We keep' }, { t: 'everything.' }] as Word[],
  read: [{ t: 'And read' }, { t: 'almost none' }, { t: 'of it.', accent: '#CD3D5C' }] as Word[],
  meaning: 'Sorted by meaning.',
  meaningSub: 'into Themes, Spaces and Clusters',
  spaces: 'Zoom in.',
  clusters: 'Down to the topic.',
  emails: 'Every dot is an email.',
  emailsSub: 'Same subject, same colour',
  open: 'Click an email to read it.',
  highlight: 'Highlight what matters.',
  decay: 'Every email shows its age.',
  decaySub: 'Older emails fade and shrink',
  organise: 'The decisions stay yours.',
  organiseSub: 'Nothing moves unless you move it',
  tree: 'Water your tree.',
  treeSub: 'Delete old emails and watch it grow',
  tagline: 'Rediscover your inbox.',
  note: 'A proof of concept, running on a demo inbox',
  credits: 'Music by BombinSound from Pixabay · Sound effects from Pixabay and ElevenLabs',
};
