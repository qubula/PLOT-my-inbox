// Delete, and the tree grows (web/js/tree.js stages). The first three deletes
// take their time; after that you have the idea, so the rest come in a rush
// and the tree shoots up to full size.
import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../config';
import { ramp, sp } from '../anim';
import { EmailNode } from '../components/EmailNode';
import { DROPLETS } from '../icons';
import stages from '../generated/tree.json';
import { LAYOUT } from './MapScene';

export const TREE = { del: [8, 22, 34, 44, 49, 54, 58, 62], fall: 14 };
export const landings = TREE.del.map(d => d + TREE.fall);
const batch = LAYOUT.nodes.filter(n => n.ring >= 0).slice(0, 8);
const BASE = 1160, SCALE = 2.6, ROW = 330, TOP = BASE - 560;
const nx = (i: number) => 162 + i * 108;
const LEAF = ['#4CAF50', '#2E7D32', '#8BC34A', '#62E599'];

export const Tree: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = landings.filter(l => f >= l).length;
  const last = st > 0 ? landings[st - 1] : -99;
  // each growth: a squash and stretch, and a little wobble
  const g = st > 0 ? sp(f, fps, last, { damping: 9, stiffness: 200, mass: 0.6 }) : 1;
  const sy = 0.9 + 0.1 * g, sx = 1.06 - 0.06 * g;
  const wob = st > 0 ? Math.sin((f - last) * 0.9) * 3 * Math.max(0, 1 - (f - last) / 14) : 0;
  const push = 1 + 0.07 * ramp(f, 40, 80, Easing.inOut(Easing.cubic));
  return (
    <AbsoluteFill style={{ background: C.light }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `540px ${BASE - 200}px` }}>
        {/* the emails to clear */}
        <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
          {batch.map((n, i) => {
            const d = TREE.del[i];
            const pop = f < d ? 1 : f < d + 3 ? 1 + 0.25 * ((f - d) / 3) : Math.max(0, 1.25 - (f - d - 3) / 4);
            if (pop <= 0) return null;
            return <EmailNode key={n.id} x={nx(i)} y={ROW} R={32 * pop} age={n.age} seed={n.seed} color={n.color} />;
          })}
        </svg>
        {/* each one turns into water that falls into the tree */}
        {batch.map((n, i) => {
          const d = TREE.del[i];
          const t = ramp(f, d + 2, d + TREE.fall, Easing.in(Easing.quad));
          if (t <= 0 || t >= 1) return null;
          const x = nx(i) + (540 - nx(i)) * Easing.out(Easing.quad)(t), y = ROW + (TOP - ROW) * t;
          return <div key={i} style={{ position: 'absolute', left: x - 30, top: y - 22, width: 60, transform: `scale(${1 - 0.3 * t})` }} dangerouslySetInnerHTML={{ __html: DROPLETS.replace('width="47" height="35"', 'width="60" height="45"') }} />;
        })}
        {/* leaves burst off the crown as it grows */}
        <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
          {landings.slice(0, st).map((l, j) => {
            const k = f - l;
            if (k > 16) return null;
            return Array.from({ length: 7 }, (_, q) => {
              const a = -Math.PI / 2 + (q - 3) * 0.42 + j;
              const r = 40 + k * 9;
              return <circle key={j * 10 + q} cx={540 + Math.cos(a) * r} cy={TOP + 40 + Math.sin(a) * r * 0.8 + k * k * 0.25} r={9 * (1 - k / 16)} fill={LEAF[(q + j) % 4]} />;
            });
          })}
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 1350 - BASE, display: 'flex', justifyContent: 'center' }}>
          <div style={{ transform: `rotate(${wob}deg) scale(${SCALE * sx}, ${SCALE * sy})`, transformOrigin: 'bottom center' }} dangerouslySetInnerHTML={{ __html: (stages as string[])[st] }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
