import { useCallback } from 'react';
import type { Drawing } from '../core/drawing';
import { tilingPreview, TILING_PREVIEW_REPEATS } from '../core/tiling';
import { paintDrawing } from './paint-drawing';

export function TilingPreview({ drawing }: { drawing: Drawing }) {
  const paint = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) paintDrawing(canvas, tilingPreview(drawing));
    },
    [drawing],
  );
  return (
    <section className="card tiling-preview" aria-labelledby="tiling-preview-title">
      <p id="tiling-preview-title" className="hint">
        Tiling Preview
      </p>
      <canvas
        ref={paint}
        role="img"
        aria-label={`Tiling Preview: the canvas repeated ${TILING_PREVIEW_REPEATS} by ${TILING_PREVIEW_REPEATS}`}
        width={drawing.width * TILING_PREVIEW_REPEATS}
        height={drawing.height * TILING_PREVIEW_REPEATS}
        style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }}
      />
    </section>
  );
}
