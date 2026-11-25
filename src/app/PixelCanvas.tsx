import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { OnionSkins } from '../core/animation';
import { getPixel, TRANSPARENT, type Drawing, type Point, type Rect } from '../core/drawing';

const CELL = 24;
const CHECKER = ['#ffffff', '#f4f0ff'];
const GUIDE_OPACITY = 0.45;
const GUIDE_EDGE = 'rgba(59, 51, 85, 0.45)';
const MISSING_COLOR = '#f59e0b';
const EXTRA_COLOR = '#e11d48';
const MISTAKE_COLOR = '#7c3aed';

export type OnionSkinView = OnionSkins & { readonly opacity: number };

export interface CanvasMarks {
  readonly guide: readonly number[] | null;
  readonly missing: readonly Point[];
  readonly extra: readonly Point[];
  readonly mistakes: readonly Point[];
}

function paint(canvas: HTMLCanvasElement, drawing: Drawing, onion: OnionSkinView | undefined) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const skins = onion ? [onion.previous, onion.next].filter((s) => s !== null) : [];
  for (let y = 0; y < drawing.height; y++) {
    for (let x = 0; x < drawing.width; x++) {
      const p = getPixel(drawing, x, y);
      ctx.fillStyle = p === TRANSPARENT ? CHECKER[(x + y) % 2]! : drawing.palette[p]!;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      if (p !== TRANSPARENT || !onion) continue;
      ctx.globalAlpha = onion.opacity;
      for (const skin of skins) {
        const s = skin[y * drawing.width + x]!;
        if (s === TRANSPARENT) continue;
        ctx.fillStyle = drawing.palette[s]!;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function paintMarks(canvas: HTMLCanvasElement, drawing: Drawing, marks: CanvasMarks) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = GUIDE_EDGE;
  marks.guide?.forEach((p, i) => {
    if (p === TRANSPARENT) return;
    const x = (i % drawing.width) * CELL;
    const y = Math.floor(i / drawing.width) * CELL;
    ctx.globalAlpha = GUIDE_OPACITY;
    ctx.fillStyle = drawing.palette[p]!;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.globalAlpha = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
  });
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = MISSING_COLOR;
  for (const { x, y } of marks.missing)
    ctx.strokeRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
  ctx.strokeStyle = EXTRA_COLOR;
  for (const { x, y } of marks.extra) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 5, y * CELL + 5);
    ctx.lineTo(x * CELL + CELL - 5, y * CELL + CELL - 5);
    ctx.moveTo(x * CELL + CELL - 5, y * CELL + 5);
    ctx.lineTo(x * CELL + 5, y * CELL + CELL - 5);
    ctx.stroke();
  }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = MISTAKE_COLOR;
  for (const { x, y } of marks.mistakes) {
    ctx.beginPath();
    ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL / 2 - 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

export function PixelCanvas({
  drawing,
  onPress,
  onDrag,
  showGrid,
  selection,
  showMirrorAxis,
  marks,
  onion,
  label,
}: {
  drawing: Drawing;
  onPress: (at: Point) => void;
  onDrag: (from: Point, to: Point) => void;
  showGrid: boolean;
  selection: Rect | null;
  showMirrorAxis: boolean;
  marks?: CanvasMarks;
  onion?: OnionSkinView;
  label: string;
}) {
  const last = useRef<Point | null>(null);
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) paint(canvas, drawing, onion);
    },
    [drawing, onion],
  );
  const marksRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas && marks) paintMarks(canvas, drawing, marks);
    },
    [drawing, marks],
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
      {marks && (
        <canvas
          ref={marksRef}
          className="pixel-marks"
          aria-hidden
          width={drawing.width * CELL}
          height={drawing.height * CELL}
        />
      )}
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
