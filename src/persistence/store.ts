import type { Drawing } from '../core/drawing';

/** A Studio drawing as saved: its latest pixels and when they last changed. */
export interface SavedDrawing {
  readonly id: string;
  readonly drawing: Drawing;
  /** Milliseconds since the epoch. */
  readonly updatedAt: number;
}

/** Everything the app keeps in the browser. Each method rejects with a StorageError. */
export interface Store {
  /** Every saved Studio drawing, most recently changed first. */
  listStudioDrawings(): Promise<SavedDrawing[]>;
  /** Saves a Studio drawing, replacing any saved drawing with the same id. Resolves once written. */
  putStudioDrawing(entry: SavedDrawing): Promise<void>;
}

/** Why the app can't keep data: the browser won't give it storage, or the storage is full. */
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

function opened(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STUDIO_DRAWINGS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * A Store over IndexedDB, or over nothing when `factory` is undefined (the browser
 * has no IndexedDB), in which case every call rejects as unavailable. The database is
 * opened on first use.
 */
export function openStore(factory: IDBFactory | undefined): Store {
  let database: Promise<IDBDatabase> | undefined;

  /** Runs one request in its own transaction, resolving once the transaction commits. */
  async function transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    try {
      if (!factory) throw new StorageError('unavailable');
      database ??= opened(factory);
      // A failed open is retried next time rather than remembered.
      database.catch(() => (database = undefined));
      const transaction = (await database).transaction(STUDIO_DRAWINGS, mode);
      const request = run(transaction.objectStore(STUDIO_DRAWINGS));
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
  };
}
