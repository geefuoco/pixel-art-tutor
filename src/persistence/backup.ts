import { MAX_DRAWING_SIZE, TRANSPARENT, type Drawing } from '../core/drawing';
import { passesMode } from '../core/evaluate';
import type { FreehandSubScores } from '../core/freehand';
import { isMode, MODES, ROLES, type Mode, type Role } from '../core/lesson';
import { createPersonalLesson } from '../core/personal-lesson';
import type { LessonProgress } from '../core/progress';
import { checkCustomPalette, type CustomPalette } from '../core/palettes';
import {
  progressFromAttempts,
  type Attempt,
  type InProgressAttempt,
  type PersonalLessonRecord,
  type SavedDrawing,
  type Store,
  type StoreContents,
} from './store';

export const BACKUP_FORMAT = 'pixel-art-tutor-backup';
export const BACKUP_VERSION = 8;

export async function createBackup(store: Store): Promise<string> {
  const contents = await store.readAll();
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, ...contents });
}

export type BackupReading =
  | { readonly ok: true; readonly contents: StoreContents }
  | { readonly ok: false; readonly message: string };

const NOT_A_BACKUP = 'This file is not a Pixel Art Tutor backup.';
const UNREADABLE =
  'This file could not be read as a backup. It may be damaged, or not a Pixel Art Tutor backup.';
const DAMAGED = 'This backup file is damaged, so it cannot be restored.';
const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

type Unchecked<T> = { readonly [K in keyof T]?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSize(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_DRAWING_SIZE;
}

function readDrawing(value: unknown): Drawing | null {
  if (!isRecord(value)) return null;
  const { width, height, palette, pixels } = value as Unchecked<Drawing>;
  if (!isSize(width) || !isSize(height)) return null;
  if (
    !Array.isArray(palette) ||
    !palette.every((c) => typeof c === 'string' && HEX_COLOR.test(c))
  ) {
    return null;
  }
  const inPalette = (p: unknown) =>
    p === TRANSPARENT ||
    (Number.isInteger(p) && (p as number) >= 0 && (p as number) < palette.length);
  if (!Array.isArray(pixels) || pixels.length !== width * height || !pixels.every(inPalette)) {
    return null;
  }
  return { width, height, palette: [...palette], pixels: [...pixels] };
}

function readSavedDrawing(value: unknown): SavedDrawing | null {
  if (!isRecord(value)) return null;
  const { id, updatedAt, drawing } = value as Unchecked<SavedDrawing>;
  const checked = readDrawing(drawing);
  if (typeof id !== 'string' || id === '' || !Number.isFinite(updatedAt) || !checked) return null;
  return { id, updatedAt: updatedAt as number, drawing: checked };
}

function readCustomPalette(value: unknown): CustomPalette | null {
  if (!isRecord(value)) return null;
  const { id, name, colors } = value as Unchecked<CustomPalette>;
  return checkCustomPalette({ id, name, colors });
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0;
}

function readHintFlashes(value: Record<string, unknown>, counted: boolean): number | null {
  if (!counted) return 0;
  return isCount(value.hintFlashes) ? value.hintFlashes : null;
}

function readInGallery(
  value: Record<string, unknown>,
  mode: Mode,
  score: number,
  recorded: boolean,
) {
  if (!recorded) return passesMode(mode, score);
  return typeof value.inGallery === 'boolean' ? value.inGallery : null;
}

function isShare(n: unknown): n is number {
  return typeof n === 'number' && n >= 0 && n <= 1;
}

function readSubScores(value: unknown): FreehandSubScores | null {
  if (!isRecord(value)) return null;
  const { shape, palette, lineQuality } = value as Unchecked<FreehandSubScores>;
  if (!isShare(shape) || !isShare(palette) || !isShare(lineQuality)) return null;
  return { shape, palette, lineQuality };
}

function readAttempt(
  value: unknown,
  { flashesCounted, inGalleryRecorded }: { flashesCounted: boolean; inGalleryRecorded: boolean },
): Attempt | null {
  if (!isRecord(value)) return null;
  const { id, lessonId, mode, drawing, score, finishedAt } = value as Unchecked<Attempt>;
  const checked = readDrawing(drawing);
  const hintFlashes = readHintFlashes(value, flashesCounted);
  if (!isText(id) || !isText(lessonId) || !isMode(mode) || !checked) return null;
  if (!isShare(score)) return null;
  const subScores = value.subScores === undefined ? undefined : readSubScores(value.subScores);
  if (subScores === null) return null;
  if (!Number.isFinite(finishedAt) || hintFlashes === null) return null;
  const inGallery = readInGallery(value, mode, score, inGalleryRecorded);
  if (inGallery === null) return null;
  return {
    id,
    lessonId,
    mode,
    drawing: checked,
    score,
    ...(subScores && { subScores }),
    hintFlashes,
    inGallery,
    finishedAt: finishedAt as number,
  };
}

function readInProgressAttempt(value: unknown, flashesCounted: boolean): InProgressAttempt | null {
  if (!isRecord(value)) return null;
  const { lessonId, mode, drawing, updatedAt } = value as Unchecked<InProgressAttempt>;
  const checked = readDrawing(drawing);
  const hintFlashes = readHintFlashes(value, flashesCounted);
  if (!isText(lessonId) || !isMode(mode) || !checked || !Number.isFinite(updatedAt)) return null;
  if (hintFlashes === null) return null;
  return { lessonId, mode, drawing: checked, hintFlashes, updatedAt: updatedAt as number };
}

function readLessonProgress(value: unknown): LessonProgress | null {
  if (!isRecord(value)) return null;
  const { lessonId, passedModes } = value as Unchecked<LessonProgress>;
  if (!isText(lessonId) || !Array.isArray(passedModes)) return null;
  const passedInOrder = passedModes.every((mode, i) => mode === MODES[i]);
  return passedInOrder ? { lessonId, passedModes: [...(passedModes as Mode[])] } : null;
}

function isRole(value: unknown): value is Role {
  return (ROLES as readonly unknown[]).includes(value);
}

function readPersonalLesson(value: unknown): PersonalLessonRecord | null {
  if (!isRecord(value)) return null;
  const { id, title, reference, roles, createdAt } = value as Unchecked<PersonalLessonRecord>;
  const checked = readDrawing(reference);
  if (!isText(id) || !isText(title) || !checked || !Number.isFinite(createdAt)) return null;
  if (!Array.isArray(roles) || !roles.every(isRole)) return null;
  try {
    createPersonalLesson({ id, title, reference: checked, roles });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  return { id, title, reference: checked, roles: [...roles], createdAt: createdAt as number };
}

function readAllWithUniqueKeys<T>(
  values: unknown,
  read: (value: unknown) => T | null,
  keyOf: (value: T) => string,
): T[] | null {
  if (!Array.isArray(values)) return null;
  const checked = values.map(read);
  if (!checked.every((v) => v !== null)) return null;
  return new Set(checked.map(keyOf)).size === checked.length ? checked : null;
}

const byId = (value: { readonly id: string }) => value.id;

export function readBackup(text: string): BackupReading {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: UNREADABLE };
  }
  if (!isRecord(file) || file.format !== BACKUP_FORMAT) return { ok: false, message: NOT_A_BACKUP };
  if (typeof file.version === 'number' && file.version > BACKUP_VERSION) {
    return {
      ok: false,
      message:
        'This backup was made by a newer version of Pixel Art Tutor. Reload the page to update, then try again.',
    };
  }
  const { version } = file;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, message: DAMAGED };
  }
  const studioDrawings = readAllWithUniqueKeys(file.studioDrawings, readSavedDrawing, byId);
  const customPalettes =
    version === 1 ? [] : readAllWithUniqueKeys(file.customPalettes, readCustomPalette, byId);
  const hasAttempts = version >= 3;
  const flashesCounted = version >= 5;
  const inGalleryRecorded = version >= 6;
  const attempts = hasAttempts
    ? readAllWithUniqueKeys(
        file.attempts,
        (a) => readAttempt(a, { flashesCounted, inGalleryRecorded }),
        byId,
      )
    : [];
  const inProgressAttempts = hasAttempts
    ? readAllWithUniqueKeys(
        file.inProgressAttempts,
        (a) => readInProgressAttempt(a, flashesCounted),
        (a) => `${a.lessonId}\n${a.mode}`,
      )
    : [];
  const progress =
    version >= 4
      ? readAllWithUniqueKeys(file.progress, readLessonProgress, (p) => p.lessonId)
      : attempts && progressFromAttempts(attempts);
  const personalLessons =
    version >= 8 ? readAllWithUniqueKeys(file.personalLessons, readPersonalLesson, byId) : [];
  if (
    !studioDrawings ||
    !customPalettes ||
    !attempts ||
    !inProgressAttempts ||
    !progress ||
    !personalLessons
  ) {
    return { ok: false, message: DAMAGED };
  }
  return {
    ok: true,
    contents: {
      studioDrawings,
      customPalettes,
      attempts,
      inProgressAttempts,
      progress,
      personalLessons,
    },
  };
}
