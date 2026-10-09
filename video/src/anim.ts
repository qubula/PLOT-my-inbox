import { Easing, interpolate, spring } from 'remotion';

// Motion language: fast in, soft settle.
export const SNAP = { damping: 20, stiffness: 130, mass: 1 };
export const SOFT = { damping: 24, stiffness: 80, mass: 1 };
export const BOUNCE = { damping: 13, stiffness: 120, mass: 0.9 };

export const sp = (frame: number, fps: number, delay = 0, config = SNAP) =>
  spring({ frame: frame - delay, fps, config });

export const lerp = (t: number, a: number, b: number) => a + (b - a) * t;

// Eased 0..1 between two frames.
export const ramp = (frame: number, from: number, to: number, ease = Easing.bezier(0.22, 1, 0.36, 1)) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
