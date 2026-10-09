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
// pile of emails drops away and PLOT appears; every scene after that is whole bars.
export const REVEAL = 200;
export const BEATS = {
  intro: REVEAL + bars(2), // we keep everything → cards flood the screen → they drop → PLOT
  map: bars(8),            // Themes → Spaces → Clusters → emails
  ui: bars(4),             // the real interface: open an email, highlight a line
  decay: bars(3),
  organise: bars(4),
  tree: bars(3),
  end: bars(3),            // the music's own ending plays under the end card
};
export const TOTAL = Object.values(BEATS).reduce((a, b) => a + b, 0);

// No numbers from the demo inbox on screen: every inbox is different.
export const COPY = {
  keep: 'We keep everything.',
  read: 'And read almost none of it.',
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
