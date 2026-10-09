// Email node geometry, the same rules as web/js/emailNode.js:
// shape = age (5–10 points, 22–92% of the halo), size = file size, colour = thread.
const M = 4294967296, A = 1664525, Cc = 1013904223;
const map = (v: number, a1: number, b1: number, a2: number, b2: number) => a2 + (v - a1) * (b2 - a2) / (b1 - a1);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// p5.js randomSeed/random (linear congruential generator)
const rng = (seed: number) => { let s = seed >>> 0; return (lo: number, hi: number) => { s = (A * s + Cc) % M; return lo + (s / M) * (hi - lo); }; };

export const sizeScale = (kb: number) => clamp(map(kb, 50, 900, 0.5, 1.7), 0.45, 1.87);
export const NODE_R = 7;

// Smooth closed curve through points (Catmull-Rom with p5's curveTightness 0.4)
const curve = (pts: [number, number][]) => {
  const n = pts.length, t = (1 - 0.4) / 6;
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + 'Z';
};

// Blob path for an email of radius R at (cx, cy). `pointsOverride` lets the
// decay scene ease between point counts.
export const blob = (cx: number, cy: number, R: number, age: number, seed: number, pointsOverride?: number) => {
  const N = pointsOverride ?? Math.floor(map(age, 0, 1, 5, 11));
  const base = R * map(age, 0, 1, 0.22, 0.92);
  const maxR = R * 0.92;
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N - Math.PI / 2;
    const rr = Math.min(base * r(0.92, 1.08), maxR);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return curve(pts);
};
export const haloAlpha = (age: number) => map(clamp(age, 0, 1), 0, 1, 32, 175) / 255;
export { map };
