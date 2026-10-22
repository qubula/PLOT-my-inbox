// Headline at the top of the frame. Words rise in a beat apart; the line lifts out at `out`.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { UI, MONO } from '../fonts';
import { ramp, sp } from '../anim';

type Props = { text: string; sub?: React.ReactNode; color?: string; delay?: number; out?: number; top?: number };
export const Caption: React.FC<Props> = ({ text, sub, color = '#000', delay = 0, out, top = 104 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const words = text.split(' ');
  const leave = out === undefined ? 0 : ramp(frame, out, out + 9);
  return (
    <div style={{ position: 'absolute', left: 90, width: width - 180, top, textAlign: 'center', color, pointerEvents: 'none',
      opacity: 1 - leave, transform: `translateY(${-26 * leave}px)`, filter: leave ? `blur(${leave * 6}px)` : undefined }}>
      <div style={{ fontFamily: UI, fontSize: 60, fontWeight: 600, lineHeight: 1.08, letterSpacing: '-0.035em' }}>
        {words.map((w, i) => {
          const t = sp(frame, fps, delay + i * 3);
          return (
            <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.1em', marginBottom: '-0.1em' }}>
              <span style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 105}%)`, opacity: Math.min(1, t * 1.6) }}>{w}{i < words.length - 1 ? ' ' : ''}</span>
            </span>
          );
        })}
      </div>
      {sub !== undefined ? (
        <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 27, fontWeight: 400, letterSpacing: '-0.01em', opacity: 0.66 * sp(frame, fps, delay + words.length * 3 + 6) }}>{sub}</div>
      ) : null}
    </div>
  );
};
