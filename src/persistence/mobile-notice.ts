export type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface MobileNoticeChoice {
  hasContinued(): boolean;
  continueAnyway(): void;
  subscribe(listener: () => void): () => void;
}

const CONTINUED_KEY = 'pixel-art-tutor:continued-on-mobile';

function rethrowUnlessStorageRefused(error: unknown) {
  if (!(error instanceof DOMException)) throw error;
}

function readContinued(storage: DeviceStorage | undefined): boolean {
  try {
    return storage?.getItem(CONTINUED_KEY) === 'true';
  } catch (error) {
    rethrowUnlessStorageRefused(error);
    return false;
  }
}

function rememberContinued(storage: DeviceStorage | undefined) {
  try {
    storage?.setItem(CONTINUED_KEY, 'true');
  } catch (error) {
    rethrowUnlessStorageRefused(error);
  }
}

export function createMobileNoticeChoice(storage: DeviceStorage | undefined): MobileNoticeChoice {
  let continued = readContinued(storage);
  const listeners = new Set<() => void>();
  return {
    hasContinued: () => continued,
    continueAnyway() {
      continued = true;
      rememberContinued(storage);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
