import type { Drawing } from '../core/drawing';
import type { CustomPalette } from '../core/palettes';

export interface SavedDrawing {
  readonly id: string;
  readonly drawing: Drawing;
  readonly updatedAt: number;
}

export interface StoreContents {
  readonly studioDrawings: readonly SavedDrawing[];
  readonly customPalettes: readonly CustomPalette[];
}

export interface Store {
  listStudioDrawings(): Promise<SavedDrawing[]>;
  putStudioDrawing(entry: SavedDrawing): Promise<void>;
  listCustomPalettes(): Promise<CustomPalette[]>;
  putCustomPalette(palette: CustomPalette): Promise<void>;
  deleteCustomPalette(id: string): Promise<void>;
  readAll(): Promise<StoreContents>;
  replaceAll(contents: StoreContents): Promise<void>;
}

export type StorageProblem = 'unavailable' | 'full';

export class StorageError extends Error {
  readonly problem: StorageProblem;
  constructor(problem: StorageProblem, options?: { cause?: unknown }) {
    super(
      problem === 'full' ? 'Browser storage is full' : 'Browser storage is unavailable',
      options,
    );
    this.name = 'StorageError';
    this.problem = problem;
  }
}

function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const full = (error as { name?: unknown } | null)?.name === 'QuotaExceededError';
  return new StorageError(full ? 'full' : 'unavailable', { cause: error });
}

const DB_NAME = 'pixel-art-tutor';
const DB_VERSION = 2;
const STUDIO_DRAWINGS = 'studio-drawings';
const CUSTOM_PALETTES = 'custom-palettes';
const OBJECT_STORES = [STUDIO_DRAWINGS, CUSTOM_PALETTES];

type ObjectStoreName = (typeof OBJECT_STORES)[number];

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of OBJECT_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openStore(factory: IDBFactory | undefined): Store {
  let database: Promise<IDBDatabase> | undefined;

  async function transact<T>(
    mode: IDBTransactionMode,
    run: (objectStore: (name: ObjectStoreName) => IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    try {
      if (!factory) throw new StorageError('unavailable');
      database ??= openDatabase(factory).then((db) => {
        db.onclose = () => (database = undefined);
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        return db;
      });
      database.catch(() => (database = undefined));
      const transaction = (await database).transaction(OBJECT_STORES, mode);
      let request: IDBRequest<T>;
      try {
        request = run((name) => transaction.objectStore(name));
      } catch (error) {
        transaction.abort();
        throw error;
      }
      return await new Promise<T>((resolve, reject) => {
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? request.error);
      });
    } catch (error) {
      throw toStorageError(error);
    }
  }

  return {
    async listStudioDrawings() {
      const all = await transact<SavedDrawing[]>('readonly', (objectStore) =>
        objectStore(STUDIO_DRAWINGS).getAll(),
      );
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async putStudioDrawing(entry) {
      await transact('readwrite', (objectStore) => objectStore(STUDIO_DRAWINGS).put(entry));
    },
    async listCustomPalettes() {
      const all = await transact<CustomPalette[]>('readonly', (objectStore) =>
        objectStore(CUSTOM_PALETTES).getAll(),
      );
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
    async putCustomPalette(palette) {
      await transact('readwrite', (objectStore) => objectStore(CUSTOM_PALETTES).put(palette));
    },
    async deleteCustomPalette(id) {
      await transact('readwrite', (objectStore) => objectStore(CUSTOM_PALETTES).delete(id));
    },
    async readAll() {
      const [studioDrawings, customPalettes] = await Promise.all([
        this.listStudioDrawings(),
        this.listCustomPalettes(),
      ]);
      return { studioDrawings, customPalettes };
    },
    async replaceAll(contents) {
      await transact('readwrite', (objectStore) => {
        objectStore(CUSTOM_PALETTES).clear();
        for (const palette of contents.customPalettes) objectStore(CUSTOM_PALETTES).put(palette);
        const cleared = objectStore(STUDIO_DRAWINGS).clear();
        for (const entry of contents.studioDrawings) objectStore(STUDIO_DRAWINGS).put(entry);
        return cleared;
      });
    },
  };
}
