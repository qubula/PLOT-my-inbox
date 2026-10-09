import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, CLUSTER, COPY, segDur } from '../config';
import { LOGO, MONO, UI } from '../fonts';
import { ramp, sp } from '../anim';
import { EmailNode } from '../components/EmailNode';

export const END = { logo: 4, tag: 22, row: 34 };
const SEED = (CLUSTER.nodes as any[])[3].seed;
export const End: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = 1 - ramp(f, segDur('end') - 20, segDur('end') - 2);
  return (
    <AbsoluteFill style={{ background: C.light, opacity: fade }}>
      <div style={{ position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontFamily: LOGO, fontSize: 250, letterSpacing: '-0.04em', lineHeight: 1 }}>
        {'PLOT'.split('').map((ch, i) => { const t = sp(f, fps, END.logo + i * 3); return <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 70}px)`, opacity: Math.min(1, t * 1.5) }}>{ch}</span>; })}
      </div>
      <div style={{ position: 'absolute', top: 700, left: 90, right: 90, textAlign: 'center', fontFamily: UI, fontWeight: 600, fontSize: 64, letterSpacing: '-0.035em', lineHeight: 1.12, opacity: sp(f, fps, END.tag), transform: `translateY(${(1 - sp(f, fps, END.tag)) * 20}px)` }}>{COPY.tagline}</div>
      <svg width={1080} height={200} style={{ position: 'absolute', top: 860, left: 0 }}>
        {[0.03, 0.22, 0.42, 0.62, 0.82, 0.99].map((a, i) => { const t = sp(f, fps, END.row + i * 3); return <EmailNode key={i} x={240 + i * 120} y={100} R={40 * t} age={a} seed={SEED + i} />; })}
      </svg>
      <div style={{ position: 'absolute', bottom: 120, left: 60, right: 60, textAlign: 'center', fontFamily: MONO, fontSize: 24, color: 'rgba(0,0,0,0.6)', opacity: ramp(f, 40, 56), lineHeight: 1.7 }}>
        <div>{COPY.note}</div>
        <div style={{ fontSize: 19, opacity: 0.8 }}>{COPY.credits}</div>
      </div>
    </AbsoluteFill>
  );
};
