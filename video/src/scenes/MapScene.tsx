// One continuous shot: an inbox list collapses into dots, the dots become the
// four Themes, and the camera dives Theme → Space → Cluster → emails.
// All positions, sizes, ages and thread colours are the app's own
// (src/generated/cluster.json is read from the running app; see README).
import React from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, C, CLUSTER, INBOX, segDur } from '../config';
import { Callout } from '../components/Callout';
import { MONO, UI } from '../fonts';
import { ramp, sp, BOUNCE } from '../anim';
import { Cursor } from '../components/Pill';
import { EmailNode } from '../components/EmailNode';
import { map, sizeScale } from '../geom';

const b = (n: number) => Math.round(n * BEAT);
const step = (click: number) => ({ zoom: click + 6, end: click + 46, note: click + 44, cur: click + 46, open: click + 56 });
const C1 = b(5), C2 = b(10), C3 = b(15);
export const T = {
  themeIn: 0, note1: 14,
  cur1: 26, open1: 42, click1: C1, zoom1: step(C1).zoom, zoom1End: step(C1).end,
  note2: step(C1).note, cur2: step(C1).cur, open2: step(C1).open, click2: C2, zoom2: step(C2).zoom, zoom2End: step(C2).end,
  note3: step(C2).note, cur3: step(C2).cur, open3: step(C2).open, click3: C3, zoom3: step(C3).zoom, zoom3End: C3 + 52,
  emailsFly: C3 + 30, colour: C3 + 56, note4: C3 + 72, end: segDur('map'),
};

// ---- geometry, in one world (units = app pixels at the Themes level) ----
const SC = { x: 540, y: 850 };
const TR = 156.5;                              // Theme ring radius, as in the app's picker
const TPOS = [[0, -228.5], [228.5, 0], [0, 228.5], [-228.5, 0]]; // ids 0..3 clockwise from the top
const themes = INBOX.themeList;
const TARGET_THEME = 2;                        // Billing & Promotions
const B = TPOS[TARGET_THEME];
const spaces = (CLUSTER.macros as any[]);
const spaceR = (s: number) => map(s, 0, 1, 9, 90);
const E1 = Math.max(...spaces.map(m => Math.hypot(m.x, m.y) + spaceR(m.size)));
const k1 = 128 / E1;
const sp1 = spaces.map(m => ({ ...m, wx: B[0] + m.x * k1, wy: B[1] + m.y * k1, R: spaceR(m.size) * k1 }));
const tSpace = sp1.find(m => m.title === CLUSTER.macroTitle)!;
const clR = (s: number) => map(s, 0, 1, 3, 60);
const subs = tSpace.subs as any[];
const E2 = Math.max(...subs.map(s => Math.hypot(s.rx, s.ry) + clR(s.size)));
const k2 = (tSpace.R * 1.9) / E2;
const cl = subs.map(s => ({ ...s, wx: tSpace.wx + s.rx * k2, wy: tSpace.wy + s.ry * k2, R: clR(s.size) * k2 }));
const tCl = cl.find(s => s.title === CLUSTER.subTitle)!;
const nodes = (CLUSTER.nodes as any[]).map(n => ({ ...n, wx: tCl.wx + n.x * k2, wy: tCl.wy + n.y * k2, R: 7 * sizeScale(n.kb) * k2 }));
const ringsR = [...new Set(nodes.filter(n => n.ring >= 0).map(n => Math.round(Math.hypot(n.x, n.y) * 10) / 10))];
const Z0 = 430 / (228.5 + TR);
const Z1 = 430 / 128;
const Z2 = 430 / (tSpace.R * 1.9);
const Z3 = 400 / ((Math.max(...nodes.map(n => Math.hypot(n.x, n.y))) + 14) * k2);
export const LAYOUT = { nodes, tCl, k2, Z3, SC, ringsR };

// Smooth zoom between two views: the world shrinks into place without swinging.
const KEYS = [
  { f: 0, c: [0, 0], z: Z0 },
  { f: T.zoom1, c: [0, 0], z: Z0 }, { f: T.zoom1End, c: B, z: Z1 },
  { f: T.zoom2, c: B, z: Z1 }, { f: T.zoom2End, c: [tSpace.wx, tSpace.wy], z: Z2 },
  { f: T.zoom3, c: [tSpace.wx, tSpace.wy], z: Z2 }, { f: T.zoom3End, c: [tCl.wx, tCl.wy], z: Z3 },
];
const ease = Easing.bezier(0.65, 0, 0.35, 1);
const cam = (f: number) => {
  let a = KEYS[0], b = KEYS[0];
  for (let i = 0; i < KEYS.length - 1; i++) if (f >= KEYS[i].f) { a = KEYS[i]; b = KEYS[i + 1]; }
  if (f >= KEYS[KEYS.length - 1].f) return { c: KEYS[KEYS.length - 1].c, z: KEYS[KEYS.length - 1].z };
  const t = ease(Math.min(1, Math.max(0, (f - a.f) / Math.max(1, b.f - a.f))));
  const z = a.z * Math.pow(b.z / a.z, t);
  const w = a.z === b.z ? t : (1 / z - 1 / b.z) / (1 / a.z - 1 / b.z);
  return { c: [b.c[0] + (a.c[0] - b.c[0]) * w, b.c[1] + (a.c[1] - b.c[1]) * w], z };
};
const proj = (c: { c: number[]; z: number }, x: number, y: number) => [SC.x + (x - c.c[0]) * c.z, SC.y + (y - c.c[1]) * c.z];

const Group: React.FC<{ x: number; y: number; R: number; solid: number; fill: string; ring: string; fo?: number; ro?: number; w?: number; scale?: number }> = ({ x, y, R, solid, fill, ring, fo = 1, ro = 1, w = 1.5, scale = 1 }) => {
  const r = R * scale;
  return (<g>
    <circle cx={x} cy={y} r={r * solid} fill={fill} fillOpacity={fo} />
    <circle cx={x} cy={y} r={r} fill="none" stroke={ring} strokeOpacity={ro} strokeWidth={w} strokeDasharray={`${0.18 * r} ${0.08 * r}`} />
  </g>);
};

export const MapScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cm = cam(f);
  const P = (x: number, y: number) => proj(cm, x, y);

  const toSpaces = ramp(f, T.zoom1 + 8, T.zoom1End - 4);
  const darkBg = interpolateColors(toSpaces, [0, 1], [C.themes, C.spaces]);
  const lightT = ramp(f, T.zoom2 + 2, T.zoom2 + 30, Easing.bezier(0.5, 0, 0.2, 1));
  const lightR = lightT * 2000;

  // themes burst out of the centre (we just fell through the O)
  const themeEls = TPOS.map(([x, y], i) => {
    const s = sp(f, fps, T.themeIn + i * 3, BOUNCE);
    if (s <= 0.001) return null;
    const isT = i === TARGET_THEME;
    const op = isT ? 1 - ramp(f, T.zoom1 + 14, T.zoom1 + 34) : 1 - ramp(f, T.zoom1, T.zoom1 + 14);
    if (op <= 0) return null;
    const [tx, ty] = P(x, y);
    const sx = SC.x + (tx - SC.x) * s, sy = SC.y + (ty - SC.y) * s;
    const hov = isT ? ramp(f, T.open1, T.open1 + 8) : 0;
    return <g key={i} opacity={op}><Group x={sx} y={sy} R={TR * cm.z} scale={s} solid={0.10 + themes[i].age * 0.75} fill="#FFFFFF" fo={0.85 + 0.15 * hov} ring="#FFFFFF" ro={0.55 + 0.3 * hov} /></g>;
  });
  const spaceEls = f >= T.zoom1 + 2 ? sp1.map((m, i) => {
    const s = sp(f, fps, T.zoom1 + 4 + i * 3, BOUNCE);
    const isT = m === tSpace;
    const op = isT ? 1 : 1 - 0.88 * ramp(f, T.zoom2, T.zoom2 + 16);
    const [sx, sy] = P(m.wx, m.wy);
    return <g key={i} opacity={op}><Group x={sx} y={sy} R={m.R * cm.z} scale={s} solid={map(m.age, 0, 1, 0.10, 0.85)} fill={C.space} ring={C.space} w={1.5} /></g>;
  }) : null;
  const clEls = f >= T.zoom2 + 2 ? cl.map((s, i) => {
    const k = sp(f, fps, T.zoom2 + 8 + i * 1.6, BOUNCE);
    const isT = s === tCl;
    const op = isT ? 1 : 1 - 0.82 * ramp(f, T.zoom3, T.zoom3 + 16);
    const [sx, sy] = P(s.wx, s.wy);
    return <g key={s.id} opacity={op}><Group x={sx} y={sy} R={s.R * cm.z} scale={k} solid={map(s.age, 0, 1, 0.10, 0.85)} fill={C.cluster} ring={C.cluster} w={1} /></g>;
  }) : null;
  const [ccx, ccy] = P(tCl.wx, tCl.wy);
  const ringOp = ramp(f, T.zoom3 + 20, T.zoom3 + 40);
  const emailEls = f >= T.emailsFly ? nodes.map((n, i) => {
    const t = spring({ frame: f - T.emailsFly - i * 1.6, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
    if (t <= 0.001) return null;
    const [tx, ty] = P(n.wx, n.wy);
    const x = ccx + (tx - ccx) * t, y = ccy + (ty - ccy) * t;
    const order = n.ring < 0 ? 0 : (n.ring + 1) * 10 + (Math.atan2(n.y, n.x) + Math.PI) * 2;
    const col = n.color ? interpolateColors(ramp(f, T.colour + order, T.colour + order + 10), [0, 1], ['#000000', n.color]) : '#000000';
    return <EmailNode key={n.id} x={x} y={y} R={n.R * cm.z * Math.min(1, t * 1.1)} age={n.age} seed={n.seed} color={col} />;
  }) : null;

  // cursor: dot → label pill → click
  const steps = [
    { from: T.cur1, open: T.open1, click: T.click1, zoom: T.zoom1, size: 40, label: themes[TARGET_THEME].title, tgt: () => proj({ c: [0, 0], z: Z0 }, B[0], B[1]) },
    { from: T.cur2, open: T.open2, click: T.click2, zoom: T.zoom2, size: 31, label: tSpace.title, tgt: () => proj({ c: B, z: Z1 }, tSpace.wx, tSpace.wy) },
    { from: T.cur3, open: T.open3, click: T.click3, zoom: T.zoom3, size: 24, label: tCl.title, tgt: () => proj({ c: [tSpace.wx, tSpace.wy], z: Z2 }, tCl.wx, tCl.wy) },
  ];
  const st = [...steps].reverse().find(s => f >= s.from);
  const cursor = st && f <= st.zoom + 10 ? (() => {
    const [tx, ty] = st.tgt();
    const m = sp(f, fps, st.from, { damping: 26, stiffness: 90, mass: 1 });
    const open = sp(f, fps, st.open, { damping: 18, stiffness: 140, mass: 0.8 }) * (1 - ramp(f, st.zoom, st.zoom + 6));
    const press = Math.max(0, 1 - Math.abs(f - st.click) / 4);
    return <Cursor x={880 + (tx - 880) * m} y={1270 + (ty - 1270) * m} size={st.size} label={st.label} open={open} press={press} opacity={(m > 0.02 ? 1 : 0) * (1 - ramp(f, st.zoom + 2, st.zoom + 10))} />;
  })() : null;

  // labels, placed at each level's resting camera
  const v1 = (x: number, y: number) => proj({ c: [0, 0], z: Z0 }, x, y) as [number, number];
  const v2 = (x: number, y: number) => proj({ c: B, z: Z1 }, x, y) as [number, number];
  const v3 = (x: number, y: number) => proj({ c: [tSpace.wx, tSpace.wy], z: Z2 }, x, y) as [number, number];
  const v4 = (x: number, y: number) => proj({ c: [tCl.wx, tCl.wy], z: Z3 }, x, y) as [number, number];
  const sp0 = sp1.filter(m => m !== tSpace)[0];
  // label the leftmost cluster, from above: clear of the cursor, which is over the target cluster
  const cl0 = cl.filter(s => s !== tCl).reduce((a, b) => (b.wx < a.wx ? b : a));
  // the leftmost email of the pink thread, labelled from outside the rings; the lowest lone email, from below
  const pink = nodes.filter(n => n.color === '#FF9FD4').reduce((a, b) => (b.wx < a.wx ? b : a));
  const flo = nodes.filter(n => n.ring < 0).reduce((a, b) => (b.wy > a.wy ? b : a));
  const notes = (
    <>
      <Callout at={v1(TPOS[1][0], TPOS[1][1])} r={TR * Z0} dx={60} dy={-270} text="a Theme" from={T.note1} out={T.zoom1 - 4} color="#FFFFFF" />
      <Callout at={v2(sp0.wx, sp0.wy)} r={sp0.R * Z1} dx={0} dy={-190} text="a Space" from={T.note2} out={T.zoom2 - 4} color="#FFFFFF" />
      <Callout at={v3(cl0.wx, cl0.wy)} r={cl0.R * Z2} dx={190} dy={-20} text="a Cluster" from={T.note3} out={T.zoom3 - 4} />
      <Callout at={v4(pink.wx, pink.wy)} r={pink.R * Z3} dx={-70} dy={210} text="a thread" from={T.note4} />
      <Callout at={v4(flo.wx, flo.wy)} r={flo.R * Z3} dx={60} dy={190} text="on its own" from={T.note4 + 8} />
    </>
  );

  // which level we are looking at, named at the top with the path to it (as the app does)
  const LEVELS = [
    { from: 0, title: 'Themes', path: 'Your whole inbox' },
    { from: T.zoom1 + 22, title: 'Spaces', path: themes[TARGET_THEME].title },
    { from: T.zoom2 + 22, title: 'Clusters', path: `${themes[TARGET_THEME].title} / ${tSpace.title}` },
    { from: T.zoom3 + 26, title: 'Emails', path: tCl.title },
  ];
  const li = LEVELS.reduce((a, l, i) => (f >= l.from ? i : a), 0);
  const lv = LEVELS[li];
  const ink = li >= 2 ? '#000000' : '#FFFFFF';
  const k = f - lv.from;
  const slam = 1 + 0.6 * (1 - Easing.out(Easing.exp)(Math.min(1, Math.max(0, k) / 6)));
  const pathIn = ramp(f, lv.from + 4, lv.from + 12);
  const leave = li < 3 ? ramp(f, LEVELS[li + 1].from - 26, LEVELS[li + 1].from - 20) : 0;
  const header = (
    <div style={{ position: 'absolute', left: 60, right: 60, top: 96, textAlign: 'center', color: ink, opacity: 1 - leave }}>
      <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 76, letterSpacing: '-0.04em', lineHeight: 1, transform: `scale(${slam})`, opacity: Math.min(1, Math.max(0, k + 1)) }}>{lv.title}</div>
      <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 24, opacity: 0.6 * pathIn, transform: `translateY(${(1 - pathIn) * 10}px)` }}>{lv.path}</div>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: lightT >= 1 ? C.light : darkBg }}>
      <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}>
        {f >= T.zoom2 + 2 ? (() => { const [lx, ly] = P(tSpace.wx, tSpace.wy); return <circle cx={lx} cy={ly} r={lightR} fill={C.light} />; })() : null}
        {themeEls}
        {spaceEls}
        {clEls}
        {f >= T.zoom3 + 16 ? ringsR.map((r, i) => <circle key={i} cx={ccx} cy={ccy} r={r * k2 * cm.z} fill="none" stroke="#C8C8C8" strokeWidth={1} opacity={ringOp} />) : null}
        {emailEls}
      </svg>
      {notes}
      {cursor}
      {header}
    </AbsoluteFill>
  );
};
