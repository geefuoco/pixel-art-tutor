import { useSyncExternalStore } from 'react';
import { createDrawing, type Color } from '../core/drawing';
import { STUDIO_STARTER_PALETTE } from '../core/palettes';
import { createStudio, type StudioState } from '../persistence/studio';
import { browserStore } from './browser-store';

export function blankStudioDrawing(
  width: number,
  height: number,
  palette: readonly Color[] = STUDIO_STARTER_PALETTE,
) {
  return createDrawing({ width, height, palette });
}

export const studio = createStudio({
  store: browserStore,
  firstDrawing: blankStudioDrawing(16, 16),
});

function subscribe(listener: () => void) {
  void studio.load();
  return studio.subscribe(listener);
}

export function useStudio(): StudioState {
  return useSyncExternalStore(subscribe, studio.getState);
}
