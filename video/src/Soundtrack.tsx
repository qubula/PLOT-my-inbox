// Music and effects (all from /Audio). Every cue is placed from the same timing
// constants as the animation, so retiming a beat moves its sounds with it.
// The opening has no music: just mail arriving and cards landing. The music
// starts when PLOT appears (REVEAL). Each sound has one job:
//   mail     a new email arriving          flick    an email card landing (paper)
//   riser    the build before PLOT         pop      clicks, and things appearing
//   shimmer  diving into the map, and a change taking effect
//   pencil   a highlight being drawn       shimmer (rising) the tree growing
// Repeats vary in pitch (toneFrequency) and level so they don't sound copied.
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { BAR, COPY, MUSIC_PHRASES, REVEAL, START, TOTAL, sec } from './config';
import { lineTimes } from './components/Words';
import { I, PILE, CARDS } from './scenes/Intro';
import { T } from './scenes/MapScene';
import { UI } from './scenes/Interface';
import { ORG } from './scenes/Organise';
import { TREE, landings } from './scenes/Tree';
import { END } from './scenes/End';

const S = START;
type Cue = { f: string; at: number; v: number; tone?: number; len?: number };
const rnd = (i: number) => { const x = Math.sin(i * 91.7) * 43758.5; return x - Math.floor(x); };

// the pile: every item makes a sound as it lands (3 frames in, at the top of its bounce):
// emails ping, folders and files land with a soft pop; when they come faster than one
// every 2 frames, only some get their own sound
const pileCues: Cue[] = [];
{ let last = -9;
  for (const it of [...PILE].sort((a, b) => a.at - b.at)) {
    const t = it.at + 3;
    if (t - last < 2) continue;
    last = t;
    const isMail = it.kind === 'card' || it.kind === 'inbox';
    pileCues.push(isMail ? { f: 'mail.mp3', at: t, v: 0.42, tone: 0.95 + rnd(it.i) * 0.15 } : { f: 'pop.mp3', at: t, v: 0.32, tone: 0.65 + rnd(it.i + 5) * 0.35 });
  } }
// a flick on the frame each card lands (it lands 4 frames after it appears);
// once they come faster than one every 2 frames, only some get their own sound
const LAND = 4;
const flicks: number[] = [];
for (const c of CARDS) { const t = c.at + LAND; if (!flicks.length || t - flicks[flicks.length - 1] >= 2) flicks.push(t); }

export const CUES: Cue[] = [
  // the opening words, each line with a low pop as it lands
  ...lineTimes(COPY.keep).map((t, i) => ({ f: 'pop.mp3', at: I.w1 + t, v: 0.55, tone: 0.7 + i * 0.08 })),
  ...lineTimes(COPY.read, 12).map((t, i) => ({ f: 'pop.mp3', at: I.w2 + t, v: 0.55, tone: 0.7 + i * 0.08 })),
  // we keep everything: the pile lands
  ...pileCues,
  // and read almost none of it: one, two, three… then the whole deck
  ...flicks.map((at, i) => ({ f: 'flick.mp3', at, v: i < 3 ? 0.9 : 0.4 + rnd(i) * 0.25, tone: 0.85 + rnd(i + 9) * 0.35 })),
  { f: 'riser.mp3', at: REVEAL - sec(2.0), v: 0.45, len: sec(4) },   // it peaks 2 s in, on the reveal
  // PLOT appears (the music starts here)
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: I.drop + 4 + i * 3, v: 0.4, tone: 0.8 + i * 0.1 })),
  // the map: clicks and the dives between levels
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.map + T.themeIn + i * 3 + 6, v: 0.3, tone: 0.8 + i * 0.1 })),
  ...[T.click1, T.click2, T.click3].map((at, i) => ({ f: 'pop.mp3', at: S.map + at, v: 0.6, tone: 1.1 + i * 0.08 })),
  ...[T.zoom1, T.zoom2, T.zoom3].map((at, i) => ({ f: 'shimmer.mp3', at: S.map + at + 6, v: 0.2, tone: 0.75 + i * 0.12 })),
  // the interface: open an email, highlight a line
  { f: 'pop.mp3', at: S.uiOpen + UI.click, v: 0.65, tone: 1.2 },
  { f: 'pencil.mp3', at: S.uiRead + UI.mark, v: 0.6 },
  { f: 'pencil.mp3', at: S.uiRead + UI.mark + 7, v: 0.45, tone: 1.1 },
  // organise
  { f: 'pop.mp3', at: S.organise + ORG.selA, v: 0.55, tone: 1.15 },
  { f: 'pop.mp3', at: S.organise + ORG.selB, v: 0.55, tone: 1.3 },
  { f: 'pop.mp3', at: S.organise + ORG.group, v: 0.7, tone: 1.0 },
  { f: 'shimmer.mp3', at: S.organise + ORG.fly + 4, v: 0.35, tone: 1.2 },
  // tree: a soft pop for the first deletes; the sound is the tree growing, higher each time
  ...TREE.del.slice(0, 3).map((at, i) => ({ f: 'pop.mp3', at: S.tree + at, v: 0.35, tone: 1.2 - i * 0.05 })),
  ...landings.map((at, i) => ({ f: 'shimmer.mp3', at: S.tree + at, v: i < 3 ? 0.55 : 0.4, tone: 0.8 + i * 0.09 })),
  // end
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.end + END.logo + i * 3 + 6, v: 0.4, tone: 0.8 + i * 0.1 })),
];

// music: in at REVEAL, from its second bar, so its last phrase ends where the end card
// starts and its own ending plays under the end card; a little lower under the small sounds
const MUSIC = { file: 'audio/music.mp3', level: 0.55, skip: Math.round(MUSIC_PHRASES * 2 * BAR - (START.end - REVEAL)) };
const DIPS: [number, number, number][] = [
  [S.uiRead + UI.mark - 6, S.uiRead + UI.mark + 24, 0.7],
  [S.tree + TREE.del[0] - 6, S.tree + landings[landings.length - 1] + 20, 0.75],
];
export const Soundtrack: React.FC = () => {
  const vol = (f: number) => {
    const g = f + REVEAL;   // the music's Sequence starts at REVEAL
    let v = interpolate(g, [TOTAL - sec(1.5), TOTAL], [MUSIC.level, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    for (const [a, b, k] of DIPS) v *= interpolate(g, [a - 8, a, b, b + 12], [1, k, k, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return v;
  };
  return (<>
    <Sequence from={REVEAL}><Audio src={staticFile(MUSIC.file)} startFrom={MUSIC.skip} volume={vol} /></Sequence>
    {CUES.map((c, i) => <Sequence key={i} from={Math.max(0, c.at)} durationInFrames={c.len ?? sec(2)}><Audio src={staticFile('audio/' + c.f)} volume={c.v} toneFrequency={c.tone ?? 1} /></Sequence>)}
  </>);
};
