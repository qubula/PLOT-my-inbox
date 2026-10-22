// A clean label for something on screen: a thin line that draws itself from
// the label to the thing, ending in a dot, with a mono label. Labels are kept
// inside a safe margin, so a line never points off the frame.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ramp } from '../anim';
import { MONO } from '../fonts';

const SAFE = { l: 80, r: 1000, t: 300, b: 1270 };
const SIZE = 25;
const MIN = 110;

type Props = { at: [number, number]; r?: number; dx: number; dy: number; text: string; from: number; out?: number; color?: string };
export const Callout: React.FC<Props> = ({ at, r = 0, dx, dy, text, from, out, color = '#000' }) => {
  const f = useCurrentFrame();
  const line = ramp(f, from, from + 9);
  const label = ramp(f, from + 5, from + 13);
  const o = out === undefined ? 1 : 1 - ramp(f, out, out + 7);
  if (line <= 0 || o <= 0) return null;
  const w = text.length * SIZE * 0.6;
  // keep a clear run of line between the label and the thing (MIN px at least)
  const d0 = Math.hypot(dx, dy) || 1;
  const need = r + MIN + (Math.abs(dx) > Math.abs(dy) ? w / 2 : 24);
  const kx = d0 < need ? need / d0 : 1;
  const lx = Math.min(SAFE.r - w / 2, Math.max(SAFE.l + w / 2, at[0] + dx * kx));
  const ly = Math.min(SAFE.b, Math.max(SAFE.t, at[1] + dy * kx));
  const above = ly < at[1];
  // beside the thing: leave from the label's side; otherwise from its top or bottom
  const beside = Math.abs(ly - at[1]) < 40;
  const s = beside ? [lx + (lx < at[0] ? w / 2 + 12 : -w / 2 - 12), ly] : [lx, ly + (above ? 24 : -24)];
  const len0 = Math.hypot(s[0] - at[0], s[1] - at[1]) || 1;
  const u = [(s[0] - at[0]) / len0, (s[1] - at[1]) / len0];
  const e = [at[0] + u[0] * (r + 8), at[1] + u[1] * (r + 8)];
  const len = Math.hypot(s[0] - e[0], s[1] - e[1]);
  return (
    <>
      <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0, opacity: o }}>
        <line x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - line)} />
        <circle cx={e[0]} cy={e[1]} r={5.5 * ramp(f, from + 7, from + 12)} fill={color} />
      </svg>
      <div style={{ position: 'absolute', left: lx, top: ly, transform: `translate(-50%, -50%) translateY(${(1 - label) * (above ? -8 : 8)}px)`, opacity: label * o,
        fontFamily: MONO, fontSize: SIZE, color, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{text}</div>
    </>
  );
};
