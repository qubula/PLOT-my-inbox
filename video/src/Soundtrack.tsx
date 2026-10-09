// Music and effects (all from /Audio). Every cue is placed from the same timing
// constants as the animation, so retiming a beat moves its sounds with it.
// Each sound has one job:
//   pings    new mail arriving          crumple  paper: the mess, and deleting
//   riser    the build into the drop    shimmer  falling through PLOT's O, and new things appearing
//   pop      clicks and things landing  pencil   a label drawing on
//   drip     water reaching the tree
// Repeats vary in pitch (toneFrequency) and level so they don't sound copied.
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { BEATS, MUSIC_START, TOTAL, sec } from './config';
import { I } from './scenes/Intro';
import { T } from './scenes/MapScene';
import { DECAY } from './scenes/Decay';
import { ORG } from './scenes/Organise';
import { TREE } from './scenes/Tree';
import { END } from './scenes/End';

const S = (() => { const o: Record<string, number> = {}; let t = 0; for (const k of Object.keys(BEATS) as (keyof typeof BEATS)[]) { o[k] = t; t += BEATS[k]; } return o; })();
type Cue = { f: string; at: number; v: number; tone?: number; len?: number; from?: number };
const rnd = (i: number) => { const x = Math.sin(i * 91.7) * 43758.5; return x - Math.floor(x); };
// mail arriving: rotate the three notification sounds, a little higher each time
const pings = (times: number[], v: number, seed = 0): Cue[] => times.map((at, i) => ({ f: `ping-${1 + ((i + seed) % 3)}.mp3`, at: Math.round(at), v: v * (0.75 + rnd(i + seed) * 0.4), tone: 0.92 + rnd(i + 3 + seed) * 0.22 }));
const accel = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + (to - from) * Math.sqrt(i / n));

export const CUES: Cue[] = [
  // we keep everything: things land, and mail keeps arriving, faster and faster
  { f: 'pop.mp3', at: 2, v: 0.6, tone: 0.8 },
  ...pings(accel(12, I.pileEnd - 4, 16), 0.32),
  ...[20, 34, 46, 56, 64, 71, 77, 82, 86].map((at, i) => ({ f: 'pop.mp3', at, v: 0.18 + rnd(i + 40) * 0.12, tone: 0.75 + rnd(i + 50) * 0.5 })),
  // and read almost none of it: a flood of mail over the build
  ...pings(Array.from({ length: 22 }, (_, i) => I.burst + i * 2.6 + rnd(i + 60) * 2), 0.2, 1),
  { f: 'riser.mp3', at: S.map - sec(6.02), v: 0.4, len: sec(6.1) },
  // the mess is scrunched into a ball; the ball drops into PLOT
  { f: 'crumple.mp3', at: I.crumple - 2, v: 0.95, len: sec(1.6) },
  { f: 'pop.mp3', at: I.land, v: 0.7, tone: 0.7 },
  ...[0, 1, 2].map(i => ({ f: 'pop.mp3', at: I.land - 4 + i * 3, v: 0.3, tone: 1.0 + i * 0.12 })),
  { f: 'pop.mp3', at: I.click, v: 0.75, tone: 1.25 },
  { f: 'shimmer.mp3', at: I.through + 4, v: 0.75 },
  // the map
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.map + T.themeIn + i * 3 + 6, v: 0.35, tone: 0.8 + i * 0.1 })),
  ...[T.note1, T.note2, T.note3, T.note4, T.note4 + 8].map((at, i) => ({ f: 'pencil.mp3', at: S.map + at, v: 0.45, tone: 0.95 + i * 0.05 })),
  ...[T.click1, T.click2, T.click3].map((at, i) => ({ f: 'pop.mp3', at: S.map + at, v: 0.6, tone: 1.1 + i * 0.08 })),
  ...[T.zoom1, T.zoom2, T.zoom3].map((at, i) => ({ f: 'shimmer.mp3', at: S.map + at + 6, v: 0.22, tone: 0.75 + i * 0.12 })),
  ...Array.from({ length: 10 }, (_, i) => ({ f: 'pop.mp3', at: S.map + T.emailsFly + 4 + i * 3, v: 0.16 + rnd(i + 70) * 0.08, tone: 1.1 + i * 0.05 })),
  { f: 'shimmer.mp3', at: S.map + T.colour, v: 0.35, tone: 1.15 },
  // decay: one email ages, quietly
  { f: 'pop.mp3', at: S.decay + 4, v: 0.4, tone: 0.9 },
  { f: 'shimmer.mp3', at: S.decay + DECAY.end - 8, v: 0.25, tone: 0.7 },
  // organise
  { f: 'pop.mp3', at: S.organise + ORG.selA, v: 0.55, tone: 1.15 },
  { f: 'pop.mp3', at: S.organise + ORG.selB, v: 0.55, tone: 1.3 },
  { f: 'pop.mp3', at: S.organise + ORG.group, v: 0.75, tone: 1.0 },
  { f: 'shimmer.mp3', at: S.organise + ORG.fly + 4, v: 0.4, tone: 1.2 },
  { f: 'pencil.mp3', at: S.organise + ORG.note + 4, v: 0.45 },
  // tree: each delete is a crumple, then a drip as the water lands and the tree grows
  ...Array.from({ length: 8 }, (_, i) => ({ f: 'crumple.mp3', at: S.tree + TREE.first + i * TREE.step - 3, v: 0.55, tone: 1.15 + (i % 3) * 0.12, len: sec(0.45), from: Math.round(rnd(i + 80) * 20) })),
  ...Array.from({ length: 8 }, (_, i) => ({ f: 'drip.mp3', at: S.tree + TREE.first + i * TREE.step + 22, v: 0.6, tone: 0.9 + i * 0.06 })),
  // end
  ...[0, 1, 2, 3].map(i => ({ f: 'pop.mp3', at: S.end + END.logo + i * 3 + 6, v: 0.45, tone: 0.8 + i * 0.1 })),
  { f: 'shimmer.mp3', at: S.end + END.tag, v: 0.4 },
];

// music: steady under the film, dipped where small sounds need to be heard
const MUSIC = { file: 'audio/music.mp3', level: 0.5 };
const DIPS: [number, number, number][] = [
  [I.crumple - 4, I.crumple + 30, 0.6],
  [S.tree + TREE.first - 6, S.tree + TREE.first + 8 * TREE.step + 20, 0.65],
];
export const Soundtrack: React.FC = () => {
  const vol = (f: number) => {
    let v = interpolate(f, [0, sec(0.4), TOTAL - sec(2.2), TOTAL], [0, MUSIC.level, MUSIC.level, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    for (const [a, b, k] of DIPS) v *= interpolate(f, [a - 8, a, b, b + 12], [1, k, k, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return v;
  };
  return (<>
    <Audio src={staticFile(MUSIC.file)} startFrom={Math.round(MUSIC_START * 30)} volume={vol} />
    {CUES.map((c, i) => <Sequence key={i} from={Math.max(0, c.at)} durationInFrames={c.len ?? sec(2)}><Audio src={staticFile('audio/' + c.f)} volume={c.v} toneFrequency={c.tone ?? 1} startFrom={c.from ?? 0} /></Sequence>)}
  </>);
};
