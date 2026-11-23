import { applyCommand, type Command, type Drawing } from './drawing';

/**
 * Holds the current Drawing and applies commands to it. Subscribable, so UI can
 * read it with useSyncExternalStore.
 */
export interface Editor {
  getDrawing(): Drawing;
  apply(command: Command): void;
  subscribe(listener: () => void): () => void;
}

export function createEditor(initial: Drawing): Editor {
  let drawing = initial;
  const listeners = new Set<() => void>();
  return {
    getDrawing: () => drawing,
    apply(command) {
      drawing = applyCommand(drawing, command);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
