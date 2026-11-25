import { useCallback } from 'react';
import { frameDrawing, MAX_FPS, MIN_FPS, previewFrame, type Animation } from '../core/animation';
import { TRANSPARENT, type Drawing } from '../core/drawing';
import type { Editor } from '../core/editor';
import { ControlButton, type Control } from './controls';
import { thumbnail } from './thumbnail';

const FPS_CHOICES = Array.from({ length: MAX_FPS - MIN_FPS + 1 }, (_, i) => MIN_FPS + i);

const ONION_OPACITIES = { min: 0.1, max: 0.9, step: 0.1 } as const;

function paintFrame(canvas: HTMLCanvasElement, drawing: Drawing) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawing.pixels.forEach((p, i) => {
    if (p === TRANSPARENT) return;
    ctx.fillStyle = drawing.palette[p]!;
    ctx.fillRect(i % drawing.width, Math.floor(i / drawing.width), 1, 1);
  });
}

export function AnimationPreview({
  animation,
  label = `Animation preview, ${animation.frames.length} Frames at ${animation.fps} FPS`,
  className = 'animation-preview',
}: {
  animation: Animation;
  label?: string;
  className?: string;
}) {
  const play = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      let shown = -1;
      let request = 0;
      const tick = (now: number) => {
        const frameCount = animation.frames.length;
        const frame = previewFrame(now, { fps: animation.fps, frameCount });
        if (frame !== shown) {
          shown = frame;
          paintFrame(canvas, frameDrawing(animation, frame));
        }
        request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(request);
    },
    [animation],
  );
  return (
    <canvas
      ref={play}
      className={className}
      role="img"
      aria-label={label}
      width={animation.width}
      height={animation.height}
      style={{ aspectRatio: `${animation.width} / ${animation.height}` }}
    />
  );
}

export function FrameStrip({
  editor,
  animation,
  frame,
  controls,
  onionShown,
  onionOpacity,
  onOnionOpacity,
  previewShown,
  fpsEditable = true,
}: {
  editor: Editor;
  animation: Animation;
  frame: number;
  controls: Control[];
  onionShown: boolean;
  onionOpacity: number;
  onOnionOpacity: (opacity: number) => void;
  previewShown: boolean;
  fpsEditable?: boolean;
}) {
  return (
    <section className="card frame-strip" aria-label="Frames">
      <div className="frame-actions" role="toolbar" aria-label="Frame actions">
        {controls.map((c) => (
          <ControlButton key={c.label} control={c} iconSize={18} />
        ))}
        {fpsEditable && (
          <label>
            FPS
            <select
              value={animation.fps}
              onChange={(e) =>
                editor.applyToFrames({ type: 'set-fps', fps: Number(e.currentTarget.value) })
              }
            >
              {FPS_CHOICES.map((fps) => (
                <option key={fps} value={fps}>
                  {fps}
                </option>
              ))}
            </select>
          </label>
        )}
        {onionShown && (
          <label>
            Onion skin opacity
            <input
              type="range"
              min={ONION_OPACITIES.min}
              max={ONION_OPACITIES.max}
              step={ONION_OPACITIES.step}
              value={onionOpacity}
              onChange={(e) => onOnionOpacity(e.currentTarget.valueAsNumber)}
            />
          </label>
        )}
      </div>
      <div className="frame-row">
        <ol className="frame-list">
          {animation.frames.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                className="frame-item"
                aria-label={`Frame ${i + 1}`}
                aria-current={i === frame ? 'true' : undefined}
                onClick={() => editor.selectFrame(i)}
              >
                <img
                  src={thumbnail(frameDrawing(animation, i))}
                  alt=""
                  style={{ aspectRatio: `${animation.width} / ${animation.height}` }}
                />
                <span>{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
        {previewShown && <AnimationPreview animation={animation} />}
      </div>
    </section>
  );
}
