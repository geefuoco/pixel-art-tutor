import { applyCommand, type Command, type Drawing } from './drawing';

export type StepId = number;

export interface EditorState {
  readonly drawing: Drawing;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface Editor {
  getState(): EditorState;
  apply(command: Command, options?: { mergeWithLast?: boolean }): StepId;
  replace(step: StepId, command: Command): boolean;
  undo(): void;
  redo(): void;
  subscribe(listener: () => void): () => void;
}

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
  let openStep: { id: StepId; step: Step; recorded: boolean } | null = null;
  let nextId = 1;
  let state: EditorState = { drawing, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();

  function publish() {
    state = { drawing, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
    for (const listener of listeners) listener();
  }

  function record(open: NonNullable<typeof openStep>) {
    if (!open.recorded && open.step.size > 0) {
      undoStack.push(open.step);
      redoStack.length = 0;
      open.recorded = true;
    } else if (open.recorded && open.step.size === 0) {
      undoStack.pop();
      open.recorded = false;
    }
  }

  function changesAnything(next: Drawing) {
    return next.pixels.some((p, i) => p !== drawing.pixels[i]);
  }

  return {
    getState: () => state,
    apply(command, options) {
      const next = applyCommand(drawing, command);
      if (!options?.mergeWithLast || !openStep) {
        openStep = { id: nextId++, step: new Map(), recorded: false };
      }
      const open = openStep;
      if (!changesAnything(next)) return open.id;
      next.pixels.forEach((after, i) => {
        const before = drawing.pixels[i]!;
        if (after !== before)
          open.step.set(i, { before: open.step.get(i)?.before ?? before, after });
      });
      record(open);
      drawing = next;
      publish();
      return open.id;
    },
    replace(step, command) {
      const open = openStep;
      if (open?.id !== step) return false;
      const base = withPixels(drawing, open.step, 'before');
      const next = applyCommand(base, command);
      if (!changesAnything(next)) return true;
      open.step.clear();
      next.pixels.forEach((after, i) => {
        const before = base.pixels[i]!;
        if (after !== before) open.step.set(i, { before, after });
      });
      record(open);
      drawing = next;
      publish();
      return true;
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
