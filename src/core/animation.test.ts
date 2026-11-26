import { describe, expect, it } from 'vitest';
import { TRANSPARENT as _, createDrawing } from './drawing';
import { createEditor } from './editor';
import { onionSkins, previewFrame, stillAnimation, type Animation } from './animation';

const palette = ['#000000', '#ffffff'];

function editorWithFrames(count: number) {
  const editor = createEditor(stillAnimation(createDrawing({ width: 2, height: 1, palette })));
  editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
  for (let i = 1; i < count; i++) {
    editor.applyToFrames({ type: 'add-frame', at: i });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    editor.apply({ type: 'pencil', color: i % 2, points: [{ x: 0, y: 0 }] });
  }
  return editor;
}

describe('Frames', () => {
  it('a still drawing is one Frame, and adding a Frame inserts a blank one and moves to it', () => {
    const editor = createEditor(stillAnimation(createDrawing({ width: 2, height: 1, palette })));
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    expect(editor.getState().animation.frames).toEqual([[0, _]]);

    editor.applyToFrames({ type: 'add-frame', at: 1 });
    expect(editor.getState()).toMatchObject({
      frame: 1,
      drawing: { width: 2, height: 1, palette, pixels: [_, _] },
    });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    expect(editor.getState().animation.frames).toEqual([
      [0, _],
      [_, 1],
    ]);
  });

  it('a Frame can be added as a copy of another', () => {
    const editor = editorWithFrames(2);
    editor.applyToFrames({ type: 'add-frame', at: 0, copyOf: 1 });
    expect(editor.getState().frame).toBe(0);
    expect(editor.getState().animation.frames).toEqual([
      [1, 1],
      [0, _],
      [1, 1],
    ]);
  });

  it('removing a Frame moves to the one that took its place, and the last Frame cannot be removed', () => {
    const editor = editorWithFrames(3);
    editor.selectFrame(1);
    editor.applyToFrames({ type: 'remove-frame', frame: 1 });
    expect(editor.getState().frame).toBe(1);
    expect(editor.getState().animation.frames).toEqual([
      [0, _],
      [0, 1],
    ]);

    editor.applyToFrames({ type: 'remove-frame', frame: 1 });
    expect(editor.getState().frame).toBe(0);
    editor.applyToFrames({ type: 'remove-frame', frame: 0 });
    expect(editor.getState().animation.frames).toEqual([[0, _]]);
  });

  it('removing or moving another Frame keeps editing the same Frame', () => {
    const editor = editorWithFrames(3);
    editor.applyToFrames({ type: 'remove-frame', frame: 0 });
    expect(editor.getState()).toMatchObject({ frame: 1, drawing: { pixels: [0, 1] } });
    editor.applyToFrames({ type: 'add-frame', at: 2 });
    editor.selectFrame(1);
    editor.applyToFrames({ type: 'move-frame', from: 0, to: 2 });
    expect(editor.getState()).toMatchObject({ frame: 0, drawing: { pixels: [0, 1] } });
    editor.applyToFrames({ type: 'move-frame', from: 2, to: 1 });
    expect(editor.getState()).toMatchObject({ frame: 0, drawing: { pixels: [0, 1] } });
    editor.applyToFrames({ type: 'move-frame', from: 1, to: 0 });
    expect(editor.getState()).toMatchObject({ frame: 1, drawing: { pixels: [0, 1] } });
  });

  it('moving a Frame reorders the Frames and follows the moved Frame', () => {
    const editor = editorWithFrames(3);
    editor.applyToFrames({ type: 'move-frame', from: 2, to: 0 });
    expect(editor.getState().frame).toBe(0);
    expect(editor.getState().animation.frames).toEqual([
      [0, 1],
      [0, _],
      [1, 1],
    ]);
  });

  it('Frame changes undo and redo, returning to the Frame that was being edited', () => {
    const editor = editorWithFrames(2);
    const before = editor.getState().animation.frames;
    editor.selectFrame(0);
    editor.applyToFrames({ type: 'remove-frame', frame: 0 });
    editor.applyToFrames({ type: 'add-frame', at: 1 });

    editor.undo();
    editor.undo();
    expect(editor.getState()).toMatchObject({ frame: 0, animation: { frames: before } });
    editor.redo();
    expect(editor.getState()).toMatchObject({ frame: 0, animation: { frames: [[1, 1]] } });
    editor.redo();
    expect(editor.getState()).toMatchObject({
      frame: 1,
      animation: {
        frames: [
          [1, 1],
          [_, _],
        ],
      },
    });
  });

  it('undoing a drawing command goes back to the Frame it was drawn on', () => {
    const editor = editorWithFrames(2);
    editor.selectFrame(0);
    editor.undo();
    expect(editor.getState()).toMatchObject({ frame: 1, drawing: { pixels: [_, 1] } });
    editor.selectFrame(0);
    editor.redo();
    expect(editor.getState()).toMatchObject({ frame: 1, drawing: { pixels: [1, 1] } });
  });

  it('moving to another Frame ends the stroke, so a stroke never spans two Frames', () => {
    const editor = editorWithFrames(2);
    editor.apply({ type: 'eraser', points: [{ x: 0, y: 0 }] });
    editor.selectFrame(0);
    editor.apply({ type: 'eraser', points: [{ x: 0, y: 0 }] }, { mergeWithLast: true });
    expect(editor.getState().animation.frames).toEqual([
      [_, _],
      [_, 1],
    ]);
    editor.undo();
    expect(editor.getState().animation.frames).toEqual([
      [0, _],
      [_, 1],
    ]);
  });

  it('the FPS belongs to the whole animation and changing it can be undone', () => {
    const editor = editorWithFrames(2);
    editor.applyToFrames({ type: 'set-fps', fps: 12 });
    expect(editor.getState()).toMatchObject({ frame: 1, animation: { fps: 12 } });
    editor.undo();
    expect(editor.getState().animation.fps).toBe(8);
  });

  it('rejects Frames that do not exist and FPS outside 1 to 30', () => {
    const editor = editorWithFrames(2);
    expect(() => editor.selectFrame(2)).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'add-frame', at: 3 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'add-frame', at: 0, copyOf: 2 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'remove-frame', frame: -1 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'move-frame', from: 0, to: 2 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'set-fps', fps: 0 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'set-fps', fps: 31 })).toThrow(RangeError);
    expect(() => editor.applyToFrames({ type: 'set-fps', fps: 2.5 })).toThrow(RangeError);
    expect(editor.getState().canRedo).toBe(false);
  });
});

describe('onion skins', () => {
  const animation: Animation = {
    width: 1,
    height: 1,
    palette,
    frames: [[0], [1], [_]],
    fps: 8,
  };

  it('show the Frames either side of the current one', () => {
    expect(onionSkins(animation, 1)).toEqual({ previous: [0], next: [_] });
  });

  it('do not wrap around past the first or last Frame', () => {
    expect(onionSkins(animation, 0)).toEqual({ previous: null, next: [1] });
    expect(onionSkins(animation, 2)).toEqual({ previous: [1], next: null });
    expect(onionSkins({ ...animation, frames: [[0]] }, 0)).toEqual({ previous: null, next: null });
  });
});

describe('looping preview', () => {
  it('shows each Frame for one tick of the FPS and then loops', () => {
    const at = (ms: number) => previewFrame(ms, { fps: 4, frameCount: 3 });
    expect([0, 249, 250, 500, 749, 750, 1000, 3000].map(at)).toEqual([0, 0, 1, 2, 2, 0, 1, 0]);
  });
});
