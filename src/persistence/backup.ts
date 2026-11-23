import { MAX_DRAWING_SIZE, TRANSPARENT, type Drawing } from '../core/drawing';
import type { SavedDrawing, Store, StoreContents } from './store';

export const BACKUP_FORMAT = 'pixel-art-tutor-backup';
export const BACKUP_VERSION = 1;

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
  if (file.version !== BACKUP_VERSION || !Array.isArray(file.studioDrawings)) {
    return { ok: false, message: DAMAGED };
  }
  const studioDrawings = file.studioDrawings.map(readSavedDrawing);
  const ids = new Set(studioDrawings.map((d) => d?.id));
  if (!studioDrawings.every((d) => d !== null) || ids.size !== studioDrawings.length) {
    return { ok: false, message: DAMAGED };
  }
  return { ok: true, contents: { studioDrawings } };
}
