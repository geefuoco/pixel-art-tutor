import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawing, TRANSPARENT } from '../core/drawing';
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
