import { useSyncExternalStore } from 'react';
import { createDrawing } from '../core/drawing';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { openStore } from '../persistence/store';
import { createStudio, type StudioState } from '../persistence/studio';

export const DEFAULT_STUDIO_SIZE = 16;

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
  firstDrawing: createDrawing({
    width: DEFAULT_STUDIO_SIZE,
    height: DEFAULT_STUDIO_SIZE,
    palette: STUDIO_PLACEHOLDER_PALETTE,
  }),
});

function subscribe(listener: () => void) {
  void studio.load();
  return studio.subscribe(listener);
}

export function useStudio(): StudioState {
  return useSyncExternalStore(subscribe, studio.getState);
}
