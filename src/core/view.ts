import type { Point } from './drawing';

const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];

export interface View {
  readonly zoomIndex: number;
  readonly pan: Point;
}

export const FIT_VIEW: View = { zoomIndex: 0, pan: { x: 0, y: 0 } };

export function viewZoom(view: View): number {
  return ZOOM_LEVELS[view.zoomIndex]!;
}

export function canZoom(view: View, steps: number): boolean {
  const next = view.zoomIndex + steps;
  return next >= 0 && next < ZOOM_LEVELS.length;
}

export function zoomView(view: View, steps: number, anchor: Point = { x: 0, y: 0 }): View {
  const zoomIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, view.zoomIndex + steps));
  if (zoomIndex === view.zoomIndex) return view;
  const ratio = ZOOM_LEVELS[zoomIndex]! / viewZoom(view);
  const pan = {
    x: anchor.x - (anchor.x - view.pan.x) * ratio,
    y: anchor.y - (anchor.y - view.pan.y) * ratio,
  };
  return { zoomIndex, pan };
}

export function panView(view: View, dx: number, dy: number): View {
  return { ...view, pan: { x: view.pan.x + dx, y: view.pan.y + dy } };
}
