import { useSyncExternalStore } from 'react';
import { createDrawing } from '../core/drawing';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { openStore } from '../persistence/store';
import { createStudio, type StudioState } from '../persistence/studio';

/** A blank Studio drawing in the Studio palette. */
export function blankStudioDrawing(width: number, height: number) {
  return createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE });
}

/** The browser's IndexedDB, or undefined where it is missing or reading it throws (blocked site data). */
function browserIndexedDB(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

/** The app's one Studio, saving to this browser. Loads when the Studio is first shown. */
export const studio = createStudio({
  store: openStore(browserIndexedDB()),
  firstDrawing: blankStudioDrawing(16, 16),
});

function subscribe(listener: () => void) {
  void studio.load();
  return studio.subscribe(listener);
}

export function useStudio(): StudioState {
  return useSyncExternalStore(subscribe, studio.getState);
}
