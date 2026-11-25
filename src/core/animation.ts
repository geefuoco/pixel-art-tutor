import { TRANSPARENT, type Color, type Drawing } from './drawing';

export const DEFAULT_FPS = 8;
export const MIN_FPS = 1;
export const MAX_FPS = 30;

export interface Animation {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly Color[];
  readonly frames: readonly (readonly number[])[];
  readonly fps: number;
}

export type FrameCommand =
  | { readonly type: 'add-frame'; readonly at: number; readonly copyOf?: number }
  | { readonly type: 'remove-frame'; readonly frame: number }
  | { readonly type: 'move-frame'; readonly from: number; readonly to: number }
  | { readonly type: 'set-fps'; readonly fps: number };

export function stillAnimation(drawing: Drawing, fps = DEFAULT_FPS): Animation {
  const { width, height, palette, pixels } = drawing;
  return { width, height, palette, frames: [pixels], fps };
}

export function frameDrawing(animation: Animation, frame: number): Drawing {
  const pixels = animation.frames[frame];
  if (!pixels) throw new RangeError(`There is no Frame ${frame + 1}`);
  const { width, height, palette } = animation;
  return { width, height, palette, pixels };
}

export function assertFramePosition(index: number, positions: number) {
  if (!Number.isInteger(index) || index < 0 || index >= positions) {
    throw new RangeError(`Frame position ${index + 1} is not between 1 and ${positions}`);
  }
}

export function applyFrameCommand(animation: Animation, command: FrameCommand): Animation {
  const frames = animation.frames.slice();
  switch (command.type) {
    case 'add-frame': {
      assertFramePosition(command.at, frames.length + 1);
      const blank = new Array<number>(animation.width * animation.height).fill(TRANSPARENT);
      const added =
        command.copyOf === undefined ? blank : frameDrawing(animation, command.copyOf).pixels;
      frames.splice(command.at, 0, added);
      return { ...animation, frames };
    }
    case 'remove-frame': {
      assertFramePosition(command.frame, frames.length);
      if (frames.length === 1) return animation;
      frames.splice(command.frame, 1);
      return { ...animation, frames };
    }
    case 'move-frame': {
      assertFramePosition(command.from, frames.length);
      assertFramePosition(command.to, frames.length);
      if (command.from === command.to) return animation;
      frames.splice(command.to, 0, ...frames.splice(command.from, 1));
      return { ...animation, frames };
    }
    case 'set-fps':
      if (!isValidFps(command.fps)) {
        throw new RangeError(
          `An animation plays at ${MIN_FPS} to ${MAX_FPS} FPS, not ${command.fps}`,
        );
      }
      return command.fps === animation.fps ? animation : { ...animation, fps: command.fps };
  }
}

export function isValidFps(fps: number): boolean {
  return Number.isInteger(fps) && fps >= MIN_FPS && fps <= MAX_FPS;
}

export interface OnionSkins {
  readonly previous: readonly number[] | null;
  readonly next: readonly number[] | null;
}

export function onionSkins(animation: Animation, frame: number): OnionSkins {
  return {
    previous: animation.frames[frame - 1] ?? null,
    next: animation.frames[frame + 1] ?? null,
  };
}

export function previewFrame(
  elapsedMs: number,
  { fps, frameCount }: { fps: number; frameCount: number },
): number {
  return Math.floor((elapsedMs * fps) / 1000) % frameCount;
}
