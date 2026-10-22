// One email, drawn as the app draws it (web/js/emailNode.js).
import React from 'react';
import { blob, haloAlpha } from '../geom';
import { C } from '../config';

type P = { x: number; y: number; R: number; age: number; seed: number; color?: string | null; att?: boolean; sel?: number; opacity?: number; points?: number; haloOn?: number };
export const EmailNode: React.FC<P> = ({ x, y, R, age, seed, color, att, sel = 0, opacity = 1, points, haloOn = 1 }) => {
  const r = R * (1 + 0.3 * sel);
  const fill = color || C.ink;
  const solid = age >= 0.95 && points === undefined;
  return (
    <g opacity={opacity}>
      {!solid ? <circle cx={x} cy={y} r={r} fill="#D7D7D7" fillOpacity={haloAlpha(age) * haloOn} stroke="#A0A0A0" strokeOpacity={haloOn} strokeWidth={Math.max(0.6, r * 0.035)} strokeDasharray={`${Math.max(1, r * 0.14)} ${Math.max(1, r * 0.14)}`} /> : null}
      {solid ? <circle cx={x} cy={y} r={r} fill={fill} /> : <path d={blob(x, y, r, Math.min(age, 0.949), seed, points)} fill={fill} />}
      {att ? <circle cx={x + Math.cos(Math.PI / 4) * r} cy={y + Math.sin(Math.PI / 4) * r} r={Math.max(2, r * 0.32)} fill={C.attach} /> : null}
    </g>
  );
};
