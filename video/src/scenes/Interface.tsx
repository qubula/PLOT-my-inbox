// The real interface, from screenshots of the running app (public/ui, see
// scripts/capture-ui.mjs), in two shots: click an email in the Cluster to
// open it (UiOpen), then highlight a line in read mode (UiRead).
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../config';
import { UI as UI_FONT } from '../fonts';
import { ramp, sp } from '../anim';
import { Cursor } from '../components/Pill';

export const UI = { click: 40, swap: 42, zoom: 56, mark: 30 };

// Screenshots are 1440 × 900 CSS px (saved at 2x). A camera says which CSS point
// sits at the frame's centre and how many frame px one CSS px takes. These shots
// are laid out for the frame itself (no stage), so on a wide frame they fill it.
type Cam = { cx: number; cy: number; k: number };
const fit = (W: number, H: number): Cam => ({ cx: 720, cy: 450, k: Math.min(W * 0.926 / 1440, H * 0.82 / 900) });
const PANEL: Cam = { cx: 1268, cy: 200, k: 2.7 };          // the reading panel on the right
// read mode: the first lines. If the whole lines fit the frame they are centred;
// otherwise their left edge sits 60 px in from the frame's edge and they run off the right
const TEXT = { x0: 274, x1: 1180 };
const line = (W: number, k: number): Cam => ({ cx: (TEXT.x1 - TEXT.x0 + 40) * k < W - 120 ? (TEXT.x0 + TEXT.x1) / 2 : TEXT.x0 + (W / 2 - 60) / k, cy: 170, k });
const NODE = { x: 790, y: 441 };                            // the email that gets opened
const MARK = { x0: 383, x1: 673, y0: 153, y1: 171 };        // the highlighted phrase

const mix = (a: Cam, b: Cam, t: number): Cam => {
  const k = a.k * Math.pow(b.k / a.k, t);
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, k };
};
let FW = 1080, FH = 1350;   // the frame, set by each shot before it draws
const toScreen = (c: Cam, x: number, y: number) => [FW / 2 + (x - c.cx) * c.k, FH / 2 + (y - c.cy) * c.k];

const Shot: React.FC<{ src: string; cam: Cam; opacity?: number; clip?: [number, number, number, number] }> = ({ src, cam, opacity = 1, clip }) => {
  const [x, y] = toScreen(cam, 0, 0);
  const style: React.CSSProperties = { position: 'absolute', left: x, top: y, width: 1440 * cam.k, height: 900 * cam.k, opacity };
  if (clip) { const [x0, y0, x1, y1] = clip; style.clipPath = `inset(${y0 * cam.k}px ${(1440 - x1) * cam.k}px ${(900 - y1) * cam.k}px ${x0 * cam.k}px)`; }
  return <Img src={staticFile(src)} style={style} />;
};

export const UiOpen: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  FW = width; FH = height;
  const FIT = fit(width, height);
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
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${0.94 + 0.06 * enter})`, transformOrigin: `${width / 2}px ${height / 2}px` }}>
        <Shot src="ui/cluster.png" cam={cam} />
        <Shot src="ui/email.png" cam={cam} opacity={swap} />
        <div style={{ position: 'absolute', left: wx - 2, top: wy - 2, width: 1440 * FIT.k + 4, height: 900 * FIT.k + 4, borderRadius: 16, boxShadow: `0 0 0 2px rgba(0,0,0,${0.12 * frame}), 0 24px 60px rgba(0,0,0,${0.12 * frame})`, pointerEvents: 'none' }} />
        {f < UI.zoom ? <Cursor x={width * 0.83 + (nx - width * 0.83) * m} y={height * 0.87 + (ny - height * 0.87) * m} size={18} color="#818181" press={press} opacity={1 - ramp(f, UI.zoom - 6, UI.zoom)} /> : null}
      </div>
    </AbsoluteFill>
  );
};

export const UiRead: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  FW = width; FH = height;
  const cam = mix(line(width, 1.75), line(width, 1.9), ramp(f, 0, 40, Easing.bezier(0.65, 0, 0.35, 1)));
  const cut = toScreen(cam, TEXT.x1, 0)[0] > width;   // do the lines run past the right edge?
  const mark = ramp(f, UI.mark, UI.mark + 14, Easing.inOut(Easing.quad));
  return (
    <AbsoluteFill style={{ background: '#383838' }}>
      <Shot src="ui/read.png" cam={cam} />
      {/* the lines run on past the right edge: let them fade out instead of stopping hard */}
      {cut ? <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 200, background: 'linear-gradient(90deg, rgba(56,56,56,0), #383838)', zIndex: 2 }} /> : null}
      {mark > 0 ? <Shot src="ui/highlight.png" cam={cam} clip={[MARK.x0 - 2, MARK.y0 - 2, MARK.x0 + (MARK.x1 - MARK.x0 + 4) * mark, MARK.y1 + 2]} /> : null}
      {/* named while it happens, in the text cards' style, instead of a card of its own */}
      {f >= UI.mark - 2 ? (() => {
        const k = f - (UI.mark - 2);
        const slam = 1 + 0.9 * (1 - Easing.out(Easing.exp)(Math.min(1, k / 6)));
        const block = sp(f, fps, UI.mark + 2, { damping: 12, stiffness: 170, mass: 0.7 });
        return <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.77, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: -18, right: -18, top: 2, bottom: -4, background: '#F9FF8D', borderRadius: 10, transform: `rotate(${-9 + 7 * block}deg) scale(${block})` }} />
            <span style={{ position: 'relative', display: 'inline-block', fontFamily: UI_FONT, fontWeight: 600, fontSize: 76 * Math.min(1, height / 1350 * 1.15), letterSpacing: '-0.045em', lineHeight: 1, color: '#000', transform: `scale(${slam})` }}>Highlight what matters.</span>
          </div>
        </div>;
      })() : null}
    </AbsoluteFill>
  );
};
