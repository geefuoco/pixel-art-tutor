import { describe, expect, it } from 'vitest';
import { TRANSPARENT, createDrawing, getPixel } from './drawing';
import { createEditor } from './editor';

describe('editor', () => {
  it('applies commands to its drawing and tells subscribers when it changes', () => {
    const editor = createEditor(createDrawing({ width: 2, height: 2, palette: ['#000000'] }));
    let notified = 0;
    const unsubscribe = editor.subscribe(() => notified++);

    editor.apply({ type: 'pencil', color: 0, points: [{ x: 1, y: 1 }] });
    expect(getPixel(editor.getDrawing(), 1, 1)).toBe(0);
    expect(notified).toBe(1);

    unsubscribe();
    editor.apply({ type: 'eraser', points: [{ x: 1, y: 1 }] });
    expect(getPixel(editor.getDrawing(), 1, 1)).toBe(TRANSPARENT);
    expect(notified).toBe(1);
  });
});
