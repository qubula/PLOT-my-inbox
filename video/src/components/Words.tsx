// A text card: nothing on screen but words. The card slides up over the last
// shot, then each line slams in on its own beat; one line can sit on a block
// of colour that snaps in behind it.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, C, Word } from '../config';
import { UI } from '../fonts';
import { sp } from '../anim';

type Props = { words: Word[]; tone?: 'light' | 'dark'; gap?: number; wipe?: boolean };
export const lineTimes = (words: Word[], gap = BEAT) => words.map((_, i) => 3 + Math.round(i * gap));

export const Words: React.FC<Props> = ({ words, tone = 'light', gap = BEAT, wipe = true }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bg = tone === 'dark' ? C.themes : C.light, ink = tone === 'dark' ? '#FFFFFF' : '#000000';
  const up = wipe ? interpolate(f, [0, 5], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) : 0;
  const longest = Math.max(...words.map(w => w.t.length));
  const fs = Math.min(132, 940 / (longest * 0.54));
  const at = lineTimes(words, gap);
  return (
    <AbsoluteFill style={{ transform: `translateY(${up}%)`, background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: fs * 0.12 }}>
      {words.map((w, i) => {
        const k = f - at[i];
        if (k < 0) return <div key={i} style={{ height: fs * 1.08 }} />;
        const slam = 1 + 0.9 * (1 - Easing.out(Easing.exp)(Math.min(1, k / 6)));
        const block = w.accent ? sp(f, fps, at[i] + 1, { damping: 12, stiffness: 170, mass: 0.7 }) : 0;
        return (
          <div key={i} style={{ position: 'relative', height: fs * 1.08, display: 'flex', alignItems: 'center' }}>
            {w.accent ? <div style={{ position: 'absolute', left: -fs * 0.22, right: -fs * 0.22, top: fs * 0.02, bottom: -fs * 0.04, background: w.accent, borderRadius: fs * 0.12,
              transform: `rotate(${-9 + 7 * block}deg) scale(${block})` }} /> : null}
            <span style={{ position: 'relative', fontFamily: UI, fontWeight: 600, fontSize: fs, lineHeight: 1, letterSpacing: '-0.045em', whiteSpace: 'nowrap',
              color: w.accent ? '#000000' : ink, transform: `scale(${slam})`, display: 'inline-block' }}>{w.t}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
