// The app's cursor: a soft grey dot that grows into a label pill on hover (web/js/cursor.js).
import React from 'react';
import { UI } from '../fonts';
import { C } from '../config';

export const Cursor: React.FC<{ x: number; y: number; size: number; label?: string; open?: number; press?: number; opacity?: number; color?: string }> = ({ x, y, size, label, open = 0, press = 0, opacity = 1, color = C.panel }) => {
  const s = 1 - 0.14 * press;
  const fs = 26;
  const textW = label ? label.length * fs * 0.56 + 44 : 0;
  const w = size + (textW - size) * open;
  const h = size + (fs * 1.9 - size) * open;
  return (
    <div style={{ position: 'absolute', left: Math.max(20, Math.min(x - (open ? 8 : w / 2) - (open ? (w - size) * 0.0 : 0), 1060 - w)), top: y - h / 2, width: w, height: h, borderRadius: 999, background: color, opacity,
      transform: `scale(${s})`, transformOrigin: 'left center', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      boxShadow: open ? '0 6px 24px rgba(0,0,0,0.18)' : undefined }}>
      {label ? <span style={{ fontFamily: UI, fontWeight: 600, fontSize: fs, color: '#000', whiteSpace: 'nowrap', opacity: Math.max(0, open * 1.6 - 0.6) }}>{label}</span> : null}
    </div>
  );
};
