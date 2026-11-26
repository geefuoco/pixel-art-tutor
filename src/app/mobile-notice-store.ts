import { useSyncExternalStore } from 'react';
import { createMobileNoticeChoice } from '../persistence/mobile-notice';

const NEEDS_NOTICE_QUERY = '(pointer: coarse) and (hover: none), (width < 500px)';

function browserLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export const mobileNoticeChoice = createMobileNoticeChoice(browserLocalStorage());

const needsNoticeQuery = window.matchMedia(NEEDS_NOTICE_QUERY);

function subscribeToDevice(onChange: () => void) {
  needsNoticeQuery.addEventListener('change', onChange);
  return () => needsNoticeQuery.removeEventListener('change', onChange);
}

export function useShowMobileNotice(): boolean {
  const needsNotice = useSyncExternalStore(subscribeToDevice, () => needsNoticeQuery.matches);
  const continued = useSyncExternalStore(
    mobileNoticeChoice.subscribe,
    mobileNoticeChoice.hasContinued,
  );
  return needsNotice && !continued;
}
