import { useCallback, useRef, type PointerEvent } from 'react';
import { getPixel, TRANSPARENT, type Drawing, type Point } from '../core/drawing';

const CELL = 24;
const CHECKER = ['#ffffff', '#f4f0ff'];

function paint(canvas: HTMLCanvasElement, drawing: Drawing) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      const p = getPixel(drawing, x, y);
      ctx.fillStyle = p === TRANSPARENT ? CHECKER[(x + y) % 2]! : drawing.palette[p]!;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
}

/**
 * Renders a Drawing on a plain canvas and reports mouse strokes as drawing-pixel
 * points. Each call to onStroke continues the stroke from the previous point.
 */
export function PixelCanvas({
  drawing,
  onStroke,
  label,
}: {
  drawing: Drawing;
  onStroke: (points: readonly Point[]) => void;
  label: string;
}) {
  const last = useRef<Point | null>(null);
  // Re-runs on commit whenever the drawing changes, so painting happens outside render.
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) paint(canvas, drawing);
    },
    [drawing],
  );

  function toPixel(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * drawing.width),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * drawing.height),
    };
  }

  return (
    <canvas
      ref={ref}
      className="pixel-canvas"
      role="img"
      aria-label={label}
      width={drawing.width * CELL}
      height={drawing.height * CELL}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = toPixel(e);
        last.current = p;
        onStroke([p]);
      }}
      onPointerMove={(e) => {
        const from = last.current;
        if (!from) return;
        const p = toPixel(e);
        if (p.x === from.x && p.y === from.y) return;
        last.current = p;
        onStroke([from, p]);
      }}
      // Fires after pointerup and pointercancel too, so every way a stroke can end lands here.
      onLostPointerCapture={() => (last.current = null)}
    />
  );
}
