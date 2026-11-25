import { describe, expect, it } from 'vitest';
import { stillAnimation } from './animation';
import { TRANSPARENT } from './drawing';
import { createEditor } from './editor';
import { createSelectTool } from './select';
import { drawingOf, rowsOf } from './test-grids';

const T = TRANSPARENT;

function setup(rows: number[][]) {
  const editor = createEditor(stillAnimation(drawingOf(rows)));
  const select = createSelectTool(editor);
  const pixels = () => rowsOf(editor.getState().drawing);
  return { editor, select, pixels };
}

describe('select tool', () => {
  it('drags out a selection, then drags its pixels as one undo step', () => {
    const { editor, select, pixels } = setup([
      [0, 1, T, T],
      [T, T, T, T],
    ]);
    select.press({ x: 0, y: 0 });
    select.drag({ x: 1, y: 0 });
    expect(select.getState().selection).toEqual({ x: 0, y: 0, width: 2, height: 1 });

    select.press({ x: 1, y: 0 });
    select.drag({ x: 2, y: 0 });
    select.drag({ x: 3, y: 1 });
    expect(pixels()).toEqual([
      [T, T, T, T],
      [T, T, 0, 1],
    ]);
    expect(select.getState().selection).toEqual({ x: 2, y: 1, width: 2, height: 1 });

    editor.undo();
    expect(pixels()).toEqual([
      [0, 1, T, T],
      [T, T, T, T],
    ]);
  });

  it('dragging a block again does not pick up what it was dropped on', () => {
    const { editor, select, pixels } = setup([[0, T, 2, T]]);
    select.press({ x: 0, y: 0 });
    select.drag({ x: 1, y: 0 });
    select.press({ x: 0, y: 0 });
    select.drag({ x: 2, y: 0 });
    expect(pixels()).toEqual([[T, T, 0, T]]);
    select.press({ x: 2, y: 0 });
    select.drag({ x: 0, y: 0 });
    expect(pixels()).toEqual([[0, T, 2, T]]);
    expect(editor.getState().canUndo).toBe(false);
  });

  it('once something else changes the drawing, dragging moves what is in the selection now', () => {
    const { editor, select, pixels } = setup([[0, T, T, T]]);
    select.press({ x: 0, y: 0 });
    select.press({ x: 0, y: 0 });
    select.drag({ x: 1, y: 0 });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 3, y: 0 }] });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 3, y: 0 }] });
    select.press({ x: 1, y: 0 });
    select.drag({ x: 2, y: 0 });
    expect(pixels()).toEqual([[T, T, 0, 1]]);
    editor.undo();
    expect(pixels()).toEqual([[T, 0, T, 1]]);
  });

  it('pastes a copy over the selection, ready to drag off the original', () => {
    const { editor, select, pixels } = setup([
      [0, 1, T, T],
      [T, T, T, T],
    ]);
    expect(select.getState()).toMatchObject({ canCopy: false, canPaste: false });
    select.press({ x: 0, y: 0 });
    select.drag({ x: 1, y: 0 });
    select.copy();
    expect(select.getState().canPaste).toBe(true);
    select.paste();
    expect(pixels()).toEqual([
      [0, 1, T, T],
      [T, T, T, T],
    ]);
    select.press({ x: 0, y: 0 });
    select.drag({ x: 2, y: 1 });
    expect(pixels()).toEqual([
      [0, 1, T, T],
      [T, T, 0, 1],
    ]);
    editor.undo();
    expect(pixels()).toEqual([
      [0, 1, T, T],
      [T, T, T, T],
    ]);
  });

  it('pastes at the top-left corner when nothing is selected', () => {
    const { select, pixels } = setup([[T, T, 2]]);
    select.press({ x: 2, y: 0 });
    select.copy();
    select.deselect();
    expect(select.getState()).toMatchObject({ selection: null, canCopy: false });
    select.paste();
    expect(pixels()).toEqual([[2, T, 2]]);
    expect(select.getState().selection).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('copies and pastes only the part of the selection on the canvas', () => {
    const { select, pixels } = setup([[T, 0, 1, T]]);
    select.press({ x: 1, y: 0 });
    select.drag({ x: 2, y: 0 });
    select.press({ x: 1, y: 0 });
    select.drag({ x: -1, y: 0 });
    expect(pixels()).toEqual([[1, T, T, T]]);
    expect(select.getState().selection).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    select.copy();
    select.press({ x: 3, y: 0 });
    select.paste();
    expect(pixels()).toEqual([[1, T, T, 1]]);
  });
});
