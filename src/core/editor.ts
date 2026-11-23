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
   * With `replaceLast`, it first takes back the open step's changes and then becomes
   * that step, so a block can be dragged on after a paste or move without leaving
   * copies behind. Undo and redo end the open step, so after them both options act
   * like a plain apply. Commands that change nothing add no step.
   */
  apply(command: Command, options?: { mergeWithLast?: boolean; replaceLast?: boolean }): void;
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
      if (options?.replaceLast && openStep) {
        const replaced = openStep;
        const base = withPixels(drawing, replaced.step, 'before');
        const next = applyCommand(base, command);
        if (next.pixels.every((p, i) => p === drawing.pixels[i])) return;
        replaced.step.clear();
        next.pixels.forEach((after, i) => {
          const before = base.pixels[i]!;
          if (after !== before) replaced.step.set(i, { before, after });
        });
        // A recorded open step is always the newest on the stack: undo and redo close it.
        if (replaced.recorded && replaced.step.size === 0) {
          undoStack.pop();
          replaced.recorded = false;
        } else if (!replaced.recorded && replaced.step.size > 0) {
          undoStack.push(replaced.step);
          redoStack.length = 0;
          replaced.recorded = true;
        }
        drawing = next;
        publish();
        return;
      }
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
