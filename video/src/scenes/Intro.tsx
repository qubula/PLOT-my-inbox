// We keep everything → it piles up → it flies at you → the mess is scrunched
// into a paper ball → the ball drops in as PLOT's O, and the camera falls through it.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, C, COPY, INBOX, bars } from '../config';
import { LOGO, UI } from '../fonts';
import { ramp, sp, BOUNCE } from '../anim';
import { Caption } from '../components/Caption';
import { Cursor } from '../components/Pill';
import { Doc, EmailCard, Folder, PaperBall, rnd } from '../components/Desk';

export const I = {
  pileEnd: bars(2), burst: bars(2) + 4, floodEnd: bars(3.5) - 8,
  crumple: bars(3.5), ball: bars(3.5) + 16, dark: bars(4.25), land: bars(4.25) + 18, morph: bars(4.25) + 22,
  click: bars(5.25), through: bars(5.25) + 4, end: bars(6),
};

const BALL = { x: 540, y: 790 };
const LABELS = ['Receipts', 'Newsletters', 'Travel', 'Work', 'Bills', 'Unsorted', 'Photos', 'Old stuff', 'Promotions', 'Family', 'Misc', 'Orders'];
const PALETTE = [...C.threads, C.themes, C.panel];
const N = 40;
const ITEMS = Array.from({ length: N }, (_, i) => {
  const kind = i === 0 ? 'inbox' : i % 5 === 1 ? 'doc' : i % 5 === 3 ? 'card' : 'folder';
  return {
    kind, i,
    x: i === 0 ? 540 : 110 + rnd(i, 1) * 860, y: i === 0 ? 800 : 430 + rnd(i, 2) * 820,
    r: i === 0 ? -3 : (rnd(i, 3) - 0.5) * 34, s: i === 0 ? 250 : kind === 'card' ? 0.62 + rnd(i, 4) * 0.25 : 92 + rnd(i, 4) * 70,
    color: PALETTE[Math.floor(rnd(i, 8) * PALETTE.length)], variant: Math.floor(rnd(i, 9) * 4),
    label: rnd(i, 10) > 0.4 ? LABELS[i % LABELS.length] : undefined,
    at: i === 0 ? 2 : Math.floor(BEAT * (1 + Math.log2(i + 1))) + Math.floor(rnd(i, 6) * 6),
  };
});
const MAIL = INBOX.list;
const FLOOD = Array.from({ length: 84 }, (_, i) => ({
  at: I.burst + i * 0.66, ang: rnd(i, 7) * Math.PI * 2, spin: (rnd(i, 8) - 0.5) * 34,
  m: MAIL[i % MAIL.length], dot: C.threads[i % 7], attach: i % 4 === 2, unread: i % 3 === 0,
}));

const Badge: React.FC<{ n: string }> = ({ n }) => (
  <div style={{ position: 'absolute', right: -22, top: -26, minWidth: 64, height: 64, padding: '0 14px', boxSizing: 'border-box', borderRadius: 32, background: C.attach, color: '#fff', fontFamily: UI, fontWeight: 700, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
);

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const burst = ramp(f, I.burst, I.burst + 30, Easing.in(Easing.cubic));
  // everything still on screen is pulled into the ball
  const pull = ramp(f, I.crumple, I.crumple + 14, Easing.in(Easing.cubic));
  const count = Math.round(interpolate(f, [4, I.pileEnd - 6], [1, 999], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) }));

  // the wordmark: monospaced, centred; its O sits half an advance right of centre
  const FS = 230, ADV = FS * 0.82;
  const OX = 540 + ADV / 2, OY = 800;
  const zr = ramp(f, I.click, I.through + 20, Easing.inOut(Easing.cubic));
  const zoom = Math.pow(80, ramp(f, I.through, I.end, Easing.in(Easing.cubic)));
  const darkR = ramp(f, I.dark, I.dark + 14, Easing.bezier(0.5, 0, 0.2, 1)) * 1700;
  const press = Math.max(0, 1 - Math.abs(f - I.click) / 4);

  // the ball: scrunched (creases re-roll), then a hop into the O
  const form = spring({ frame: f - I.crumple - 4, fps, config: { damping: 9, stiffness: 140, mass: 0.7 } });
  const squeeze = f < I.ball ? 1 + 0.12 * Math.sin((f - I.crumple) * 1.9) * (1 - ramp(f, I.crumple, I.ball)) : 1;
  const seed = f < I.ball ? Math.floor((f - I.crumple) / 2) : Math.floor((I.ball - I.crumple) / 2);
  const hop = ramp(f, I.dark + 2, I.land, Easing.inOut(Easing.quad));
  const bx = BALL.x + (OX - BALL.x) * hop, by = BALL.y + (OY - BALL.y) * hop - Math.sin(hop * Math.PI) * 150;
  const land = Math.max(0, 1 - Math.abs(f - I.land) / 5);
  const ballR = (150 - 58 * hop) * form;
  const morph = ramp(f, I.morph, I.morph + 8);
  const letters = (i: number) => sp(f, fps, I.land - 4 + (i < 2 ? i : i - 1) * 3, BOUNCE);

  return (
    <AbsoluteFill style={{ background: C.light, overflow: 'hidden' }}>
      {/* the pile: folders, files and emails, faster and faster */}
      {f < I.crumple + 16 ? [...ITEMS.slice(1), ITEMS[0]].map(it => {
        const t = spring({ frame: f - it.at, fps, config: BOUNCE });
        if (t <= 0.001) return null;
        const isInbox = it.i === 0;
        const dx = it.x - 540, dy = it.y - 800, d = Math.hypot(dx, dy) || 1;
        const z = isInbox ? 1 : 1 + burst * (2.5 + rnd(it.i, 9) * 3);
        let x = isInbox ? it.x : 540 + (dx / d) * (d + burst * 900), y = isInbox ? it.y : 800 + (dy / d) * (d + burst * 900);
        let op = isInbox ? 1 : 1 - burst;
        let sc = t * z;
        // the inbox shakes while the flood pours out of it
        const shake = isInbox && f > I.burst ? Math.sin(f * 2.3) * 3 * (1 - pull) : 0;
        if (isInbox) { x += (BALL.x - x) * pull; y += (BALL.y - y) * pull; sc *= 1 - pull * 0.9; op *= 1 - pull; }
        if (op <= 0.01) return null;
        return (
          <div key={it.i} style={{ position: 'absolute', left: x, top: y - (1 - t) * 40, transform: `translate(-50%,-50%) rotate(${it.r + burst * it.r + shake}deg) scale(${sc})`, opacity: op }}>
            <div style={{ position: 'relative' }}>
              {it.kind === 'inbox' ? <Folder w={it.s} color={C.themes} variant={1} tabs={[C.threads[0], C.threads[1], C.threads[2]]} label="Inbox" sub="all mail" />
                : it.kind === 'doc' ? <Doc w={it.s * 0.62} color={it.color === C.panel || it.color === C.themes ? C.threads[0] : it.color} type={['PDF', 'DOCX', 'XLS', 'JPG'][it.i % 4]} />
                  : it.kind === 'card' ? <div style={{ transform: `scale(${it.s})` }}><EmailCard subject={MAIL[it.i % MAIL.length].s} from={MAIL[it.i % MAIL.length].from} date={MAIL[it.i % MAIL.length].d} dot={C.threads[it.i % 7]} w={340} /></div>
                    : <Folder w={it.s} color={it.color} variant={it.variant} label={it.s > 120 ? it.label : undefined} />}
              {isInbox ? <Badge n={count >= 999 ? '999+' : String(count)} /> : null}
            </div>
          </div>
        );
      }) : null}

      {/* the flood: emails fly out of the inbox at the camera */}
      {f >= I.burst && f < I.crumple + 16 ? FLOOD.map((c, i) => {
        if (c.at > I.floodEnd) return null;
        const t = ramp(f, c.at, c.at + 32, Easing.in(Easing.quad));
        if (t <= 0 || t >= 1) return null;
        let z = 0.12 + t * 2.6, dist = 30 + t * 1050;
        let x = 540 + Math.cos(c.ang) * dist, y = 800 + Math.sin(c.ang) * dist * 0.85;
        x += (BALL.x - x) * pull; y += (BALL.y - y) * pull; z *= 1 - pull * 0.92;
        const op = Math.min(1, t * 5) * (1 - ramp(t, 0.8, 1, Easing.linear)) * (1 - pull);
        if (op <= 0.01) return null;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) rotate(${c.spin * t}deg) scale(${z})`, opacity: op }}>
          <EmailCard subject={c.m.s} from={c.m.from} date={c.m.d} dot={c.dot} attach={c.attach} unread={c.unread} />
        </div>;
      }) : null}

      {/* keep the headline readable while the flood passes under it */}
      {f >= I.pileEnd - 8 && f < I.crumple + 8 ? <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 400,
        background: `linear-gradient(${C.light} 60%, ${C.light}00)`, opacity: ramp(f, I.pileEnd - 8, I.pileEnd) * (1 - ramp(f, I.crumple, I.crumple + 8)) }} /> : null}

      {/* dark opens from the ball */}
      {f >= I.dark ? <svg width={1080} height={1350} style={{ position: 'absolute', inset: 0 }}><circle cx={BALL.x} cy={BALL.y} r={darkR} fill={C.themes} /></svg> : null}

      {/* PLOT, with the ball as its O; then fall through the O */}
      {f >= I.dark ? (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-(ADV / 2) * zr}px) scale(${zoom})`, transformOrigin: `${OX}px ${OY}px` }}>
          {'PLOT'.split('').map((ch, i) => {
            const isO = i === 2;
            const t = isO ? morph : letters(i);
            if (t <= 0.001) return null;
            return <div key={i} style={{ position: 'absolute', left: OX + (i - 2) * ADV - ADV / 2, top: OY - FS * 0.5, width: ADV, textAlign: 'center', fontFamily: LOGO, fontSize: FS, lineHeight: 1, color: '#fff',
              transform: isO ? `scale(${(0.7 + 0.3 * t) * (1 - 0.06 * press)})` : `translateY(${(1 - t) * 50}px) scale(${0.6 + 0.4 * t})`, opacity: Math.min(1, t * 1.4) }}>{ch}</div>;
          })}
        </div>
      ) : null}
      {f >= I.crumple && morph < 1 ? (
        <div style={{ position: 'absolute', left: bx, top: by, transform: `translate(-50%,-50%) rotate(${(f - I.crumple) * 2.2}deg) scale(${squeeze * (1 + 0.18 * land) * (1 - morph)}, ${(1 / squeeze) * (1 - 0.18 * land) * (1 - morph)})` }}>
          <PaperBall R={Math.max(1, ballR)} seed={7 + seed} />
        </div>
      ) : null}

      {f >= I.morph && f < I.through + 4 ? (() => {
        const cm = sp(f, fps, I.morph, { damping: 26, stiffness: 90, mass: 1 });
        return <Cursor x={900 + (OX - (ADV / 2) * zr - 900) * cm} y={1250 + (OY + FS * 0.02 - 1250) * cm} size={40} press={press} opacity={1 - ramp(f, I.through, I.through + 4)} />;
      })() : null}

      <Caption text={COPY.keep} delay={4} out={I.pileEnd - 6} />
      <Caption text={COPY.read} delay={I.pileEnd} out={I.crumple - 4} />
    </AbsoluteFill>
  );
};
