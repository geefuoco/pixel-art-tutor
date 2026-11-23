import { useSyncExternalStore } from 'react';
import { createDrawing, type Color } from '../core/drawing';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { openStore } from '../persistence/store';
import { createStudio, type StudioState } from '../persistence/studio';

export function blankStudioDrawing(
  width: number,
  height: number,
  palette: readonly Color[] = STUDIO_PLACEHOLDER_PALETTE,
) {
  return createDrawing({ width, height, palette });
}

function browserIndexedDB(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

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
