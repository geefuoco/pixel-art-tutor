import { TRANSPARENT, type Drawing } from '../core/drawing';

export function paintDrawing(canvas: HTMLCanvasElement, drawing: Drawing) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawing.pixels.forEach((p, i) => {
    if (p === TRANSPARENT) return;
    ctx.fillStyle = drawing.palette[p]!;
    ctx.fillRect(i % drawing.width, Math.floor(i / drawing.width), 1, 1);
  });
}
