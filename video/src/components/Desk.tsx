// The opening's things: folders, files, email cards and a crumpled paper ball.
// Drawn in PLOT's language (flat shapes, the thread colours, Inter and Roboto
// Mono), with enough variety in the folders to feel like a real, messy inbox.
import React from 'react';
import { C } from '../config';
import { MONO, UI } from '../fonts';

export const rnd = (i: number, k = 1) => { const x = Math.sin(i * 127.1 * k + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return `rgb(${c.join(',')})`;
};

const Sheets: React.FC<{ x: number; y: number; w: number; h: number; tilt?: number }> = ({ x, y, w, h, tilt = 0 }) => (
  <g>
    <rect x={x + 6} y={y + 4} width={w} height={h} rx={4} fill="#EDEDED" transform={`rotate(${tilt + 4} ${x + w / 2} ${y + h})`} />
    <rect x={x} y={y} width={w} height={h} rx={4} fill="#FFFFFF" transform={`rotate(${tilt} ${x + w / 2} ${y + h})`} />
    {[0, 1, 2].map(i => <rect key={i} x={x + 8} y={y + 9 + i * 8} width={w * (i === 2 ? 0.45 : 0.7)} height={3.2} rx={1.6} fill="#D9D9D9" transform={`rotate(${tilt} ${x + w / 2} ${y + h})`} />)}
  </g>
);

// Four folder shapes that share one grid (130 × 100), corner radius and palette.
export const Folder: React.FC<{ w: number; color: string; variant: number; label?: string; sub?: string; tabs?: string[] }> = ({ w, color, variant, label, sub, tabs }) => {
  const back = shade(color, -0.22), front = color, ink = variant === 1 || color === C.themes ? '#FFFFFF' : '#000000';
  return (
    <svg width={w} height={w * 100 / 130} viewBox="0 0 130 100" style={{ overflow: 'visible', display: 'block' }}>
      {variant === 1 && tabs ? tabs.map((t, i) => (
        <rect key={i} x={i * 9} y={2 - (tabs.length - i) * 6} width={130 - i * 9} height={40} rx={6} fill={t} />
      )) : null}
      {/* back with its tab */}
      <path d="M0 8a6 6 0 0 1 6-6h34l8 8h76a6 6 0 0 1 6 6v78a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill={variant === 1 ? shade(front, 0.12) : back} />
      {variant !== 1 ? <Sheets x={18} y={variant === 3 ? 4 : 14} w={84} h={60} tilt={variant === 3 ? -7 : -2} /> : null}
      {variant === 3 ? <Sheets x={34} y={0} w={70} h={50} tilt={9} /> : null}
      {/* front panel */}
      {variant === 2
        ? <path d="M0 40a6 6 0 0 1 6-6h46l16-12h56a6 6 0 0 1 6 6v66a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill={front} />
        : variant === 3
          ? <path d="M3 44a6 6 0 0 1 6-6h118a5 5 0 0 1 5 6l-6 50a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6Z" fill={front} />
          : <rect x={0} y={variant === 1 ? 22 : 26} width={130} height={variant === 1 ? 78 : 74} rx={6} fill={front} />}
      {label ? <text x={10} y={sub ? 80 : 88} fontFamily={UI} fontWeight={600} fontSize={11.5} fill={variant === 1 ? (tabs ? tabs[0] : ink) : ink}>{label}</text> : null}
      {sub ? <text x={10} y={91} fontFamily={MONO} fontSize={7} fill={ink} opacity={0.6}>{sub}</text> : null}
    </svg>
  );
};

// A file: white page, folded corner, a thread-colour band and a type chip.
export const Doc: React.FC<{ w: number; color: string; type: string }> = ({ w, color, type }) => (
  <svg width={w} height={w * 1.28} viewBox="0 0 80 102" style={{ overflow: 'visible', display: 'block' }}>
    <path d="M6 0H58L80 22V96a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6Z" fill="#FFFFFF" stroke="#D9D9D9" strokeWidth={1.5} />
    <path d="M58 0V16a6 6 0 0 0 6 6H80Z" fill="#D9D9D9" />
    <rect x={10} y={14} width={34} height={8} rx={4} fill={color} />
    {[0, 1, 2, 3].map(i => <rect key={i} x={10} y={34 + i * 10} width={i === 3 ? 30 : 58} height={4} rx={2} fill="#E4E4E4" />)}
    <rect x={10} y={78} width={30} height={15} rx={4} fill="#000" />
    <text x={25} y={88.6} textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={8} fill="#FFF">{type}</text>
  </svg>
);

// An email, as a card: sender, time, subject, a preview line, sometimes an attachment.
const senderName = (from: string) => {
  const d = (from.split('@')[1] || from).split('.')[0].replace(/[_-]+/g, ' ');
  return d.replace(/\b\w/g, c => c.toUpperCase());
};
const DATE = (d: string) => { const [, m, day] = d.split('-'); return `${+day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}`; };
export const EmailCard: React.FC<{ subject: string; from: string; date: string; dot: string; attach?: boolean; unread?: boolean; w?: number }> = ({ subject, from, date, dot, attach, unread, w = 380 }) => (
  <div style={{ width: w, boxSizing: 'border-box', background: '#FFFFFF', borderRadius: 18, padding: '16px 20px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)', fontFamily: UI, color: '#000' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: dot, flex: 'none' }} />
      <div style={{ fontWeight: unread ? 700 : 600, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{senderName(from)}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(0,0,0,0.45)', flex: 'none' }}>{DATE(date)}</div>
    </div>
    <div style={{ fontWeight: 500, fontSize: 16, marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subject}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <div style={{ height: 7, borderRadius: 4, background: '#E6E6E6', flex: 1 }} />
      {attach ? <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.attach, border: `1.5px solid ${C.attach}`, borderRadius: 6, padding: '1px 7px' }}>PDF</div> : <div style={{ height: 7, width: 70, borderRadius: 4, background: '#E6E6E6' }} />}
    </div>
  </div>
);
