import { openStore } from '../persistence/store';

function browserIndexedDB(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

export const browserStore = openStore(browserIndexedDB());
