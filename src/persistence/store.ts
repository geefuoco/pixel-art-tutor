import type { Drawing } from '../core/drawing';
import type { Mode } from '../core/lesson';
import { passesLesson } from '../core/evaluate';
import type { CustomPalette } from '../core/palettes';
import { recordPass, type LessonProgress, type Progress } from '../core/progress';

export interface SavedDrawing {
  readonly id: string;
  readonly drawing: Drawing;
  readonly updatedAt: number;
}

export interface InProgressAttempt {
  readonly lessonId: string;
  readonly mode: Mode;
  readonly drawing: Drawing;
  readonly hintFlashes: number;
  readonly updatedAt: number;
}

export interface Attempt {
  readonly id: string;
  readonly lessonId: string;
  readonly mode: Mode;
  readonly drawing: Drawing;
  readonly score: number;
  readonly hintFlashes: number;
  readonly finishedAt: number;
}

export interface StoreContents {
  readonly studioDrawings: readonly SavedDrawing[];
  readonly customPalettes: readonly CustomPalette[];
  readonly attempts: readonly Attempt[];
  readonly inProgressAttempts: readonly InProgressAttempt[];
  readonly progress: Progress;
}

export interface Store {
  listStudioDrawings(): Promise<SavedDrawing[]>;
  putStudioDrawing(entry: SavedDrawing): Promise<void>;
  listCustomPalettes(): Promise<CustomPalette[]>;
  putCustomPalette(palette: CustomPalette): Promise<void>;
  deleteCustomPalette(id: string): Promise<void>;
  getInProgressAttempt(lessonId: string, mode: Mode): Promise<InProgressAttempt | undefined>;
  putInProgressAttempt(attempt: InProgressAttempt): Promise<void>;
  deleteInProgressAttempt(lessonId: string, mode: Mode): Promise<void>;
  saveAttempt(attempt: Attempt, options: { passed: boolean }): Promise<void>;
  listAttempts(): Promise<Attempt[]>;
  listProgress(): Promise<LessonProgress[]>;
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
const DB_VERSION = 5;
const STUDIO_DRAWINGS = 'studio-drawings';
const CUSTOM_PALETTES = 'custom-palettes';
const ATTEMPTS = 'attempts';
const IN_PROGRESS_ATTEMPTS = 'in-progress-attempts';
const PROGRESS = 'progress';
const KEY_PATHS: Record<string, string | string[]> = {
  [STUDIO_DRAWINGS]: 'id',
  [CUSTOM_PALETTES]: 'id',
  [ATTEMPTS]: 'id',
  [IN_PROGRESS_ATTEMPTS]: ['lessonId', 'mode'],
  [PROGRESS]: 'lessonId',
};
const OBJECT_STORES = Object.keys(KEY_PATHS);

type ObjectStoreName = (typeof OBJECT_STORES)[number];

export function progressFromAttempts(attempts: readonly Attempt[]): Progress {
  return attempts
    .filter((attempt) => passesLesson(attempt.score))
    .reduce<Progress>((progress, a) => recordPass(progress, a.lessonId, a.mode), []);
}

function addProgressFromSavedAttempts(transaction: IDBTransaction) {
  const reading = transaction.objectStore(ATTEMPTS).getAll();
  reading.onsuccess = () => {
    const progress = transaction.objectStore(PROGRESS);
    for (const entry of progressFromAttempts(reading.result as Attempt[])) progress.put(entry);
  };
}

function countNoHintFlashes(transaction: IDBTransaction, name: ObjectStoreName) {
  const walking = transaction.objectStore(name).openCursor();
  walking.onsuccess = () => {
    const cursor = walking.result;
    if (!cursor) return;
    const record = cursor.value as { hintFlashes?: number };
    if (record.hintFlashes === undefined) cursor.update({ ...record, hintFlashes: 0 });
    cursor.continue();
  };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const hadAttempts = db.objectStoreNames.contains(ATTEMPTS);
      const hadProgress = db.objectStoreNames.contains(PROGRESS);
      for (const [name, keyPath] of Object.entries(KEY_PATHS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
      if (hadAttempts && !hadProgress) addProgressFromSavedAttempts(request.transaction!);
      if (event.oldVersion < 5) {
        countNoHintFlashes(request.transaction!, ATTEMPTS);
        countNoHintFlashes(request.transaction!, IN_PROGRESS_ATTEMPTS);
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
    async getInProgressAttempt(lessonId, mode) {
      return transact<InProgressAttempt | undefined>('readonly', (objectStore) =>
        objectStore(IN_PROGRESS_ATTEMPTS).get([lessonId, mode]),
      );
    },
    async putInProgressAttempt(attempt) {
      await transact('readwrite', (objectStore) => objectStore(IN_PROGRESS_ATTEMPTS).put(attempt));
    },
    async deleteInProgressAttempt(lessonId, mode) {
      await transact('readwrite', (objectStore) =>
        objectStore(IN_PROGRESS_ATTEMPTS).delete([lessonId, mode]),
      );
    },
    async saveAttempt(attempt, { passed }) {
      await transact('readwrite', (objectStore) => {
        if (passed) {
          objectStore(IN_PROGRESS_ATTEMPTS).delete([attempt.lessonId, attempt.mode]);
          const progress = objectStore(PROGRESS);
          const reading = progress.get(attempt.lessonId);
          reading.onsuccess = () => {
            const before = reading.result as LessonProgress | undefined;
            const [after] = recordPass(before ? [before] : [], attempt.lessonId, attempt.mode);
            progress.put(after);
          };
        }
        return objectStore(ATTEMPTS).put(attempt);
      });
    },
    async listAttempts() {
      const all = await transact<Attempt[]>('readonly', (objectStore) =>
        objectStore(ATTEMPTS).getAll(),
      );
      return all.sort((a, b) => b.finishedAt - a.finishedAt);
    },
    async listProgress() {
      return transact<LessonProgress[]>('readonly', (objectStore) =>
        objectStore(PROGRESS).getAll(),
      );
    },
    async readAll() {
      const [studioDrawings, customPalettes, attempts, inProgressAttempts, progress] =
        await Promise.all([
          this.listStudioDrawings(),
          this.listCustomPalettes(),
          this.listAttempts(),
          transact<InProgressAttempt[]>('readonly', (objectStore) =>
            objectStore(IN_PROGRESS_ATTEMPTS).getAll(),
          ),
          this.listProgress(),
        ]);
      return { studioDrawings, customPalettes, attempts, inProgressAttempts, progress };
    },
    async replaceAll(contents) {
      await transact('readwrite', (objectStore) => {
        objectStore(CUSTOM_PALETTES).clear();
        for (const palette of contents.customPalettes) objectStore(CUSTOM_PALETTES).put(palette);
        objectStore(ATTEMPTS).clear();
        for (const attempt of contents.attempts) objectStore(ATTEMPTS).put(attempt);
        objectStore(IN_PROGRESS_ATTEMPTS).clear();
        for (const attempt of contents.inProgressAttempts) {
          objectStore(IN_PROGRESS_ATTEMPTS).put(attempt);
        }
        objectStore(PROGRESS).clear();
        for (const entry of contents.progress) objectStore(PROGRESS).put(entry);
        const cleared = objectStore(STUDIO_DRAWINGS).clear();
        for (const entry of contents.studioDrawings) objectStore(STUDIO_DRAWINGS).put(entry);
        return cleared;
      });
    },
  };
}
