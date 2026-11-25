import type { Drawing } from '../core/drawing';
import type { FreehandSubScores } from '../core/freehand';
import type { Mode, Role } from '../core/lesson';
import { passesMode } from '../core/evaluate';
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
  readonly subScores?: FreehandSubScores;
  readonly hintFlashes: number;
  readonly inGallery: boolean;
  readonly finishedAt: number;
}

export interface PersonalLessonRecord {
  readonly id: string;
  readonly title: string;
  readonly reference: Drawing;
  readonly roles: readonly Role[];
  readonly createdAt: number;
}

export interface StoreContents {
  readonly studioDrawings: readonly SavedDrawing[];
  readonly customPalettes: readonly CustomPalette[];
  readonly attempts: readonly Attempt[];
  readonly inProgressAttempts: readonly InProgressAttempt[];
  readonly progress: Progress;
  readonly personalLessons: readonly PersonalLessonRecord[];
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
  saveAttemptToGallery(attemptId: string): Promise<void>;
  listAttempts(): Promise<Attempt[]>;
  listProgress(): Promise<LessonProgress[]>;
  listPersonalLessons(): Promise<PersonalLessonRecord[]>;
  putPersonalLesson(record: PersonalLessonRecord): Promise<void>;
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
const DB_VERSION = 7;
const STUDIO_DRAWINGS = 'studio-drawings';
const CUSTOM_PALETTES = 'custom-palettes';
const ATTEMPTS = 'attempts';
const IN_PROGRESS_ATTEMPTS = 'in-progress-attempts';
const PROGRESS = 'progress';
const PERSONAL_LESSONS = 'personal-lessons';
const KEY_PATHS: Record<string, string | string[]> = {
  [STUDIO_DRAWINGS]: 'id',
  [CUSTOM_PALETTES]: 'id',
  [ATTEMPTS]: 'id',
  [IN_PROGRESS_ATTEMPTS]: ['lessonId', 'mode'],
  [PROGRESS]: 'lessonId',
  [PERSONAL_LESSONS]: 'id',
};
const OBJECT_STORES = Object.keys(KEY_PATHS);

type ObjectStoreName = (typeof OBJECT_STORES)[number];

export function progressFromAttempts(attempts: readonly Attempt[]): Progress {
  return attempts
    .filter((attempt) => passesMode(attempt.mode, attempt.score))
    .reduce<Progress>((progress, a) => recordPass(progress, a.lessonId, a.mode), []);
}

function addProgressFromSavedAttempts(transaction: IDBTransaction) {
  const reading = transaction.objectStore(ATTEMPTS).getAll();
  reading.onsuccess = () => {
    const progress = transaction.objectStore(PROGRESS);
    for (const entry of progressFromAttempts(reading.result as Attempt[])) progress.put(entry);
  };
}

function fillMissingFields(
  transaction: IDBTransaction,
  name: ObjectStoreName,
  defaultsFor: (record: Record<string, unknown>) => Record<string, unknown>,
) {
  const walking = transaction.objectStore(name).openCursor();
  walking.onsuccess = () => {
    const cursor = walking.result;
    if (!cursor) return;
    const record = cursor.value as Record<string, unknown>;
    const filled = { ...defaultsFor(record), ...record };
    if (Object.keys(filled).length !== Object.keys(record).length) cursor.update(filled);
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
      if (event.oldVersion < 6) {
        fillMissingFields(request.transaction!, ATTEMPTS, (attempt) => ({
          hintFlashes: 0,
          inGallery: passesMode(attempt.mode as Mode, attempt.score as number),
        }));
        fillMissingFields(request.transaction!, IN_PROGRESS_ATTEMPTS, () => ({ hintFlashes: 0 }));
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
    async saveAttemptToGallery(attemptId) {
      await transact('readwrite', (objectStore) => {
        const attempts = objectStore(ATTEMPTS);
        const reading = attempts.get(attemptId);
        reading.onsuccess = () => {
          const attempt = reading.result as Attempt | undefined;
          if (attempt) attempts.put({ ...attempt, inGallery: true });
        };
        return reading;
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
    async listPersonalLessons() {
      const all = await transact<PersonalLessonRecord[]>('readonly', (objectStore) =>
        objectStore(PERSONAL_LESSONS).getAll(),
      );
      return all.sort((a, b) => a.createdAt - b.createdAt);
    },
    async putPersonalLesson(record) {
      await transact('readwrite', (objectStore) => objectStore(PERSONAL_LESSONS).put(record));
    },
    async readAll() {
      const [
        studioDrawings,
        customPalettes,
        attempts,
        inProgressAttempts,
        progress,
        personalLessons,
      ] = await Promise.all([
        this.listStudioDrawings(),
        this.listCustomPalettes(),
        this.listAttempts(),
        transact<InProgressAttempt[]>('readonly', (objectStore) =>
          objectStore(IN_PROGRESS_ATTEMPTS).getAll(),
        ),
        this.listProgress(),
        this.listPersonalLessons(),
      ]);
      return {
        studioDrawings,
        customPalettes,
        attempts,
        inProgressAttempts,
        progress,
        personalLessons,
      };
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
        objectStore(PERSONAL_LESSONS).clear();
        for (const record of contents.personalLessons) objectStore(PERSONAL_LESSONS).put(record);
        const cleared = objectStore(STUDIO_DRAWINGS).clear();
        for (const entry of contents.studioDrawings) objectStore(STUDIO_DRAWINGS).put(entry);
        return cleared;
      });
    },
  };
}
