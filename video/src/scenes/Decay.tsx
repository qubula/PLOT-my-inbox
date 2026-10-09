// Digital decomposition: one email ages from newest to oldest.
import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';
import { C, CLUSTER, COPY } from '../config';
import { MONO } from '../fonts';
import { ramp } from '../anim';
import { Caption } from '../components/Caption';
import { blob, haloAlpha, map } from '../geom';

export const DECAY = { start: 20, end: 130 };
const SEED = (CLUSTER.nodes as any[])[0].seed;

export const Decay: React.FC = () => {
  const f = useCurrentFrame();
  const t = ramp(f, DECAY.start, DECAY.end, Easing.bezier(0.45, 0, 0.3, 1));
  const age = 0.99 - t * 0.97;
  const R = 250, cx = 540, cy = 860;
  const halo = Math.min(1, Math.max(0, (0.99 - age) / 0.05));
  const N = map(Math.min(age, 0.949), 0, 1, 5, 11);
  const n0 = Math.floor(N), fr = N - n0;
  const solidOp = 1 - halo;
  const enter = ramp(f, 0, 16);
  return (
    <AbsoluteFill style={{ background: C.light }}>
      <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0, opacity: enter, transform: `scale(${0.9 + 0.1 * enter})`, transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={R} fill="#D7D7D7" fillOpacity={haloAlpha(age) * halo} stroke="#A0A0A0" strokeOpacity={halo} strokeWidth={2} strokeDasharray="10 10" />
        <circle cx={cx} cy={cy} r={R} fill="#000" opacity={solidOp} />
        <path d={blob(cx, cy, R, Math.min(age, 0.949), SEED, n0)} fill="#000" opacity={halo} />
        <path d={blob(cx, cy, R, Math.min(age, 0.949), SEED, Math.min(10, n0 + 1))} fill="#000" opacity={halo * fr} />
      </svg>
      <div style={{ position: 'absolute', left: 150, right: 150, top: 1180, fontFamily: MONO, fontSize: 24, letterSpacing: '0.12em', color: 'rgba(0,0,0,0.5)', opacity: enter }}>
        <div style={{ position: 'relative', height: 2, background: 'rgba(0,0,0,0.18)', marginBottom: 22 }}>
          <div style={{ position: 'absolute', left: `${t * 100}%`, top: -9, width: 20, height: 20, marginLeft: -10, borderRadius: 10, background: '#000' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>NEWER</span><span>OLDER</span></div>
      </div>
      <Caption text={COPY.decay} sub={COPY.decaySub} delay={6} />
    </AbsoluteFill>
  );
};
