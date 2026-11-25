import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { stillAnimation } from '../core/animation';
import { addDays } from '../core/calendar-date';
import { dailyPrompt as promptFor } from '../core/daily-prompt';
import { createDrawing, TRANSPARENT as _ } from '../core/drawing';
import type { Mode } from '../core/lesson';
import { themePrompt, themePromptText } from '../core/theme-prompt';
import { createDailyPrompt, type DailyPrompt } from './daily-prompt';
import { createGallery } from './gallery';
import { openStore } from './store';

const COURSE = ['dot', 'apple'];

async function openDailyPrompt(indexedDB: IDBFactory | undefined, today = '2026-11-25') {
  const dailyPrompt = createDailyPrompt({
    store: openStore(indexedDB),
    today: () => today,
    course: COURSE,
  });
  await dailyPrompt.load();
  return dailyPrompt;
}

function loaded(dailyPrompt: DailyPrompt) {
  const state = dailyPrompt.getState();
  if (state.status !== 'ready') throw new Error('The Daily Prompt has not loaded');
  return state;
}

function ready(dailyPrompt: DailyPrompt) {
  const state = loaded(dailyPrompt);
  if (state.kind !== 'theme') throw new Error('The Daily Prompt is not a Theme Prompt');
  return state;
}

async function passTrace(indexedDB: IDBFactory, lessonId: string, finishedAt: number) {
  await openStore(indexedDB).saveAttempt(
    {
      id: `${lessonId}-${finishedAt}`,
      lessonId,
      mode: 'trace' satisfies Mode,
      animation: stillAnimation(createDrawing({ width: 8, height: 8, palette: ['#000000'] })),
      score: 1,
      hintFlashes: 0,
      inGallery: true,
      finishedAt,
    },
    { passed: true },
  );
}

function reviewDay(): string {
  const none = { course: [], attempts: [] };
  for (let i = 0; i < 365; i++) {
    const date = addDays('2026-11-25', i);
    if (
      promptFor(date, 0, none).drawn === 'review' &&
      promptFor(date, 1, none).drawn !== 'review'
    ) {
      return date;
    }
  }
  throw new Error('No day starting on a Review draw in a year');
}

const LAST_MONTH = new Date(2026, 9, 1, 12).getTime();

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

  it('offers a Review Drill of a passed Lesson on a day that draws one', async () => {
    const indexedDB = new IDBFactory();
    await passTrace(indexedDB, 'apple', LAST_MONTH);
    const date = reviewDay();
    const dailyPrompt = await openDailyPrompt(indexedDB, date);
    expect(loaded(dailyPrompt)).toMatchObject({
      kind: 'review',
      drill: { lessonId: 'apple', mode: 'hint', date, draw: 0 },
    });
  });

  it('gives a Theme Prompt on a day that draws a Review when no Lesson has been passed', async () => {
    const date = reviewDay();
    const dailyPrompt = await openDailyPrompt(new IDBFactory(), date);
    expect(ready(dailyPrompt).prompt).toEqual(themePrompt(date, 0));
  });

  it('gives a Theme Prompt with a blank canvas after a Review Drill', async () => {
    const indexedDB = new IDBFactory();
    await passTrace(indexedDB, 'apple', LAST_MONTH);
    const date = reviewDay();
    const dailyPrompt = await openDailyPrompt(indexedDB, date);
    dailyPrompt.another();
    expect(ready(dailyPrompt).prompt).toEqual(themePrompt(date, 1));
    expect(drawn(dailyPrompt).pixels.every((p) => p === _)).toBe(true);
    await dailyPrompt.flush();

    const reloaded = await openDailyPrompt(indexedDB, date);
    expect(ready(reloaded).prompt).toEqual(themePrompt(date, 1));
  });

  it('keeps a draw that already has a drawing on its Theme Prompt', async () => {
    const indexedDB = new IDBFactory();
    const date = reviewDay();
    const beforeAnyPass = await openDailyPrompt(indexedDB, date);
    dot(beforeAnyPass);
    await beforeAnyPass.flush();
    await passTrace(indexedDB, 'apple', LAST_MONTH);

    const reloaded = await openDailyPrompt(indexedDB, date);
    expect(ready(reloaded).prompt).toEqual(themePrompt(date, 0));
    expect(drawn(reloaded).pixels[0]).toBe(1);
  });
});
