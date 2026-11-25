import type { Animation } from './animation';
import { TRANSPARENT, type Drawing, type Rect } from './drawing';

export type SheetLayout = 'strip' | 'grid';

export interface SpriteSheet {
  readonly image: Drawing;
  readonly frames: readonly Rect[];
}

export function spriteSheet(animation: Animation, layout: SheetLayout): SpriteSheet {
  const { width, height, palette } = animation;
  const count = animation.frames.length;
  const columns = layout === 'strip' ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const sheetWidth = columns * width;
  const pixels = new Array<number>(sheetWidth * rows * height).fill(TRANSPARENT);
  const frames = animation.frames.map((framePixels, i) => {
    const x = (i % columns) * width;
    const y = Math.floor(i / columns) * height;
    framePixels.forEach((p, j) => {
      pixels[(y + Math.floor(j / width)) * sheetWidth + x + (j % width)] = p;
    });
    return { x, y, width, height };
  });
  return { image: { width: sheetWidth, height: rows * height, palette, pixels }, frames };
}

interface Size {
  readonly w: number;
  readonly h: number;
}

interface Box extends Size {
  readonly x: number;
  readonly y: number;
}

export interface AsepriteFrame {
  readonly filename: string;
  readonly frame: Box;
  readonly rotated: false;
  readonly trimmed: false;
  readonly spriteSourceSize: Box;
  readonly sourceSize: Size;
  readonly duration: number;
}

export interface AsepriteFrameTag {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly direction: 'forward';
}

export interface AsepriteFrameMap {
  readonly frames: readonly AsepriteFrame[];
  readonly meta: {
    readonly app: string;
    readonly version: string;
    readonly image: string;
    readonly format: 'RGBA8888';
    readonly size: Size;
    readonly scale: string;
    readonly frameTags: readonly AsepriteFrameTag[];
  };
}

export function asepriteFrameMap(
  sheet: SpriteSheet,
  options: { fps: number; scale: number; image: string },
): AsepriteFrameMap {
  const { fps, scale, image } = options;
  const scaled = (rect: Rect): Box => ({
    x: rect.x * scale,
    y: rect.y * scale,
    w: rect.width * scale,
    h: rect.height * scale,
  });
  const duration = Math.round(1000 / fps);
  return {
    frames: sheet.frames.map((rect, i) => {
      const frame = scaled(rect);
      return {
        filename: `frame ${i}`,
        frame,
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
        sourceSize: { w: frame.w, h: frame.h },
        duration,
      };
    }),
    meta: {
      app: 'Pixel Art Tutor',
      version: '1.0',
      image,
      format: 'RGBA8888',
      size: { w: sheet.image.width * scale, h: sheet.image.height * scale },
      scale: String(scale),
      frameTags: [
        { name: 'animation', from: 0, to: sheet.frames.length - 1, direction: 'forward' },
      ],
    },
  };
}
