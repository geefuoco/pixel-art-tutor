import { applyCommand, type Command, type Drawing } from './drawing';

export interface EditorState {
  readonly drawing: Drawing;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/**
 * Holds the current Drawing, applies commands to it and keeps undo/redo history.
 * Subscribable, so UI can read it with useSyncExternalStore.
 */
export interface Editor {
  /** The same object until the next change. */
  getState(): EditorState;
  /**
   * Applies a command as a new undo step. With `mergeWithLast`, it joins the step
   * the previous apply started instead, so a whole mouse stroke undoes at once.
   * Undo and redo end the open step. Commands that change nothing add no step.
   */
  apply(command: Command, options?: { mergeWithLast?: boolean }): void;
  undo(): void;
  redo(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * One undo step: only the pixels it changed, by index, with their values before
 * and after it. Commands only ever change pixels, so this is the whole difference.
 */
type Step = Map<number, { before: number; after: number }>;

function withPixels(drawing: Drawing, step: Step, side: 'before' | 'after'): Drawing {
  const pixels = drawing.pixels.slice();
  for (const [i, change] of step) pixels[i] = change[side];
  return { ...drawing, pixels };
}

export function createEditor(initial: Drawing): Editor {
  let drawing = initial;
  const undoStack: Step[] = [];
  const redoStack: Step[] = [];
  // The step the last apply started, which a merged apply adds to. It is on the
  // undo stack once it has changed a pixel.
  let openStep: { step: Step; recorded: boolean } | null = null;
  let state: EditorState = { drawing, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();

  function publish() {
    state = { drawing, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
    for (const listener of listeners) listener();
  }

  return {
    getState: () => state,
    apply(command, options) {
      const next = applyCommand(drawing, command);
      if (!options?.mergeWithLast || !openStep) openStep = { step: new Map(), recorded: false };
      const { step } = openStep;
      let changed = false;
      next.pixels.forEach((after, i) => {
        const before = drawing.pixels[i]!;
        if (after === before) return;
        changed = true;
        // Keep the value from before the step's first change to this pixel.
        step.set(i, { before: step.get(i)?.before ?? before, after });
      });
      if (!changed) return;
      if (!openStep.recorded) {
        undoStack.push(step);
        redoStack.length = 0;
        openStep.recorded = true;
      }
      drawing = next;
      publish();
    },
    undo() {
      openStep = null;
      const step = undoStack.pop();
      if (!step) return;
      redoStack.push(step);
      drawing = withPixels(drawing, step, 'before');
      publish();
    },
    redo() {
      openStep = null;
      const step = redoStack.pop();
      if (!step) return;
      undoStack.push(step);
      drawing = withPixels(drawing, step, 'after');
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
