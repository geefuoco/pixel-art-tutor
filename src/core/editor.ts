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

function samePixels(a: Drawing, b: Drawing): boolean {
  return a.pixels.every((p, i) => p === b.pixels[i]);
}

export function createEditor(initial: Drawing): Editor {
  let drawing = initial;
  // Each history entry is the drawing as it was before (undo) or after (redo) one step.
  const undoStack: Drawing[] = [];
  const redoStack: Drawing[] = [];
  // The step the last apply started: the drawing before it, and whether it has changed anything yet.
  let openStep: { before: Drawing; recorded: boolean } | null = null;
  let state: EditorState = { drawing, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();

  function changed() {
    state = { drawing, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
    for (const listener of listeners) listener();
  }

  return {
    getState: () => state,
    apply(command, options) {
      const next = applyCommand(drawing, command);
      if (!options?.mergeWithLast || !openStep) openStep = { before: drawing, recorded: false };
      if (samePixels(drawing, next)) return;
      if (!openStep.recorded) {
        undoStack.push(openStep.before);
        redoStack.length = 0;
        openStep.recorded = true;
      }
      drawing = next;
      changed();
    },
    undo() {
      openStep = null;
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(drawing);
      drawing = previous;
      changed();
    },
    redo() {
      openStep = null;
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(drawing);
      drawing = next;
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
