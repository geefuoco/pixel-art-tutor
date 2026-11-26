import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLesson } from '../core/lesson';
import { spriteOf } from '../core/test-grids';
import { createCourseProgress, type CourseProgress } from './course-progress';
import { createLessonPlay } from './lesson-play';
import { openStore } from './store';

const POT = createLesson({
  id: 'pot',
  title: 'Pot',
  roles: ['base'],
  explanations: { silhouette: '', base: '' },
  reference: spriteOf(['B.......', ...new Array<string>(7).fill('........')], 'B', ['#cc3333']),
});

function progressOf(progress: CourseProgress) {
  const state = progress.getState();
  if (state.status !== 'ready') throw new Error('Progress has not loaded');
  return state.progress;
}

async function finishPot(indexedDB: IDBFactory | undefined, progress: CourseProgress, x: number) {
  const store = openStore(indexedDB);
  const play = createLessonPlay({ store, lesson: POT, mode: 'trace', progress });
  await play.load();
  const state = play.getState();
  if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
  state.editor.apply({ type: 'pencil', color: 0, points: [{ x, y: 0 }] });
  return play.finish();
}

describe('Course progress', () => {
  it('starts with nothing passed', async () => {
    const progress = createCourseProgress({ store: openStore(new IDBFactory()) });
    await progress.load();
    expect(progressOf(progress)).toEqual([]);
  });

  it('records a passed Lesson straight away, and keeps it after a reload', async () => {
    const indexedDB = new IDBFactory();
    const progress = createCourseProgress({ store: openStore(indexedDB) });
    await progress.load();
    expect((await finishPot(indexedDB, progress, 0)).passed).toBe(true);
    expect(progressOf(progress)).toEqual([{ lessonId: 'pot', passedModes: ['trace'] }]);

    const reloaded = createCourseProgress({ store: openStore(indexedDB) });
    await reloaded.load();
    expect(progressOf(reloaded)).toEqual([{ lessonId: 'pot', passedModes: ['trace'] }]);
  });

  it('records nothing for an Attempt that did not pass', async () => {
    const indexedDB = new IDBFactory();
    const progress = createCourseProgress({ store: openStore(indexedDB) });
    await progress.load();
    expect((await finishPot(indexedDB, progress, 5)).passed).toBe(false);
    expect(progressOf(progress)).toEqual([]);
  });

  it('keeps a pass made before progress has loaded', async () => {
    const indexedDB = new IDBFactory();
    const progress = createCourseProgress({ store: openStore(indexedDB) });
    await finishPot(indexedDB, progress, 0);
    await progress.load();
    expect(progressOf(progress)).toEqual([{ lessonId: 'pot', passedModes: ['trace'] }]);
  });

  it('unlocks for the rest of the visit when storage is unavailable, and says so', async () => {
    const progress = createCourseProgress({ store: openStore(undefined) });
    await progress.load();
    expect(progress.getState()).toMatchObject({ problem: 'unavailable' });
    await finishPot(undefined, progress, 0);
    expect(progressOf(progress)).toEqual([{ lessonId: 'pot', passedModes: ['trace'] }]);
  });

  it('reloads from the store, as after restoring a backup', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    const progress = createCourseProgress({ store });
    await progress.load();
    const contents = await store.readAll();
    await store.replaceAll({
      ...contents,
      progress: [{ lessonId: 'jar', passedModes: ['trace'] }],
    });
    await progress.reload();
    expect(progressOf(progress)).toEqual([{ lessonId: 'jar', passedModes: ['trace'] }]);
  });
});
