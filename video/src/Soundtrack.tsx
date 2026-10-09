// Music and effects (all from /Audio). Every cue is placed from the same timing
// constants as the animation, so retiming a beat moves its sounds with it.
// The opening has no music: just mail arriving and cards landing. The music
// starts when PLOT appears (REVEAL). Each sound has one job:
//   mail     a new email arriving          flick    an email card landing (paper)
//   riser    the build before PLOT         pop      clicks, and things appearing
//   shimmer  diving into the map, and a change taking effect
//   pencil   a highlight being drawn       drip     water reaching the tree
// Repeats vary in pitch (toneFrequency) and level so they don't sound copied.
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { BEATS, REVEAL, TOTAL, sec } from './config';
import { I, PILE, CARDS } from './scenes/Intro';
import { T } from './scenes/MapScene';
import { UI } from './scenes/Interface';
import { ORG } from './scenes/Organise';
import { TREE } from './scenes/Tree';
import { END } from './scenes/End';

const S = (() => { const o: Record<string, number> = {}; let t = 0; for (const k of Object.keys(BEATS) as (keyof typeof BEATS)[]) { o[k] = t; t += BEATS[k]; } return o; })();
type Cue = { f: string; at: number; v: number; tone?: number; len?: number };
const rnd = (i: number) => { const x = Math.sin(i * 91.7) * 43758.5; return x - Math.floor(x); };

// a few emails arrive while the pile builds: not one per item, or it never stops ringing
const mailTimes = [PILE[0].at, PILE[4].at, PILE[10].at, PILE[18].at, PILE[27].at];
// cards: the first three land on their own, then the flicks pile up into one rush
const flicks = CARDS.filter((c, i) => i < 3 || i % 2 === 0).slice(0, 44);

export const CUES: Cue[] = [
  // we keep everything
  ...mailTimes.map((at, i) => ({ f: 'mail.mp3', at, v: 0.55 - i * 0.04, tone: 1 + i * 0.03 })),
  // and read almost none of it: one, two, three… then the whole deck
  ...flicks.map((c, i) => ({ f: 'flick.mp3', at: c.at, v: i < 3 ? 0.9 : 0.35 + rnd(i) * 0.25, tone: 0.85 + rnd(i + 9) * 0.35 })),
  { f: 'riser.mp3', at: REVEAL - sec(2.0), v: 0.45, len: sec(4) },   // it peaks 2 s in
  // PLOT appears (the music starts here), then the dive into the map
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: I.drop + 4 + i * 3, v: 0.4, tone: 0.8 + i * 0.1 })),
  { f: 'shimmer.mp3', at: I.dive + 8, v: 0.6 },
  // the map: clicks and the dives between levels
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.map + T.themeIn + i * 3 + 6, v: 0.3, tone: 0.8 + i * 0.1 })),
  ...[T.click1, T.click2, T.click3].map((at, i) => ({ f: 'pop.mp3', at: S.map + at, v: 0.6, tone: 1.1 + i * 0.08 })),
  ...[T.zoom1, T.zoom2, T.zoom3].map((at, i) => ({ f: 'shimmer.mp3', at: S.map + at + 6, v: 0.2, tone: 0.75 + i * 0.12 })),
  // the interface: open an email, highlight a line
  { f: 'pop.mp3', at: S.ui + UI.click, v: 0.65, tone: 1.2 },
  { f: 'pencil.mp3', at: S.ui + UI.mark, v: 0.6 },
  { f: 'pencil.mp3', at: S.ui + UI.mark + 7, v: 0.45, tone: 1.1 },
  // organise
  { f: 'pop.mp3', at: S.organise + ORG.selA, v: 0.55, tone: 1.15 },
  { f: 'pop.mp3', at: S.organise + ORG.selB, v: 0.55, tone: 1.3 },
  { f: 'pop.mp3', at: S.organise + ORG.group, v: 0.7, tone: 1.0 },
  { f: 'shimmer.mp3', at: S.organise + ORG.fly + 4, v: 0.35, tone: 1.2 },
  // tree: a soft pop as each email goes, a drip as its water reaches the tree
  ...Array.from({ length: 8 }, (_, i) => ({ f: 'pop.mp3', at: S.tree + TREE.first + i * TREE.step, v: 0.35, tone: 1.25 - i * 0.04 })),
  ...Array.from({ length: 8 }, (_, i) => ({ f: 'drip.mp3', at: S.tree + TREE.first + i * TREE.step + 22, v: 0.55, tone: 0.9 + i * 0.05 })),
  // end
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.end + END.logo + i * 3 + 6, v: 0.4, tone: 0.8 + i * 0.1 })),
];

// music: in at REVEAL, a little lower under the small sounds of the interface and the tree
const MUSIC = { file: 'audio/music.mp3', level: 0.55 };
const DIPS: [number, number, number][] = [
  [S.ui + UI.mark - 6, S.ui + UI.mark + 24, 0.7],
  [S.tree + TREE.first - 6, S.tree + TREE.first + 8 * TREE.step + 24, 0.7],
];
export const Soundtrack: React.FC = () => {
  const vol = (f: number) => {
    const g = f + REVEAL;   // the music's Sequence starts at REVEAL
    let v = interpolate(g, [TOTAL - sec(1.5), TOTAL], [MUSIC.level, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    for (const [a, b, k] of DIPS) v *= interpolate(g, [a - 8, a, b, b + 12], [1, k, k, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return v;
  };
  return (<>
    <Sequence from={REVEAL}><Audio src={staticFile(MUSIC.file)} volume={vol} /></Sequence>
    {CUES.map((c, i) => <Sequence key={i} from={Math.max(0, c.at)} durationInFrames={c.len ?? sec(2)}><Audio src={staticFile('audio/' + c.f)} volume={c.v} toneFrequency={c.tone ?? 1} /></Sequence>)}
  </>);
};
