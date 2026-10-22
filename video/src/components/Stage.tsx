// The scenes are drawn on a 1080 × 1350 (4:5) stage. In other formats the stage
// is scaled to fit and centred, and the scene's background fills the whole frame.
// In 4:5 this is a no-op (scale 1, no offset).
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

export const STAGE = { w: 1080, h: 1350 };
export const useStage = () => {
  const { width, height } = useVideoConfig();
  const s = Math.min(width / STAGE.w, height / STAGE.h);
  const x0 = (width - STAGE.w * s) / 2, y0 = (height - STAGE.h * s) / 2;
  // the part of the frame you can see, in stage coordinates
  return { s, x0, y0, vx0: -x0 / s, vw: width / s, vy0: -y0 / s, vh: height / s, wide: width > height };
};

type Props = { bg: string; style?: React.CSSProperties; overlay?: React.ReactNode; children?: React.ReactNode };
export const Scene: React.FC<Props> = ({ bg, style, overlay, children }) => {
  const { s, x0, y0 } = useStage();
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', left: x0, top: y0, width: STAGE.w, height: STAGE.h, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
      {overlay}
    </AbsoluteFill>
  );
};
