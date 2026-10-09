// The real interface, from screenshots of the running app (public/ui, see
// scripts/capture-ui.mjs), in two shots: click an email in the Cluster to
// open it (UiOpen), then highlight a line in read mode (UiRead).
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../config';
import { ramp, sp } from '../anim';
import { Cursor } from '../components/Pill';

export const UI = { click: 40, swap: 42, zoom: 56, mark: 30 };

// Screenshots are 1440 × 900 CSS px (saved at 2x). A camera says which CSS point
// sits at the frame's centre (540, 675) and how many frame px one CSS px takes.
type Cam = { cx: number; cy: number; k: number };
const FIT: Cam = { cx: 720, cy: 450, k: 1000 / 1440 };
const PANEL: Cam = { cx: 1268, cy: 200, k: 2.7 };          // the reading panel on the right
const LINE0: Cam = { cx: 556, cy: 170, k: 1.75 }, LINE: Cam = { cx: 527, cy: 170, k: 1.9 }; // read mode, the first lines
const NODE = { x: 790, y: 441 };                            // the email that gets opened
const MARK = { x0: 383, x1: 673, y0: 153, y1: 171 };        // the highlighted phrase

const mix = (a: Cam, b: Cam, t: number): Cam => {
  const k = a.k * Math.pow(b.k / a.k, t);
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, k };
};
const toScreen = (c: Cam, x: number, y: number) => [540 + (x - c.cx) * c.k, 675 + (y - c.cy) * c.k];

const Shot: React.FC<{ src: string; cam: Cam; opacity?: number; clip?: [number, number, number, number] }> = ({ src, cam, opacity = 1, clip }) => {
  const [x, y] = toScreen(cam, 0, 0);
  const style: React.CSSProperties = { position: 'absolute', left: x, top: y, width: 1440 * cam.k, height: 900 * cam.k, opacity };
  if (clip) { const [x0, y0, x1, y1] = clip; style.clipPath = `inset(${y0 * cam.k}px ${(1440 - x1) * cam.k}px ${(900 - y1) * cam.k}px ${x0 * cam.k}px)`; }
  return <Img src={staticFile(src)} style={style} />;
};

export const UiOpen: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = sp(f, fps, 0, { damping: 22, stiffness: 120, mass: 1 });
  const cam = mix(FIT, PANEL, ramp(f, UI.zoom, UI.zoom + 30, Easing.bezier(0.65, 0, 0.35, 1)));
  const swap = ramp(f, UI.swap, UI.swap + 5);
  const frame = 1 - ramp(f, UI.zoom, UI.zoom + 16);   // the window outline, only while the whole screen shows
  const [wx, wy] = toScreen(FIT, 0, 0);
  const [nx, ny] = toScreen(FIT, NODE.x, NODE.y);
  const m = sp(f, fps, 6, { damping: 26, stiffness: 90, mass: 1 });
  const press = Math.max(0, 1 - Math.abs(f - UI.click) / 4);
  return (
    <AbsoluteFill style={{ background: C.light }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${0.94 + 0.06 * enter})`, transformOrigin: '540px 675px' }}>
        <Shot src="ui/cluster.png" cam={cam} />
        <Shot src="ui/email.png" cam={cam} opacity={swap} />
        <div style={{ position: 'absolute', left: wx - 2, top: wy - 2, width: 1000 + 4, height: 625 + 4, borderRadius: 16, boxShadow: `0 0 0 2px rgba(0,0,0,${0.12 * frame}), 0 24px 60px rgba(0,0,0,${0.12 * frame})`, pointerEvents: 'none' }} />
        {f < UI.zoom ? <Cursor x={900 + (nx - 900) * m} y={1180 + (ny - 1180) * m} size={18} color="#818181" press={press} opacity={1 - ramp(f, UI.zoom - 6, UI.zoom)} /> : null}
      </div>
    </AbsoluteFill>
  );
};

export const UiRead: React.FC = () => {
  const f = useCurrentFrame();
  const cam = mix(LINE0, LINE, ramp(f, 0, 40, Easing.bezier(0.65, 0, 0.35, 1)));
  const mark = ramp(f, UI.mark, UI.mark + 14, Easing.inOut(Easing.quad));
  return (
    <AbsoluteFill style={{ background: '#383838' }}>
      <Shot src="ui/read.png" cam={cam} />
      {/* the lines run on past the right edge: let them fade out instead of stopping hard */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 200, background: 'linear-gradient(90deg, rgba(56,56,56,0), #383838)', zIndex: 2 }} />
      {mark > 0 ? <Shot src="ui/highlight.png" cam={cam} clip={[MARK.x0 - 2, MARK.y0 - 2, MARK.x0 + (MARK.x1 - MARK.x0 + 4) * mark, MARK.y1 + 2]} /> : null}
    </AbsoluteFill>
  );
};
