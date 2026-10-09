// We keep everything → emails land on top of each other, faster and faster,
// until they cover the screen → they all drop away and PLOT is underneath →
// the camera dives through its O into the map.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEATS, C, COPY, INBOX, REVEAL } from '../config';
import { LOGO, UI } from '../fonts';
import { ramp, sp, BOUNCE } from '../anim';
import { Caption } from '../components/Caption';
import { Doc, EmailCard, Folder, rnd } from '../components/Desk';

export const I = {
  pileEnd: 82, deal: 86, full: REVEAL - 12, drop: REVEAL, dive: BEATS.intro - 28, end: BEATS.intro,
};

// ---- the pile: folders, files and a few emails, arriving faster and faster ----
const LABELS = ['Receipts', 'Newsletters', 'Travel', 'Work', 'Bills', 'Unsorted', 'Photos', 'Old stuff', 'Promotions', 'Family', 'Misc', 'Orders'];
const PALETTE = [...C.threads, C.themes, C.panel];
const N = 34;
export const PILE = Array.from({ length: N }, (_, i) => {
  const kind = i === 0 ? 'inbox' : i % 5 === 1 ? 'doc' : i % 5 === 3 ? 'card' : 'folder';
  return {
    kind, i,
    x: i === 0 ? 540 : 110 + rnd(i, 1) * 860, y: i === 0 ? 800 : 430 + rnd(i, 2) * 820,
    r: i === 0 ? -3 : (rnd(i, 3) - 0.5) * 34, s: i === 0 ? 250 : kind === 'card' ? 0.62 + rnd(i, 4) * 0.25 : 92 + rnd(i, 4) * 70,
    color: PALETTE[Math.floor(rnd(i, 8) * PALETTE.length)], variant: Math.floor(rnd(i, 9) * 4),
    label: rnd(i, 10) > 0.4 ? LABELS[i % LABELS.length] : undefined,
    at: i === 0 ? 2 : Math.round(8 + 68 * Math.sqrt(i / N)),
  };
});

// ---- the deal: email cards slapped onto the screen like a deck of cards ----
// one, two, three on the beat, then each gap is shorter than the last.
const MAIL = INBOX.list;
const DEAL_TIMES = (() => {
  const t: number[] = [I.deal, I.deal + 13, I.deal + 24];
  let gap = 9;
  while (t[t.length - 1] < I.full - 2) { t.push(t[t.length - 1] + gap); gap = Math.max(0.45, gap * 0.84); }
  return t;
})();
// a shuffled grid, twice over, so the cards end up covering the whole frame
const CELLS = (() => {
  const out: [number, number][] = [];
  for (let pass = 0; pass < 2; pass++) for (let r = 0; r < 11; r++) for (let c = 0; c < 3; c++) out.push([150 + c * 390 + (pass ? 195 : 0) + (rnd(r * 3 + c + pass * 50, 21) - 0.5) * 90, 60 + r * 125 + (pass ? 62 : 0) + (rnd(r * 3 + c + pass * 50, 22) - 0.5) * 50]);
  return out.map((p, i) => ({ p, k: rnd(i, 23) })).sort((a, b) => a.k - b.k).map(o => o.p);
})();
export const CARDS = DEAL_TIMES.map((at, i) => {
  const [x, y] = i < 3 ? [[540, 760], [430, 900], [650, 640]][i] : CELLS[(i - 3) % CELLS.length];
  return { at: Math.round(at), x, y, r: (rnd(i, 24) - 0.5) * 22, w: 430 + rnd(i, 25) * 80, m: MAIL[i % MAIL.length], dot: C.threads[i % 7], attach: i % 4 === 2, unread: i % 3 === 0,
    fall: rnd(i, 26) * 6, spin: (rnd(i, 27) - 0.5) * 70, drift: (rnd(i, 28) - 0.5) * 260 };
});

const Badge: React.FC<{ n: string }> = ({ n }) => (
  <div style={{ position: 'absolute', right: -22, top: -26, minWidth: 64, height: 64, padding: '0 14px', boxSizing: 'border-box', borderRadius: 32, background: C.attach, color: '#fff', fontFamily: UI, fontWeight: 700, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
);

// everything falls away at the drop, each piece a little later than the last
const fallY = (f: number, delay: number) => { const t = Math.max(0, f - I.drop - delay); return t * t * 2.4; };

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = Math.round(interpolate(f, [4, I.pileEnd - 6], [1, 999], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) }));
  const dark = f >= I.drop - 1;

  // the wordmark: monospaced and centred; its O sits half an advance right of centre
  const FS = 230, ADV = FS * 0.82;
  const OX = 540 + ADV / 2, OY = 800;
  const zr = ramp(f, I.dive - 10, I.dive + 14, Easing.inOut(Easing.cubic));
  const zoom = Math.pow(80, ramp(f, I.dive, I.end, Easing.in(Easing.cubic)));

  return (
    <AbsoluteFill style={{ background: dark ? C.themes : C.light, overflow: 'hidden' }}>
      {/* PLOT waits underneath the pile */}
      {dark ? (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-(ADV / 2) * zr}px) scale(${zoom})`, transformOrigin: `${OX}px ${OY}px` }}>
          {'PLOT'.split('').map((ch, i) => {
            const t = sp(f, fps, I.drop + 4 + i * 3, BOUNCE);
            return <div key={i} style={{ position: 'absolute', left: OX + (i - 2) * ADV - ADV / 2, top: OY - FS * 0.5, width: ADV, textAlign: 'center', fontFamily: LOGO, fontSize: FS, lineHeight: 1, color: '#fff',
              transform: `translateY(${(1 - t) * 60}px) scale(${0.7 + 0.3 * t})`, opacity: Math.min(1, t * 1.4) }}>{ch}</div>;
          })}
        </div>
      ) : null}

      {/* the pile */}
      {f < I.drop + 40 ? PILE.map(it => {
        const t = spring({ frame: f - it.at, fps, config: BOUNCE });
        if (t <= 0.001) return null;
        const y = it.y - (1 - t) * 40 + fallY(f, it.i % 5);
        if (y > 1700) return null;
        return (
          <div key={it.i} style={{ position: 'absolute', left: it.x, top: y, transform: `translate(-50%,-50%) rotate(${it.r + (f > I.drop ? (f - I.drop) * 2 : 0)}deg) scale(${t})` }}>
            <div style={{ position: 'relative' }}>
              {it.kind === 'inbox' ? <Folder w={it.s} color={C.themes} variant={1} tabs={[C.threads[0], C.threads[1], C.threads[2]]} label="Inbox" sub="all mail" />
                : it.kind === 'doc' ? <Doc w={it.s * 0.62} color={it.color === C.panel || it.color === C.themes ? C.threads[0] : it.color} type={['PDF', 'DOCX', 'XLS', 'JPG'][it.i % 4]} />
                  : it.kind === 'card' ? <div style={{ transform: `scale(${it.s})` }}><EmailCard subject={MAIL[it.i % MAIL.length].s} from={MAIL[it.i % MAIL.length].from} date={MAIL[it.i % MAIL.length].d} dot={C.threads[it.i % 7]} w={340} /></div>
                    : <Folder w={it.s} color={it.color} variant={it.variant} label={it.s > 120 ? it.label : undefined} />}
              {it.i === 0 ? <Badge n={count >= 999 ? '999+' : String(count)} /> : null}
            </div>
          </div>
        );
      }) : null}

      {/* the deal: each card slaps down flat and stays */}
      {f >= I.deal && f < I.drop + 40 ? CARDS.map((c, i) => {
        if (f < c.at) return null;
        const k = f - c.at;
        const slap = k < 5 ? 1.22 - 0.22 * Easing.out(Easing.quad)(k / 5) : 1 + 0.015 * Math.max(0, 1 - (k - 5) / 4) * Math.sin((k - 5) * 1.6);
        const fy = fallY(f, c.fall);
        if (c.y + fy > 1800) return null;
        const fr = f > I.drop ? (f - I.drop) : 0;
        return <div key={i} style={{ position: 'absolute', left: c.x + fr * c.drift / 30, top: c.y + fy, transform: `translate(-50%,-50%) rotate(${c.r + fr * c.spin / 30}deg) scale(${slap})`,
          filter: k < 5 ? `drop-shadow(0 ${18 * (1 - k / 5)}px 18px rgba(0,0,0,0.18))` : undefined }}>
          <EmailCard subject={c.m.s} from={c.m.from} date={c.m.d} dot={c.dot} attach={c.attach} unread={c.unread} w={c.w} />
        </div>;
      }) : null}

      <Caption text={COPY.keep} delay={4} out={I.pileEnd - 6} />
      <Caption text={COPY.read} delay={I.deal + 2} out={I.drop - 3} />
    </AbsoluteFill>
  );
};
