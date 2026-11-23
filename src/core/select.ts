import {
  copyPixels,
  rectBetween,
  rectOnCanvas,
  type Clip,
  type Command,
  type Point,
  type Rect,
} from './drawing';
import type { Editor, StepId } from './editor';

export interface SelectToolState {
  readonly selection: Rect | null;
  readonly canCopy: boolean;
  readonly canPaste: boolean;
}

export interface SelectTool {
  getState(): SelectToolState;
  press(at: Point): void;
  drag(to: Point): void;
  copy(): void;
  paste(): void;
  deselect(): void;
  subscribe(listener: () => void): () => void;
}

interface Placed {
  readonly place: (at: Point) => Command;
  readonly step: StepId | null;
}

type Gesture =
  | { readonly kind: 'select'; readonly start: Point }
  | { readonly kind: 'move'; readonly start: Point; readonly from: Rect; block: Placed };

function contains(rect: Rect, p: Point) {
  return p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;
}

function moveFrom(from: Rect): (at: Point) => Command {
  return (to) => ({ type: 'move', from, to });
}

export function createSelectTool(editor: Editor): SelectTool {
  const canvas = () => editor.getState().drawing;
  let selection: Rect | null = null;
  let placed: Placed | null = null;
  let clip: Clip | null = null;
  let gesture: Gesture | null = null;
  let state: SelectToolState = { selection: null, canCopy: false, canPaste: false };
  const listeners = new Set<() => void>();

  function publish() {
    const visible = selection && rectOnCanvas(canvas(), selection);
    state = { selection: visible, canCopy: !!visible, canPaste: !!clip };
    for (const listener of listeners) listener();
  }

  return {
    getState: () => state,
    press(at) {
      if (selection && contains(selection, at)) {
        gesture = {
          kind: 'move',
          start: at,
          from: selection,
          block: placed ?? { place: moveFrom(selection), step: null },
        };
        return;
      }
      gesture = { kind: 'select', start: at };
      selection = rectBetween(canvas(), at, at);
      placed = null;
      publish();
    },
    drag(to) {
      if (!gesture) return;
      if (gesture.kind === 'select') {
        selection = rectBetween(canvas(), gesture.start, to);
        publish();
        return;
      }
      const { start, from } = gesture;
      const at = { x: from.x + to.x - start.x, y: from.y + to.y - start.y };
      let { block } = gesture;
      if (block.step === null || !editor.replace(block.step, block.place(at))) {
        const place = moveFrom(from);
        block = { place, step: editor.apply(place(at)) };
      }
      gesture.block = block;
      placed = block;
      selection = { ...from, ...at };
      publish();
    },
    copy() {
      if (!state.selection) return;
      clip = copyPixels(canvas(), state.selection);
      publish();
    },
    paste() {
      if (!clip) return;
      const pasted = clip;
      const at = state.selection ? { x: state.selection.x, y: state.selection.y } : { x: 0, y: 0 };
      const place = (p: Point): Command => ({ type: 'paste', clip: pasted, at: p });
      placed = { place, step: editor.apply(place(at)) };
      selection = { ...at, width: pasted.width, height: pasted.height };
      publish();
    },
    deselect() {
      selection = null;
      placed = null;
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
