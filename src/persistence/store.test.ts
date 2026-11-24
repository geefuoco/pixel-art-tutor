import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawing, TRANSPARENT } from '../core/drawing';
import type { Mode } from '../core/lesson';
import { openStore, StorageError } from './store';

const PALETTE = ['#000000', '#ff0000'];

describe('store: Studio drawings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips drawings into a fresh store over the same database, most recently changed first', async () => {
    const indexedDB = new IDBFactory();
    const older = {
      ...createDrawing({ width: 2, height: 1, palette: PALETTE }),
      pixels: [1, TRANSPARENT],
    };
    const newer = { ...createDrawing({ width: 1, height: 2, palette: PALETTE }), pixels: [0, 1] };
    const store = openStore(indexedDB);
    await store.putStudioDrawing({ id: 'b', drawing: older, updatedAt: 100 });
    await store.putStudioDrawing({ id: 'a', drawing: newer, updatedAt: 200 });

    const reopened = openStore(indexedDB);
    expect(await reopened.listStudioDrawings()).toEqual([
      {
        id: 'a',
        updatedAt: 200,
        drawing: { width: 1, height: 2, palette: PALETTE, pixels: [0, 1] },
      },
      {
        id: 'b',
        updatedAt: 100,
        drawing: { width: 2, height: 1, palette: PALETTE, pixels: [1, -1] },
      },
    ]);
  });

  it('reports storage as unavailable when the browser has no IndexedDB', async () => {
    const store = openStore(undefined);
    await expect(store.listStudioDrawings()).rejects.toThrow(StorageError);
    await expect(store.listStudioDrawings()).rejects.toMatchObject({ problem: 'unavailable' });
  });

  it('reports storage as full when a write goes over the quota, keeping what was saved', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    const drawing = createDrawing({ width: 1, height: 1, palette: PALETTE });
    await store.putStudioDrawing({ id: 'a', drawing, updatedAt: 1 });

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const write = store.putStudioDrawing({ id: 'b', drawing, updatedAt: 2 });
    await expect(write).rejects.toThrow(StorageError);
    await expect(write).rejects.toMatchObject({ problem: 'full' });
    vi.restoreAllMocks();

    expect((await openStore(indexedDB).listStudioDrawings()).map((d) => d.id)).toEqual(['a']);
  });
});

describe('store: custom palettes', () => {
  it('round-trips custom palettes in name order, and deletes one', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    await store.putCustomPalette({ id: 'p1', name: 'Swamp', colors: ['#112233', '#445566'] });
    await store.putCustomPalette({ id: 'p2', name: 'autumn', colors: ['#aa5500'] });
    await store.putCustomPalette({ id: 'p3', name: 'Ice', colors: ['#ddeeff'] });
    await store.putCustomPalette({ id: 'p1', name: 'Bog', colors: ['#112233'] });
    await store.deleteCustomPalette('p3');

    expect(await openStore(indexedDB).listCustomPalettes()).toEqual([
      { id: 'p2', name: 'autumn', colors: ['#aa5500'] },
      { id: 'p1', name: 'Bog', colors: ['#112233'] },
    ]);
  });

  it('keeps drawings saved before custom palettes existed', async () => {
    const indexedDB = new IDBFactory();
    const drawing = createDrawing({ width: 1, height: 1, palette: PALETTE });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixel-art-tutor', 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore('studio-drawings', { keyPath: 'id' })
          .put({ id: 'old', drawing, updatedAt: 1 });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const store = openStore(indexedDB);
    expect(await store.listStudioDrawings()).toEqual([{ id: 'old', drawing, updatedAt: 1 }]);
    expect(await store.listCustomPalettes()).toEqual([]);
    await store.putCustomPalette({ id: 'p', name: 'New', colors: ['#000000'] });
    expect(await store.listCustomPalettes()).toHaveLength(1);
  });
});

describe('store: progress', () => {
  const drawing = createDrawing({ width: 1, height: 1, palette: PALETTE });
  const attempt = (id: string, lessonId: string, mode: Mode, score: number) => ({
    id,
    lessonId,
    mode,
    drawing,
    score,
    hintFlashes: 0,
    inGallery: false,
    finishedAt: 1,
  });

  it('records a pass with the passing Attempt, once per Lesson and Mode', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    await store.saveAttempt(attempt('1', 'pot', 'trace', 1), { passed: true });
    await store.saveAttempt(attempt('2', 'pot', 'trace', 0.96), { passed: true });
    await store.saveAttempt(attempt('3', 'pot', 'hint', 0.2), { passed: false });
    await store.saveAttempt(attempt('4', 'jar', 'trace', 0.5), { passed: false });

    expect(await openStore(indexedDB).listProgress()).toEqual([
      { lessonId: 'pot', passedModes: ['trace'] },
    ]);
  });

  it('works out progress from the passing Attempts saved before progress was kept', async () => {
    const indexedDB = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixel-art-tutor', 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('studio-drawings', { keyPath: 'id' });
        db.createObjectStore('custom-palettes', { keyPath: 'id' });
        db.createObjectStore('in-progress-attempts', { keyPath: ['lessonId', 'mode'] });
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.put(attempt('1', 'pot', 'trace', 0.95));
        attempts.put(attempt('2', 'jar', 'trace', 0.94));
        attempts.put(attempt('3', 'pot', 'trace', 1));
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const store = openStore(indexedDB);
    expect(await store.listProgress()).toEqual([{ lessonId: 'pot', passedModes: ['trace'] }]);
    expect(await store.listAttempts()).toHaveLength(3);
  });
});

describe('store: Hint flash counts', () => {
  it('reads Attempts saved before flashes were counted as having none', async () => {
    const indexedDB = new IDBFactory();
    const drawing = createDrawing({ width: 1, height: 1, palette: PALETTE });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixel-art-tutor', 4);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('studio-drawings', { keyPath: 'id' });
        db.createObjectStore('custom-palettes', { keyPath: 'id' });
        db.createObjectStore('progress', { keyPath: 'lessonId' });
        db.createObjectStore('attempts', { keyPath: 'id' }).put({
          id: '1',
          lessonId: 'pot',
          mode: 'trace',
          drawing,
          score: 0.5,
          finishedAt: 1,
        });
        db.createObjectStore('in-progress-attempts', { keyPath: ['lessonId', 'mode'] }).put({
          lessonId: 'pot',
          mode: 'hint',
          drawing,
          updatedAt: 2,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const store = openStore(indexedDB);
    expect(await store.listAttempts()).toEqual([
      {
        id: '1',
        lessonId: 'pot',
        mode: 'trace',
        drawing,
        score: 0.5,
        hintFlashes: 0,
        inGallery: false,
        finishedAt: 1,
      },
    ]);
    expect(await store.getInProgressAttempt('pot', 'hint')).toEqual({
      lessonId: 'pot',
      mode: 'hint',
      drawing,
      hintFlashes: 0,
      updatedAt: 2,
    });
  });
});

describe('store: Gallery', () => {
  const drawing = createDrawing({ width: 1, height: 1, palette: PALETTE });
  const attempt = (id: string, score: number, inGallery: boolean) => ({
    id,
    lessonId: 'pot',
    mode: 'trace' as const,
    drawing,
    score,
    hintFlashes: 0,
    inGallery,
    finishedAt: Number(id),
  });

  it('saves an Attempt that did not pass to the Gallery on request, keeping the rest of it', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    await store.saveAttempt(attempt('1', 0.5, false), { passed: false });
    await store.saveAttempt(attempt('2', 0.4, false), { passed: false });

    await store.saveAttemptToGallery('1');

    expect(await openStore(indexedDB).listAttempts()).toEqual([
      attempt('2', 0.4, false),
      attempt('1', 0.5, true),
    ]);
  });

  it('does nothing when asked to save an Attempt that is not there', async () => {
    const store = openStore(new IDBFactory());
    await store.saveAttemptToGallery('missing');
    expect(await store.listAttempts()).toEqual([]);
  });

  it('puts the passing Attempts saved before the Gallery existed in it, and no others', async () => {
    const indexedDB = new IDBFactory();
    const beforeTheGallery = (id: string, score: number) => {
      const record: Record<string, unknown> = { ...attempt(id, score, false) };
      delete record.inGallery;
      return record;
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixel-art-tutor', 5);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('studio-drawings', { keyPath: 'id' });
        db.createObjectStore('custom-palettes', { keyPath: 'id' });
        db.createObjectStore('progress', { keyPath: 'lessonId' });
        db.createObjectStore('in-progress-attempts', { keyPath: ['lessonId', 'mode'] });
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.put(beforeTheGallery('1', 0.95));
        attempts.put(beforeTheGallery('2', 0.94));
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    expect(await openStore(indexedDB).listAttempts()).toEqual([
      attempt('2', 0.94, false),
      attempt('1', 0.95, true),
    ]);
  });
});
