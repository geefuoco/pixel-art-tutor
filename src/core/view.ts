import type { Point } from './drawing';

/** Zoom factors, as multiples of the size at which the whole drawing fits the view. */
const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];

/** How the drawing is zoomed and panned inside the editor's view. */
export interface View {
  readonly zoomIndex: number;
  /** Offset of the drawing's centre from the view's centre, in screen pixels. */
  readonly pan: Point;
}

/** The whole drawing, centred. */
export const FIT_VIEW: View = { zoomIndex: 0, pan: { x: 0, y: 0 } };

/** The current zoom, as a multiple of fit size. */
export function viewZoom(view: View): number {
  return ZOOM_LEVELS[view.zoomIndex]!;
}

export function canZoom(view: View, steps: number): boolean {
  const next = view.zoomIndex + steps;
  return next >= 0 && next < ZOOM_LEVELS.length;
}

/** Zooms by whole levels, stopping at fit size and the largest zoom; the point at the view's centre stays there. */
export function zoomView(view: View, steps: number): View {
  const zoomIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, view.zoomIndex + steps));
  const ratio = ZOOM_LEVELS[zoomIndex]! / viewZoom(view);
  return { zoomIndex, pan: { x: view.pan.x * ratio, y: view.pan.y * ratio } };
}

/** Moves the drawing by (dx, dy) screen pixels. */
export function panView(view: View, dx: number, dy: number): View {
  return { ...view, pan: { x: view.pan.x + dx, y: view.pan.y + dy } };
}
