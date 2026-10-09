import React from 'react';
import { ICON } from '../icons';
export const Icon: React.FC<{ name: keyof typeof ICON; size: number }> = ({ name, size }) => {
  const ic: any = ICON[name];
  const [, , w, h] = ic.vb.split(' ').map(Number);
  return (
    <svg width={size} height={size * h / w} viewBox={ic.vb} fill="none">
      {(ic.circles || []).map((c: number[], i: number) => <circle key={'c' + i} cx={c[0]} cy={c[1]} r={c[2]} fill="#000" />)}
      {(ic.d || []).map((d: string, i: number) => <path key={'d' + i} d={d} fill="#000" fillRule="evenodd" />)}
      {(ic.stroke || []).map((d: string, i: number) => <path key={'s' + i} d={d} stroke="#000" strokeWidth={0.6} />)}
      {(ic.white || []).map((d: string, i: number) => <path key={'w' + i} d={d} fill="#fff" />)}
    </svg>
  );
};
