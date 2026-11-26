import type { StorageProblem } from '../persistence/store';

export const LESSON_STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable:
    'this Lesson will not be saved because site data is blocked. Try non-private mode, or another browser.',
  full: "browser storage is full, so your latest pixels and Attempts aren't saved.",
};
