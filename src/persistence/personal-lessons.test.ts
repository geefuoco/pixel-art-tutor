import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Role } from '../core/lesson';
import { spriteOf } from '../core/test-grids';
import { createPersonalLessons, type PersonalLessons } from './personal-lessons';
import { openStore, StorageError } from './store';

const JAR = spriteOf(
  ['.OOOOOO.', 'ORRRRDDO', 'ORRRDDDO', '.OOOOOO.', '........', '........', '........', '........'],
  'ORD',
  ['#1a1a2e', '#cc3333', '#881c1c'],
);
const ROLES: Role[] = ['outline', 'base', 'shadow'];

function ready(lessons: PersonalLessons) {
  const state = lessons.getState();
  if (state.status !== 'ready') throw new Error('Personal Lessons have not loaded');
  return state;
}

function session(indexedDB: IDBFactory | undefined) {
  let n = 0;
  let time = 1000;
  return createPersonalLessons({
    store: openStore(indexedDB),
    newId: () => `personal-${++n}`,
    now: () => (time += 10),
  });
}

describe('Personal Lessons', () => {
  it('keeps each saved Personal Lesson for later visits, oldest first', async () => {
    const indexedDB = new IDBFactory();
    const first = session(indexedDB);
    await first.load();
    expect(ready(first).lessons).toEqual([]);
    const jar = await first.add({ title: 'Jar', reference: JAR, roles: ROLES });
    await first.add({ title: 'Flat jar', reference: JAR, roles: ['outline', 'base', 'base'] });
    expect(ready(first).lessons.map((l) => l.title)).toEqual(['Jar', 'Flat jar']);

    const later = session(indexedDB);
    await later.load();
    const [kept, flat] = ready(later).lessons;
    expect(kept).toEqual(jar);
    expect(kept!.steps.map((s) => s.kind)).toEqual(['silhouette', 'outline', 'base', 'shadow']);
    expect(flat!.steps.map((s) => s.kind)).toEqual(['silhouette', 'outline', 'base']);
    expect(ready(later).problem).toBeNull();
  });

  it('says when storage is unavailable, and refuses to save', async () => {
    const lessons = session(undefined);
    await lessons.load();
    expect(ready(lessons)).toMatchObject({ lessons: [], problem: 'unavailable' });
    await expect(lessons.add({ title: 'Jar', reference: JAR, roles: ROLES })).rejects.toThrow(
      StorageError,
    );
    expect(ready(lessons).lessons).toEqual([]);
  });
});
