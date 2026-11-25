import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TRANSPARENT as _, type Drawing } from '../core/drawing';
import { createAnimationLesson, createLesson, type Lesson, type Mode } from '../core/lesson';
import { spriteOf } from '../core/test-grids';
import { createCourseProgress } from './course-progress';
import { createLessonPlay, type LessonPlay } from './lesson-play';
import { openStore } from './store';

const PALETTE = ['#111111', '#cc3333'];

function lessonOf(id: string): Lesson {
  return createLesson({
    id,
    title: id,
    roles: ['outline', 'base'],
    explanations: { silhouette: '', outline: '', base: '' },
    reference: spriteOf(
      [
        'OBBO....',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
      ],
      'OB',
      PALETTE,
    ),
  });
}

const POT = lessonOf('pot');

async function play(
  indexedDB: IDBFactory | undefined,
  lesson = POT,
  now = () => 1000,
  mode: Mode = 'trace',
) {
  const store = openStore(indexedDB);
  const progress = createCourseProgress({ store });
  const p = createLessonPlay({ store, lesson, mode, progress, now });
  await p.load();
  return p;
}

function ready(p: LessonPlay) {
  const state = p.getState();
  if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
  return state;
}

const drawingOf = (p: LessonPlay): Drawing => ready(p).editor.getState().drawing;

function draw(p: LessonPlay, color: number, ...xs: number[]) {
  for (const x of xs) ready(p).editor.apply({ type: 'pencil', color, points: [{ x, y: 0 }] });
}

const firstRow = (d: Drawing) => d.pixels.slice(0, 8);

describe('playing a Lesson', () => {
  it('starts on a blank canvas the size of the Lesson, in its fixed palette', async () => {
    const drawing = drawingOf(await play(new IDBFactory()));
    expect([drawing.width, drawing.height, drawing.palette]).toEqual([8, 8, PALETTE]);
    expect(drawing.pixels.every((p) => p === _)).toBe(true);
  });

  it('autosaves the in-progress Attempt and resumes it after a reload, one per Lesson and Mode', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    const jar = await play(indexedDB, lessonOf('jar'));
    draw(jar, 1, 1);
    await Promise.all([pot.flush(), jar.flush()]);

    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, _, _, 0, _, _, _, _]);
    expect(firstRow(drawingOf(await play(indexedDB, lessonOf('jar'))))).toEqual([
      _,
      1,
      _,
      _,
      _,
      _,
      _,
      _,
    ]);
    expect(ready(await play(indexedDB)).editor.getState().canUndo).toBe(false);
  });

  it('finishing saves the Attempt with its Lesson, Mode, drawing, score and date', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 5000);
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);

    expect(await pot.finish()).toEqual({ score: 1, passed: true, hintFlashes: 0, inGallery: true });
    expect(ready(pot).result).toEqual({ score: 1, passed: true, hintFlashes: 0, inGallery: true });
    const attempts = await openStore(indexedDB).listAttempts();
    expect(attempts).toEqual([
      {
        id: expect.any(String),
        lessonId: 'pot',
        mode: 'trace',
        animation: {
          width: 8,
          height: 8,
          palette: PALETTE,
          frames: [[0, 1, 1, 0, ...new Array<number>(60).fill(_)]],
          fps: 8,
        },
        score: 1,
        hintFlashes: 0,
        inGallery: true,
        finishedAt: 5000,
      },
    ]);
    expect(drawingOf(await play(indexedDB)).pixels.every((p) => p === _)).toBe(true);
  });

  it('keeps a drawing that did not pass in progress, saving the Attempt too', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    expect(await pot.finish()).toMatchObject({ score: 0.5, passed: false });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([{ score: 0.5 }]);
    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, _, _, 0, _, _, _, _]);

    pot.dismissResult();
    expect(ready(pot).result).toBeNull();
    draw(pot, 1, 1);
    await pot.flush();
    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, 1, _, 0, _, _, _, _]);
  });

  it('saves a finished Attempt that did not pass to the Gallery on request', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    expect(await pot.finish()).toMatchObject({ passed: false, inGallery: false });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([{ inGallery: false }]);

    await pot.saveToGallery();

    expect(ready(pot).result).toMatchObject({ score: 0.5, passed: false, inGallery: true });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      { score: 0.5, inGallery: true },
    ]);
  });

  it('starting over clears the drawing and the in-progress Attempt', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0);
    await pot.startOver();
    expect(drawingOf(pot).pixels.every((p) => p === _)).toBe(true);
    expect(drawingOf(await play(indexedDB)).pixels.every((p) => p === _)).toBe(true);
    expect(await openStore(indexedDB).listAttempts()).toEqual([]);
  });

  it('counts each Guide flash in Hint on the Attempt, without lowering its score', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 1000, 'hint');
    expect(ready(pot).hintFlashes).toBe(0);
    pot.flashGuide();
    pot.flashGuide();
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);
    pot.flashGuide();
    expect(ready(pot).hintFlashes).toBe(3);

    expect(await pot.finish()).toEqual({ score: 1, passed: true, hintFlashes: 3, inGallery: true });
    pot.flashGuide();
    expect(ready(pot).result).toEqual({ score: 1, passed: true, hintFlashes: 3, inGallery: true });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      { mode: 'hint', score: 1, hintFlashes: 3 },
    ]);
  });

  it('keeps the flash count of an in-progress Attempt across a reload, until starting over', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 1000, 'hint');
    pot.flashGuide();
    pot.flashGuide();
    await pot.flush();

    const resumed = await play(indexedDB, POT, () => 1000, 'hint');
    expect(ready(resumed).hintFlashes).toBe(2);
    expect(ready(await play(indexedDB)).hintFlashes).toBe(0);

    await resumed.startOver();
    expect(ready(resumed).hintFlashes).toBe(0);
    expect(ready(await play(indexedDB, POT, () => 1000, 'hint')).hintFlashes).toBe(0);
  });

  it('can still be played when storage is unavailable, and says so', async () => {
    const pot = await play(undefined);
    expect(ready(pot).problem).toBe('unavailable');
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);
    expect(await pot.finish()).toMatchObject({ score: 1, passed: true, inGallery: false });
    expect(ready(pot).problem).toBe('unavailable');
    await pot.saveToGallery();
    expect(ready(pot).result).toMatchObject({ inGallery: false });
  });
});

describe('playing a Lesson in Freehand', () => {
  const freehand = (indexedDB: IDBFactory | undefined, now = () => 1000) =>
    play(indexedDB, POT, now, 'freehand');
  const drawAt = (p: LessonPlay, y: number, ...pixels: [x: number, color: number][]) => {
    for (const [x, color] of pixels) {
      ready(p).editor.apply({ type: 'pencil', color, points: [{ x, y }] });
    }
  };

  it('scores a shifted copy with sub-scores, passes it, and saves it to the Gallery', async () => {
    const indexedDB = new IDBFactory();
    const pot = await freehand(indexedDB, () => 7000);
    drawAt(pot, 5, [2, 0], [3, 1], [4, 1], [5, 0]);

    const expected = {
      score: 1,
      passed: true,
      hintFlashes: 0,
      inGallery: true,
      subScores: { shape: 1, palette: 1, lineQuality: 1 },
      mistakes: [[]],
    };
    expect(await pot.finish()).toEqual(expected);
    expect(ready(pot).result).toEqual(expected);
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      {
        lessonId: 'pot',
        mode: 'freehand',
        score: 1,
        subScores: { shape: 1, palette: 1, lineQuality: 1 },
        inGallery: true,
        finishedAt: 7000,
      },
    ]);
    expect(await openStore(indexedDB).listProgress()).toEqual([
      { lessonId: 'pot', passedModes: ['freehand'] },
    ]);
  });

  it('saves every finished Freehand drawing to the Gallery, even one that did not pass', async () => {
    const indexedDB = new IDBFactory();
    const pot = await freehand(indexedDB);
    drawAt(pot, 5, [2, 0]);

    const result = await pot.finish();
    expect(result).toMatchObject({ passed: false, inGallery: true });
    expect(result.mistakes).toEqual([[{ kind: 'orphan-pixel', pixels: [{ x: 2, y: 5 }] }]]);
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      { mode: 'freehand', inGallery: true },
    ]);
    expect(await openStore(indexedDB).listProgress()).toEqual([]);
  });

  it('enlarges the canvas up to 64x64, autosaving it so it resumes enlarged', async () => {
    const indexedDB = new IDBFactory();
    const pot = await freehand(indexedDB);
    drawAt(pot, 0, [0, 0]);
    pot.enlargeCanvas(32);
    drawAt(pot, 31, [31, 1]);
    await pot.flush();

    const resumed = drawingOf(await freehand(indexedDB));
    expect([resumed.width, resumed.height]).toEqual([32, 32]);
    expect(resumed.pixels[12 * 32 + 12]).toBe(0);
    expect(resumed.pixels[31 * 32 + 31]).toBe(1);

    await pot.startOver();
    expect([drawingOf(pot).width, drawingOf(pot).height]).toEqual([8, 8]);
  });
});

describe('playing an animation Lesson', () => {
  const rowOf = (row: string) => [
    ...spriteOf([row], 'OB', PALETTE).pixels,
    ...new Array<number>(56).fill(_),
  ];
  const BOB = createAnimationLesson({
    id: 'bob',
    title: 'Bob',
    roles: ['outline', 'base'],
    animation: {
      width: 8,
      height: 8,
      palette: PALETTE,
      fps: 5,
      frames: [rowOf('OBBO....'), rowOf('.OBBO...'), rowOf('..OBBO..')],
    },
    frameSteps: [
      { frame: 0, pose: 'key', explanation: '' },
      { frame: 2, pose: 'key', explanation: '' },
      { frame: 1, pose: 'in-between', explanation: '' },
    ],
  });
  const animationOf = (p: LessonPlay) => ready(p).editor.getState().animation;
  const drawFrame = (p: LessonPlay, frame: number, row: string) => {
    ready(p).editor.selectFrame(frame);
    [...row].forEach((c, x) => c !== '.' && draw(p, 'OB'.indexOf(c), x));
  };

  it('starts with one blank Frame for each Reference Frame, at the Lesson FPS', async () => {
    const animation = animationOf(await play(new IDBFactory(), BOB));
    expect(animation.fps).toBe(5);
    expect(animation.frames).toHaveLength(3);
    expect(animation.frames.every((f) => f.every((p) => p === _))).toBe(true);
  });

  it('autosaves every Frame and resumes them after a reload', async () => {
    const indexedDB = new IDBFactory();
    const bob = await play(indexedDB, BOB);
    drawFrame(bob, 0, 'OBBO....');
    drawFrame(bob, 2, '..OBBO..');
    await bob.flush();

    const frames = animationOf(await play(indexedDB, BOB)).frames;
    expect(frames.map((f) => f.slice(0, 8))).toEqual([
      [0, 1, 1, 0, _, _, _, _],
      [_, _, _, _, _, _, _, _],
      [_, _, 0, 1, 1, 0, _, _],
    ]);
  });

  it('scores the Attempt over every Frame and saves the whole animation', async () => {
    const indexedDB = new IDBFactory();
    const bob = await play(indexedDB, BOB);
    drawFrame(bob, 0, 'OBBO....');
    drawFrame(bob, 2, '..OBBO..');
    expect(await bob.finish()).toMatchObject({ score: 8 / 12, passed: false });

    drawFrame(bob, 1, '.OBBO...');
    expect(await bob.finish()).toMatchObject({ score: 1, passed: true });
    const passed = (await openStore(indexedDB).listAttempts()).find((a) => a.score === 1);
    expect(passed!.animation).toEqual(BOB.animation);
  });

  it('enlarges every Frame in Freehand, keeping each Frame where it was drawn', async () => {
    const indexedDB = new IDBFactory();
    const bob = await play(indexedDB, BOB, () => 1000, 'freehand');
    drawFrame(bob, 1, '.O......');
    bob.enlargeCanvas(16);
    await bob.flush();

    const resumed = animationOf(await play(indexedDB, BOB, () => 1000, 'freehand'));
    expect([resumed.width, resumed.frames.length]).toEqual([16, 3]);
    expect(resumed.frames[1]![4 * 16 + 5]).toBe(0);
  });
});
