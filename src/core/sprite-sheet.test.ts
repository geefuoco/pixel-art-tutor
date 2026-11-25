import { describe, expect, it } from 'vitest';
import type { Animation } from './animation';
import { TRANSPARENT as _ } from './drawing';
import { asepriteFrameMap, spriteSheet } from './sprite-sheet';
import { rowsOf } from './test-grids';

const palette = ['#000000', '#ffffff', '#ff0000'];

function animationOf(frames: number[][][], fps = 8): Animation {
  return {
    width: frames[0]![0]!.length,
    height: frames[0]!.length,
    palette,
    frames: frames.map((rows) => rows.flat()),
    fps,
  };
}

const threeFrames = animationOf([
  [
    [0, _],
    [_, 0],
  ],
  [
    [1, 1],
    [_, _],
  ],
  [
    [2, _],
    [2, _],
  ],
]);

describe('sprite sheet layout', () => {
  it('as a strip puts every Frame side by side in order, left to right', () => {
    const sheet = spriteSheet(threeFrames, 'strip');
    expect(sheet.image.palette).toEqual(palette);
    expect(rowsOf(sheet.image)).toEqual([
      [0, _, 1, 1, 2, _],
      [_, 0, _, _, 2, _],
    ]);
    expect(sheet.frames).toEqual([
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 2, y: 0, width: 2, height: 2 },
      { x: 4, y: 0, width: 2, height: 2 },
    ]);
  });

  it('as a grid fills rows left to right, as near square as fits, with spare cells transparent', () => {
    const sheet = spriteSheet(threeFrames, 'grid');
    expect(rowsOf(sheet.image)).toEqual([
      [0, _, 1, 1],
      [_, 0, _, _],
      [2, _, _, _],
      [2, _, _, _],
    ]);
    expect(sheet.frames).toEqual([
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 2, y: 0, width: 2, height: 2 },
      { x: 0, y: 2, width: 2, height: 2 },
    ]);
  });

  it('as a grid has as many columns as a square of the Frames needs', () => {
    const framesOf = (count: number) => animationOf(Array.from({ length: count }, () => [[0]]));
    const size = (count: number) => {
      const { image } = spriteSheet(framesOf(count), 'grid');
      return [image.width, image.height];
    };
    expect([1, 2, 4, 5, 9, 10].map(size)).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ]);
  });
});

describe('Aseprite frame map', () => {
  it('lists each Frame in order with its place in the scaled sheet and how long it shows', () => {
    expect(asepriteFrameMap(threeFrames, { layout: 'grid', scale: 2, image: 'walk.png' })).toEqual({
      frames: [
        {
          filename: 'walk 0',
          frame: { x: 0, y: 0, w: 4, h: 4 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 },
          sourceSize: { w: 4, h: 4 },
          duration: 125,
        },
        {
          filename: 'walk 1',
          frame: { x: 4, y: 0, w: 4, h: 4 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 },
          sourceSize: { w: 4, h: 4 },
          duration: 125,
        },
        {
          filename: 'walk 2',
          frame: { x: 0, y: 4, w: 4, h: 4 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 },
          sourceSize: { w: 4, h: 4 },
          duration: 125,
        },
      ],
      meta: {
        app: 'Pixel Art Tutor',
        version: '1.0',
        image: 'walk.png',
        format: 'RGBA8888',
        size: { w: 8, h: 8 },
        scale: '2',
        frameTags: [],
      },
    });
  });

  it('gives the duration in whole milliseconds and a strip the size of every Frame in a row', () => {
    const map = asepriteFrameMap(
      { ...threeFrames, fps: 12 },
      { layout: 'strip', scale: 1, image: 'sheet.png' },
    );
    expect(map.frames.map((f) => [f.frame.x, f.duration])).toEqual([
      [0, 83],
      [2, 83],
      [4, 83],
    ]);
    expect(map.meta.size).toEqual({ w: 6, h: 2 });
  });
});
