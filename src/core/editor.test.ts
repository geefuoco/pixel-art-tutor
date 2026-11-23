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
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T]);

    editor.redo();
    editor.redo();
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([T, 1, 1]);
    expect(editor.getState()).toMatchObject({ canUndo: true, canRedo: false });
    editor.redo();
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

  it('moves, pastes and mirrored strokes each undo and redo as one step', () => {
    const editor = createEditor(createDrawing({ width: 4, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 2, points: [{ x: 0, y: 0 }], mirror: true });
    expect(row(editor.getState().drawing)).toEqual([2, T, T, 2]);
    editor.apply({ type: 'move', from: { x: 0, y: 0, width: 1, height: 1 }, to: { x: 1, y: 0 } });
    expect(row(editor.getState().drawing)).toEqual([T, 2, T, 2]);
    editor.apply({
      type: 'paste',
      clip: { width: 2, height: 1, pixels: [0, 1] },
      at: { x: 0, y: 0 },
    });
    expect(row(editor.getState().drawing)).toEqual([0, 1, T, 2]);

    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, 2, T, 2]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([2, T, T, 2]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T, T]);
    editor.redo();
    editor.redo();
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([0, 1, T, 2]);
  });

  it('replacing a step takes back its changes and applies the new command as that step', () => {
    const editor = createEditor(createDrawing({ width: 4, height: 1, palette }));
    editor.apply({ type: 'pencil', color: 2, points: [{ x: 3, y: 0 }] });
    const clip = { width: 2, height: 1, pixels: [0, 1] };
    const step = editor.apply({ type: 'paste', clip, at: { x: 0, y: 0 } });
    expect(row(editor.getState().drawing)).toEqual([0, 1, T, 2]);
    expect(editor.replace(step, { type: 'paste', clip, at: { x: 1, y: 0 } })).toBe(true);
    expect(row(editor.getState().drawing)).toEqual([T, 0, 1, 2]);

    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T, 2]);
    editor.redo();
    expect(row(editor.getState().drawing)).toEqual([T, 0, 1, 2]);
  });

  it('a replacement that ends up where the step started leaves no undo step', () => {
    const editor = createEditor(createDrawing({ width: 3, height: 1, palette }));
    const from = { x: 0, y: 0, width: 3, height: 1 };
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    const step = editor.apply({ type: 'move', from, to: { x: 2, y: 0 } });
    expect(row(editor.getState().drawing)).toEqual([T, T, 0]);
    editor.replace(step, { type: 'move', from, to: { x: 0, y: 0 } });
    expect(row(editor.getState().drawing)).toEqual([0, T, T]);
    editor.undo();
    expect(row(editor.getState().drawing)).toEqual([T, T, T]);
  });

  it('a step can no longer be replaced once anything else is applied, undone or redone', () => {
    const editor = createEditor(createDrawing({ width: 3, height: 1, palette }));
    const pencil = (x: number) => ({ type: 'pencil', color: 0, points: [{ x, y: 0 }] }) as const;

    let step = editor.apply(pencil(0));
    editor.undo();
    expect(editor.replace(step, pencil(1))).toBe(false);
    editor.redo();
    expect(editor.replace(step, pencil(1))).toBe(false);

    step = editor.apply(pencil(1));
    editor.apply(pencil(1));
    expect(editor.replace(step, pencil(2))).toBe(false);
    expect(row(editor.getState().drawing)).toEqual([0, 0, T]);

    step = editor.apply(pencil(2));
    editor.apply(pencil(2), { mergeWithLast: true });
    expect(editor.replace(step, { type: 'eraser', points: [{ x: 0, y: 0 }] })).toBe(true);
    expect(row(editor.getState().drawing)).toEqual([T, 0, T]);
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
    editor.redo();
    expect(notified).toBe(3);
  });
});
