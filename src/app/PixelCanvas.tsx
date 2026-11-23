import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react';
import { getPixel, TRANSPARENT, type Drawing, type Point, type Rect } from '../core/drawing';

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

export function PixelCanvas({
  drawing,
  onPress,
  onDrag,
  showGrid,
  selection,
  showMirrorAxis,
  label,
}: {
  drawing: Drawing;
  onPress: (at: Point) => void;
  onDrag: (from: Point, to: Point) => void;
  showGrid: boolean;
  selection: Rect | null;
  showMirrorAxis: boolean;
  label: string;
}) {
  const last = useRef<Point | null>(null);
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
    <div className="pixel-canvas-wrap">
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
          const { x, y } = toPixel(e);
          const p = { x: Math.min(x, drawing.width - 1), y: Math.min(y, drawing.height - 1) };
          last.current = p;
          onPress(p);
        }}
        onPointerMove={(e) => {
          const from = last.current;
          if (!from) return;
          const p = toPixel(e);
          if (p.x === from.x && p.y === from.y) return;
          last.current = p;
          onDrag(from, p);
        }}
        onLostPointerCapture={() => (last.current = null)}
      />
      {showGrid && (
        <div
          className="pixel-grid"
          aria-hidden
          style={{ '--cols': drawing.width, '--rows': drawing.height } as CSSProperties}
        />
      )}
      {showMirrorAxis && <div className="mirror-axis" aria-hidden />}
      {selection && (
        <div
          className="selection-outline"
          aria-hidden
          style={{
            left: `${(selection.x / drawing.width) * 100}%`,
            top: `${(selection.y / drawing.height) * 100}%`,
            width: `${(selection.width / drawing.width) * 100}%`,
            height: `${(selection.height / drawing.height) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
