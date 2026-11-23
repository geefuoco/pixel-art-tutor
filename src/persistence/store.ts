import type { Drawing } from '../core/drawing';

export interface SavedDrawing {
  readonly id: string;
  readonly drawing: Drawing;
  readonly updatedAt: number;
}

export interface StoreContents {
  readonly studioDrawings: readonly SavedDrawing[];
}

export interface Store {
  listStudioDrawings(): Promise<SavedDrawing[]>;
  putStudioDrawing(entry: SavedDrawing): Promise<void>;
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
const DB_VERSION = 1;
const STUDIO_DRAWINGS = 'studio-drawings';

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STUDIO_DRAWINGS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openStore(factory: IDBFactory | undefined): Store {
  let database: Promise<IDBDatabase> | undefined;

  async function transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
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
      const transaction = (await database).transaction(STUDIO_DRAWINGS, mode);
      let request: IDBRequest<T>;
      try {
        request = run(transaction.objectStore(STUDIO_DRAWINGS));
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
      const all = await transact<SavedDrawing[]>('readonly', (s) => s.getAll());
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async putStudioDrawing(entry) {
      await transact('readwrite', (s) => s.put(entry));
    },
    async readAll() {
      return { studioDrawings: await this.listStudioDrawings() };
    },
    async replaceAll(contents) {
      await transact('readwrite', (s) => {
        const cleared = s.clear();
        for (const entry of contents.studioDrawings) s.put(entry);
        return cleared;
      });
    },
  };
}
