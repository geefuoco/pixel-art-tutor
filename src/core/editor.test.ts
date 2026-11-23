import { describe, expect, it } from 'vitest';
import { TRANSPARENT, createDrawing, getPixel, type Drawing } from './drawing';
import { createEditor } from './editor';

const palette = ['#000000', '#ffffff', '#ff0000'];

function row(d: Drawing) {
  return Array.from({ length: d.width }, (_, x) => getPixel(d, x, 0));
}

const T = TRANSPARENT;

describe('editor', () => {
  it('applies commands to its drawing and tells subscribers when it changes', () => {
    const editor = createEditor(createDrawing({ width: 2, height: 2, palette }));
    let notified = 0;
    const unsubscribe = editor.subscribe(() => notified++);

    editor.apply({ type: 'pencil', color: 0, points: [{ x: 1, y: 1 }] });
    expect(getPixel(editor.getState().drawing, 1, 1)).toBe(0);
    expect(notified).toBe(1);

    unsubscribe();
    editor.apply({ type: 'eraser', points: [{ x: 1, y: 1 }] });
    expect(getPixel(editor.getState().drawing, 1, 1)).toBe(TRANSPARENT);
    expect(notified).toBe(1);
  });

  it('undo steps back through commands one at a time and redo replays them', () => {
    const editor = createEditor(createDrawing({ width: 3, height: 1, palette }));
    expect(editor.getState()).toMatchObject({ canUndo: false, canRedo: false });

    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'fill', color: 1, at: { x: 2, y: 0 } });
    editor.apply({ type: 'eraser', points: [{ x: 0, y: 0 }] });
    expect(row(editor.getState().drawing)).toEqual([T, 1, 1]);

    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([0, 1, 1]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([0, T, T]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T]);
    expect(editor.getState()).toMatchObject({ canUndo: false, canRedo: true });
    editor.undo(); // nothing left: a no-op
    expect(row(editor.getState().drawing)).toEqual([T, T, T]);

    editor.redo();
    editor.redo();
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([T, 1, 1]);
    expect(editor.getState()).toMatchObject({ canUndo: true, canRedo: false });
    editor.redo(); // nothing left: a no-op
    expect(row(editor.getState().drawing)).toEqual([T, 1, 1]);
  });

  it('a new command after undo discards the undone commands', () => {
    const editor = createEditor(createDrawing({ width: 2, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.undo();
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    expect(editor.getState().canRedo).toBe(false);
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([T, 1]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T]);
  });

  it('commands merged into one stroke undo and redo together', () => {
    const editor = createEditor(createDrawing({ width: 4, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 2, points: [{ x: 3, y: 0 }] });
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.apply(
      {
        type: 'pencil',
        color: 0,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      { mergeWithLast: true },
    );
    editor.apply(
      {
        type: 'pencil',
        color: 0,
        points: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      { mergeWithLast: true },
    );
    expect(row(editor.getState().drawing)).toEqual([0, 0, 0, 2]);

    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T, 2]);
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([0, 0, 0, 2]);
  });

  it('a stroke that starts with no visible change is still its own undo step', () => {
    const editor = createEditor(createDrawing({ width: 3, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    // Starts on a pixel that already has this color, then drags on.
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.apply(
      {
        type: 'pencil',
        color: 0,
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      { mergeWithLast: true },
    );
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([0, T, T]);
  });

  it('a pixel changed twice in one step undoes to its value from before the step', () => {
    const editor = createEditor(createDrawing({ width: 2, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 2, points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] }, { mergeWithLast: true });
    editor.apply({ type: 'eraser', points: [{ x: 0, y: 0 }] }, { mergeWithLast: true });
    expect(row(editor.getState().drawing)).toEqual([T, T]);

    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([2, T]);
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([T, T]);
  });

  it('commands that change nothing add no undo step', () => {
    const editor = createEditor(createDrawing({ width: 2, height: 1, palette }));
    editor.apply({ type: 'eraser', points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'fill', color: 1, at: { x: 9, y: 9 } });
    expect(editor.getState().canUndo).toBe(false);
  });

  it('after an undo, a merged command starts a new step instead of joining the undone one', () => {
    const editor = createEditor(createDrawing({ width: 3, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    editor.undo();
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 2, y: 0 }] }, { mergeWithLast: true });
    expect(row(editor.getState().drawing)).toEqual([0, T, 1]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([0, T, T]);
  });

  it('undo and redo notify subscribers, and the state is stable between changes', () => {
    const editor = createEditor(createDrawing({ width: 1, height: 1, palette }));
    let notified = 0;
    editor.subscribe(() => notified++);
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    const state = editor.getState();
    expect(editor.getState()).toBe(state);
    editor.undo();
    editor.redo();
    expect(notified).toBe(3);
    editor.redo(); // no-op: no notification
    expect(notified).toBe(3);
  });
});
