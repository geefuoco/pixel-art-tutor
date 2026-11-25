import { applyFrameCommand, frameDrawing, type Animation, type FrameCommand } from './animation';
import { applyCommand, type Command, type Drawing } from './drawing';

export type StepId = number;

export interface EditorState {
  readonly animation: Animation;
  readonly frame: number;
  readonly drawing: Drawing;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface Editor {
  getState(): EditorState;
  apply(command: Command, options?: { mergeWithLast?: boolean }): StepId;
  replace(step: StepId, command: Command): boolean;
  applyToFrames(command: FrameCommand): void;
  selectFrame(frame: number): void;
  undo(): void;
  redo(): void;
  subscribe(listener: () => void): () => void;
}

type PixelChanges = Map<number, { before: number; after: number }>;

interface FrameLayout {
  readonly frames: Animation['frames'];
  readonly fps: number;
  readonly frame: number;
}

type Step =
  | { readonly kind: 'pixels'; readonly frame: number; readonly changes: PixelChanges }
  | { readonly kind: 'frames'; readonly before: FrameLayout; readonly after: FrameLayout };

function withPixels(pixels: readonly number[], changes: PixelChanges, side: 'before' | 'after') {
  const next = pixels.slice();
  for (const [i, change] of changes) next[i] = change[side];
  return next;
}

function withFrame(animation: Animation, frame: number, pixels: readonly number[]): Animation {
  const frames = animation.frames.slice();
  frames[frame] = pixels;
  return { ...animation, frames };
}

function frameAfter(command: FrameCommand, current: number, frameCount: number): number {
  switch (command.type) {
    case 'add-frame':
      return command.at;
    case 'remove-frame':
      return Math.min(current, frameCount - 1);
    case 'move-frame':
      return command.to;
    case 'set-fps':
      return current;
  }
}

export function createEditor(initial: Animation): Editor {
  let animation = initial;
  let frame = 0;
  const undoStack: Step[] = [];
  const redoStack: Step[] = [];
  let openStep: {
    id: StepId;
    frame: number;
    changes: PixelChanges;
    recorded: Step | null;
  } | null = null;
  let nextId = 1;
  let state = snapshot();
  const listeners = new Set<() => void>();

  function snapshot(): EditorState {
    return {
      animation,
      frame,
      drawing: frameDrawing(animation, frame),
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
  }

  function publish() {
    state = snapshot();
    for (const listener of listeners) listener();
  }

  function push(step: Step) {
    undoStack.push(step);
    redoStack.length = 0;
  }

  function record(open: NonNullable<typeof openStep>) {
    if (!open.recorded && open.changes.size > 0) {
      open.recorded = { kind: 'pixels', frame: open.frame, changes: open.changes };
      push(open.recorded);
    } else if (open.recorded && open.changes.size === 0) {
      undoStack.splice(undoStack.lastIndexOf(open.recorded), 1);
      open.recorded = null;
    }
  }

  function changesAnything(before: Drawing, next: Drawing) {
    return next.pixels.some((p, i) => p !== before.pixels[i]);
  }

  function layout(): FrameLayout {
    return { frames: animation.frames, fps: animation.fps, frame };
  }

  function restore(to: FrameLayout) {
    animation = { ...animation, frames: to.frames, fps: to.fps };
    frame = to.frame;
  }

  function step(from: Step[], to: Step[], side: 'before' | 'after') {
    openStep = null;
    const taken = from.pop();
    if (!taken) return;
    to.push(taken);
    if (taken.kind === 'frames') {
      restore(taken[side]);
    } else {
      frame = taken.frame;
      animation = withFrame(
        animation,
        frame,
        withPixels(animation.frames[frame]!, taken.changes, side),
      );
    }
    publish();
  }

  return {
    getState: () => state,
    apply(command, options) {
      const current = frameDrawing(animation, frame);
      const next = applyCommand(current, command);
      if (!options?.mergeWithLast || openStep?.frame !== frame) {
        openStep = { id: nextId++, frame, changes: new Map(), recorded: null };
      }
      const open = openStep;
      if (!changesAnything(current, next)) return open.id;
      next.pixels.forEach((after, i) => {
        const before = current.pixels[i]!;
        if (after !== before)
          open.changes.set(i, { before: open.changes.get(i)?.before ?? before, after });
      });
      record(open);
      animation = withFrame(animation, frame, next.pixels);
      publish();
      return open.id;
    },
    replace(id, command) {
      const open = openStep;
      if (open?.id !== id || open.frame !== frame) return false;
      const base = {
        ...state.drawing,
        pixels: withPixels(state.drawing.pixels, open.changes, 'before'),
      };
      const next = applyCommand(base, command);
      if (!changesAnything(state.drawing, next)) return true;
      open.changes.clear();
      next.pixels.forEach((after, i) => {
        const before = base.pixels[i]!;
        if (after !== before) open.changes.set(i, { before, after });
      });
      record(open);
      animation = withFrame(animation, frame, next.pixels);
      publish();
      return true;
    },
    applyToFrames(command) {
      const next = applyFrameCommand(animation, command);
      if (next === animation) return;
      openStep = null;
      const before = layout();
      animation = next;
      frame = frameAfter(command, frame, next.frames.length);
      push({ kind: 'frames', before, after: layout() });
      publish();
    },
    selectFrame(index) {
      frameDrawing(animation, index);
      if (index === frame) return;
      openStep = null;
      frame = index;
      publish();
    },
    undo: () => step(undoStack, redoStack, 'before'),
    redo: () => step(redoStack, undoStack, 'after'),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
