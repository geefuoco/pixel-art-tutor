import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TRANSPARENT as _ } from '../core/drawing';
import { themePrompt, themePromptText } from '../core/theme-prompt';
import { createDailyPrompt, type DailyPrompt } from './daily-prompt';
import { createGallery } from './gallery';
import { openStore } from './store';

async function openDailyPrompt(indexedDB: IDBFactory | undefined, today = '2026-11-25') {
  const dailyPrompt = createDailyPrompt({ store: openStore(indexedDB), today: () => today });
  await dailyPrompt.load();
  return dailyPrompt;
}

function ready(dailyPrompt: DailyPrompt) {
  const state = dailyPrompt.getState();
  if (state.status !== 'ready') throw new Error('The Daily Prompt has not loaded');
  return state;
}

function drawn(dailyPrompt: DailyPrompt) {
  return ready(dailyPrompt).editor.getState().drawing;
}

function dot(dailyPrompt: DailyPrompt, x = 0, y = 0) {
  ready(dailyPrompt).editor.apply({ type: 'pencil', color: 1, points: [{ x, y }] });
}

describe('the Daily Prompt', () => {
  it("starts on the date's Theme Prompt with a blank canvas of its size and palette", async () => {
    const dailyPrompt = await openDailyPrompt(new IDBFactory());
    const expected = themePrompt('2026-11-25');
    expect(ready(dailyPrompt).prompt).toEqual(expected);
    const drawing = drawn(dailyPrompt);
    expect([drawing.width, drawing.height]).toEqual([expected.size, expected.size]);
    expect(drawing.pixels.every((p) => p === _)).toBe(true);
    expect(drawing.palette.length).toBeGreaterThanOrEqual(expected.palette.colors);
  });

  it('resumes the drawing after a reload on the same day', async () => {
    const indexedDB = new IDBFactory();
    const dailyPrompt = await openDailyPrompt(indexedDB);
    dot(dailyPrompt, 1, 0);
    await dailyPrompt.flush();

    const reloaded = await openDailyPrompt(indexedDB);
    expect(drawn(reloaded).pixels.slice(0, 3)).toEqual([_, 1, _]);
  });

  it('starts the next day on its own prompt with a blank canvas', async () => {
    const indexedDB = new IDBFactory();
    const today = await openDailyPrompt(indexedDB, '2026-11-25');
    dot(today);
    await today.flush();

    const tomorrow = await openDailyPrompt(indexedDB, '2026-11-26');
    expect(ready(tomorrow).prompt).toEqual(themePrompt('2026-11-26'));
    expect(drawn(tomorrow).pixels.every((p) => p === _)).toBe(true);
  });

  it('gives another prompt on a blank canvas, and stays on it after a reload', async () => {
    const indexedDB = new IDBFactory();
    const dailyPrompt = await openDailyPrompt(indexedDB);
    dot(dailyPrompt);
    dailyPrompt.another();
    expect(ready(dailyPrompt).prompt).toEqual(themePrompt('2026-11-25', 1));
    expect(drawn(dailyPrompt).pixels.every((p) => p === _)).toBe(true);
    await dailyPrompt.flush();

    const reloaded = await openDailyPrompt(indexedDB);
    expect(ready(reloaded).prompt).toEqual(themePrompt('2026-11-25', 1));
    reloaded.another();
    expect(ready(reloaded).prompt).toEqual(themePrompt('2026-11-25', 2));
  });

  it('puts the drawing in the Gallery only when saved there, with its prompt', async () => {
    const indexedDB = new IDBFactory();
    const gallery = createGallery({ store: openStore(indexedDB) });
    const dailyPrompt = await openDailyPrompt(indexedDB);
    dot(dailyPrompt);
    await dailyPrompt.flush();
    await gallery.refresh();
    const entries = () => {
      const state = gallery.getState();
      return state.status === 'ready' ? state.entries : [];
    };
    expect(entries()).toEqual([]);

    await dailyPrompt.saveToGallery();
    expect(ready(dailyPrompt).inGallery).toBe(true);
    await gallery.refresh();
    expect(entries()).toMatchObject([
      {
        kind: 'prompt',
        promptDrawing: {
          date: '2026-11-25',
          draw: 0,
          text: themePromptText(themePrompt('2026-11-25')),
          inGallery: true,
        },
      },
    ]);

    dailyPrompt.another();
    expect(ready(dailyPrompt).inGallery).toBe(false);
    const reloaded = await openDailyPrompt(indexedDB);
    expect(ready(reloaded).inGallery).toBe(false);
  });

  it('keeps edits made after saving to the Gallery in the Gallery entry', async () => {
    const indexedDB = new IDBFactory();
    const dailyPrompt = await openDailyPrompt(indexedDB);
    await dailyPrompt.saveToGallery();
    dot(dailyPrompt, 2, 0);
    await dailyPrompt.flush();
    const gallery = createGallery({ store: openStore(indexedDB) });
    await gallery.refresh();
    const state = gallery.getState();
    const entry = state.status === 'ready' ? state.entries[0] : undefined;
    expect(
      entry?.kind === 'prompt' && entry.promptDrawing.animation.frames[0]!.slice(0, 3),
    ).toEqual([_, _, 1]);
  });

  it('still lets the learner draw when storage is unavailable, and says so', async () => {
    const dailyPrompt = await openDailyPrompt(undefined);
    expect(ready(dailyPrompt).problem).toBe('unavailable');
    dot(dailyPrompt);
    await dailyPrompt.flush();
    expect(drawn(dailyPrompt).pixels[0]).toBe(1);
    expect(ready(dailyPrompt).problem).toBe('unavailable');
  });
});
