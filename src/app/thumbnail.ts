import type { Color, Drawing } from '../core/drawing';
import { exportPng } from '../core/png';

const thumbnails = new WeakMap<readonly number[], { palette: readonly Color[]; url: string }>();

export function thumbnail(drawing: Drawing): string {
  const cached = thumbnails.get(drawing.pixels);
  if (cached?.palette === drawing.palette) return cached.url;
  let binary = '';
  for (const byte of exportPng(drawing, 1)) binary += String.fromCharCode(byte);
  const url = `data:image/png;base64,${btoa(binary)}`;
  thumbnails.set(drawing.pixels, { palette: drawing.palette, url });
  return url;
}
