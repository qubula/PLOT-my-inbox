// Delete, and the tree grows: every 5 deleted emails is one stage (web/js/tree.js).
import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, COPY } from '../config';
import { MONO } from '../fonts';
import { ramp, sp, BOUNCE } from '../anim';
import { Caption } from '../components/Caption';
import { EmailNode } from '../components/EmailNode';
import { DROPLETS } from '../icons';
import stages from '../generated/tree.json';
import { LAYOUT } from './MapScene';

export const TREE = { first: 30, step: 14 };
export const stageAt = (f: number) => Math.max(0, Math.min(8, Math.floor((f - TREE.first) / TREE.step) + 1));
const batch = LAYOUT.nodes.filter(n => n.ring >= 0).slice(0, 8);
const BASE = 1250, SCALE = 2.3;

export const Tree: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = stageAt(f);
  const changed = TREE.first + (st - 1) * TREE.step;
  const pop = st > 0 ? sp(f, fps, changed, BOUNCE) : 1;
  const svg = (stages as string[])[st];
  return (
    <AbsoluteFill style={{ background: C.light }}>
      {/* the batch of emails that get deleted, five at a time */}
      <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
        {batch.map((n, i) => {
          const at = TREE.first + i * TREE.step;
          const gone = ramp(f, at - 2, at + 6, Easing.in(Easing.cubic));
          const x = 160 + i * 108, y = 520;
          return <EmailNode key={n.id} x={x} y={y} R={30 * (1 - gone)} age={n.age} seed={n.seed} color={n.color} opacity={1 - gone} />;
        })}
      </svg>
      {batch.map((n, i) => {
        const at = TREE.first + i * TREE.step;
        const t = ramp(f, at, at + 26, Easing.in(Easing.quad));
        if (t <= 0 || t >= 1) return null;
        const x0 = 160 + i * 108, y0 = 520, x1 = 540, y1 = BASE - 260;
        return <div key={i} style={{ position: 'absolute', left: x0 + (x1 - x0) * t - 35, top: y0 + (y1 - y0) * t - 26, width: 70, opacity: 1 - ramp(f, at + 18, at + 26) }} dangerouslySetInnerHTML={{ __html: DROPLETS.replace('width="47" height="35"', 'width="70" height="52"') }} />;
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 1350 - BASE, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${SCALE * (0.86 + 0.14 * pop)})`, transformOrigin: 'bottom center' }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <Caption text={COPY.tree} sub={COPY.treeSub} delay={4} />
    </AbsoluteFill>
  );
};
