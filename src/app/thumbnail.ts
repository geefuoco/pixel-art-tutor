import type { Drawing } from '../core/drawing';
import { exportPng } from '../core/png';

const thumbnails = new WeakMap<Drawing, string>();

export function thumbnail(drawing: Drawing): string {
  let url = thumbnails.get(drawing);
  if (!url) {
    let binary = '';
    for (const byte of exportPng(drawing, 1)) binary += String.fromCharCode(byte);
    url = `data:image/png;base64,${btoa(binary)}`;
    thumbnails.set(drawing, url);
  }
  return url;
}
