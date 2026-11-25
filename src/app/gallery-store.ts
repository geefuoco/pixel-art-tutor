import { useSyncExternalStore } from 'react';
import { createGallery, type GalleryState } from '../persistence/gallery';
import { browserStore } from './browser-store';
import { dailyPrompt } from './daily-prompt-store';
import { studio } from './studio-store';

export const gallery = createGallery({ store: browserStore });

function subscribe(listener: () => void) {
  void Promise.all([studio.flush(), dailyPrompt.flush()]).then(gallery.refresh);
  return gallery.subscribe(listener);
}

export function useGallery(): GalleryState {
  return useSyncExternalStore(subscribe, gallery.getState);
}
