// Reshape a cluster by hand: select two floating emails and Group them into a new thread.
import React from 'react';
import { AbsoluteFill, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, COPY } from '../config';
import { MONO, UI } from '../fonts';
import { ramp, sp } from '../anim';
import { Caption } from '../components/Caption';
import { Cursor } from '../components/Pill';
import { EmailNode } from '../components/EmailNode';
import { Icon } from '../components/Icon';
import { LAYOUT } from './MapScene';
import { map } from '../geom';
import { Callout } from '../components/Callout';

export const ORG = { selA: 34, selB: 58, panel: 66, toGroup: 80, group: 104, fly: 110, note: 140 };
const NEW = '#62E599';
const { nodes, tCl, k2, Z3, SC, ringsR } = LAYOUT;
const CY = 760;
const P = (x: number, y: number) => [SC.x + (x - tCl.wx) * Z3, CY + (y - tCl.wy) * Z3];
const floating = nodes.filter(n => n.ring < 0);
const A = floating[0], Bn = floating[1];
// empty slots on the outer ring, below the cluster (threads sit from 12 o'clock)
const outer = Math.max(...ringsR);
const slot = (deg: number) => [tCl.wx + Math.cos(deg * Math.PI / 180) * outer * k2, tCl.wy + Math.sin(deg * Math.PI / 180) * outer * k2];
const SLOTS = [slot(118), slot(131)];

export const Organise: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [cx, cy] = P(tCl.wx, tCl.wy);
  const selA = sp(f, fps, ORG.selA) * (1 - ramp(f, ORG.fly + 10, ORG.fly + 22));
  const selB = sp(f, fps, ORG.selB) * (1 - ramp(f, ORG.fly + 10, ORG.fly + 22));
  const fly = spring({ frame: f - ORG.fly, fps, config: { damping: 20, stiffness: 90, mass: 1 } });
  const recol = ramp(f, ORG.group + 2, ORG.group + 10);
  const panel = sp(f, fps, ORG.panel) * (1 - ramp(f, ORG.fly + 4, ORG.fly + 20));
  // cursor path: A → B → Group button
  const groupBtn = [540 - 120, 1350 - 60 - 230 + 70];
  const pa = P(A.wx, A.wy), pb = P(Bn.wx, Bn.wy);
  const m1 = sp(f, fps, 6, { damping: 26, stiffness: 90, mass: 1 }), m2 = sp(f, fps, ORG.selB - 16, { damping: 26, stiffness: 90, mass: 1 }), m3 = sp(f, fps, ORG.toGroup, { damping: 26, stiffness: 90, mass: 1 });
  let x = 900 + (pa[0] - 900) * m1, y = 1250 + (pa[1] - 1250) * m1;
  x += (pb[0] - pa[0]) * m2; y += (pb[1] - pa[1]) * m2;
  x += (groupBtn[0] - pb[0]) * m3; y += (groupBtn[1] - pb[1]) * m3;
  const press = (c: number) => Math.max(0, 1 - Math.abs(f - c) / 4);
  const pr = Math.max(press(ORG.selA), press(ORG.selB), press(ORG.group));
  const curSize = 12 + 30 * m3;
  return (
    <AbsoluteFill style={{ background: C.light }}>
      <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={cx} cy={cy} r={tCl.R * Z3 * map(tCl.age, 0, 1, 0.10, 0.85)} fill={C.cluster} />
        <circle cx={cx} cy={cy} r={tCl.R * Z3} fill="none" stroke={C.cluster} strokeWidth={1} strokeDasharray={`${0.18 * tCl.R * Z3} ${0.08 * tCl.R * Z3}`} />
        {ringsR.map((r, i) => <circle key={i} cx={cx} cy={cy} r={r * k2 * Z3} fill="none" stroke="#C8C8C8" strokeWidth={1} />)}
        {nodes.map(n => {
          const isA = n === A, isB = n === Bn;
          let [nx, ny] = P(n.wx, n.wy);
          let col = n.color || '#000000';
          let sel = 0;
          if (isA || isB) {
            const [sx, sy] = P(...(SLOTS[isA ? 0 : 1] as [number, number]));
            nx += (sx - nx) * fly; ny += (sy - ny) * fly;
            col = interpolateColors(recol, [0, 1], ['#000000', NEW]);
            sel = isA ? selA : selB;
          }
          return <EmailNode key={n.id} x={nx} y={ny} R={n.R * Z3} age={n.age} seed={n.seed} color={col} sel={sel} />;
        })}
      </svg>
      {/* Organise panel, as in the app */}
      <div style={{ position: 'absolute', left: 540 - 300, width: 600, top: 1350 - 60 - 230, height: 230, background: C.panel, borderRadius: 16, padding: '26px 30px', boxSizing: 'border-box',
        transform: `translateY(${(1 - panel) * 340}px)`, boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 20, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)' }}>ORGANISE</div>
        <div style={{ display: 'flex', gap: 46, marginTop: 20, paddingLeft: 10, alignItems: 'flex-end' }}>
          {([['archive', 'Archive'], ['group', 'Group'], ['split', 'Split']] as const).map(([k, l]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: k === 'group' ? `scale(${1 - 0.08 * press(ORG.group)})` : undefined }}>
              <Icon name={k} size={52} />
              <span style={{ fontFamily: MONO, fontSize: 19 }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 22, justifyContent: 'center' }}>
          {C.threads.map(h => <div key={h} style={{ width: 40, height: 40, borderRadius: 20, background: h }} />)}
        </div>
      </div>
      <Cursor x={x} y={y} size={curSize} opacity={1 - ramp(f, ORG.group + 14, ORG.group + 24)} press={pr} />
      {(() => {
        // the new thread, ringed the way the app rings a group
        const a = P(...(SLOTS[0] as [number, number])), b2 = P(...(SLOTS[1] as [number, number]));
        const mx = (a[0] + b2[0]) / 2, my = (a[1] + b2[1]) / 2, rr = Math.hypot(a[0] - b2[0], a[1] - b2[1]) / 2 + 34;
        const t = ramp(f, ORG.note - 6, ORG.note + 8), L = 2 * Math.PI * rr;
        return <>
          <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
            <circle cx={mx} cy={my} r={rr} fill="none" stroke="#000" strokeWidth={2} strokeDasharray={`${L * t} ${L}`} transform={`rotate(-90 ${mx} ${my})`} opacity={t > 0 ? 1 : 0} />
          </svg>
          <Callout at={[mx, my]} r={rr} dx={-40} dy={200} text="a new thread" from={ORG.note + 4} />
        </>;
      })()}
      <Caption text={COPY.organise} sub={COPY.organiseSub} delay={4} />
    </AbsoluteFill>
  );
};
