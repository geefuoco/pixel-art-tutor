import type { Color } from './drawing';

type Lab = readonly [lightness: number, a: number, b: number];

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labCurve(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116;
}

function labOf(color: Color): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(color.slice(i, i + 2), 16))) as [
    number,
    number,
    number,
  ];
  const fx = labCurve((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = labCurve(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = labCurve((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: Color, b: Color): number {
  const [l1, a1, b1] = labOf(a);
  const [l2, a2, b2] = labOf(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
