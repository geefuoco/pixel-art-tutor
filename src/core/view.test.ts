import { describe, expect, it } from 'vitest';
import { FIT_VIEW, panView, viewZoom, zoomView } from './view';

describe('view', () => {
  it('starts at fit size, zooms in through 2x, 3x, 4x, 6x and 8x, then stops', () => {
    const zooms = [viewZoom(FIT_VIEW)];
    let v = FIT_VIEW;
    for (let i = 0; i < 6; i++) {
      v = zoomView(v, 1);
      zooms.push(viewZoom(v));
    }
    expect(zooms).toEqual([1, 2, 3, 4, 6, 8, 8]);
    expect(viewZoom(zoomView(FIT_VIEW, -1))).toBe(1);
  });

  it('keeps the same drawing point at the centre of the view while zooming', () => {
    const panned = panView(FIT_VIEW, 10, -4);
    expect(zoomView(panned, 1).pan).toEqual({ x: 20, y: -8 });
    expect(zoomView(zoomView(panned, 2), -2).pan).toEqual({ x: 10, y: -4 });
  });

  it('zooming at a point keeps that point fixed on screen', () => {
    const v = panView(FIT_VIEW, 40, -20);
    expect(zoomView(v, 1, { x: 40, y: -20 }).pan).toEqual({ x: 40, y: -20 });
    expect(zoomView(FIT_VIEW, 1, { x: 0, y: 0 }).pan).toEqual({ x: 0, y: 0 });
    expect(zoomView(FIT_VIEW, 1, { x: -30, y: 0 }).pan).toEqual({ x: 30, y: 0 });
    const max = zoomView(FIT_VIEW, 5);
    expect(zoomView(max, 1, { x: -30, y: 12 })).toEqual(max);
  });

  it('pans by screen pixels, at any zoom', () => {
    const v = panView(panView(zoomView(FIT_VIEW, 3), 32, 0), -8, 16);
    expect(v.pan).toEqual({ x: 24, y: 16 });
    expect(viewZoom(v)).toBe(4);
  });
});
