import { useSyncExternalStore } from 'react';
import { localCalendarDate } from '../core/calendar-date';
import { createDailyPrompt, type DailyPromptState } from '../persistence/daily-prompt';
import { browserStore } from './browser-store';
import { courseLessonIds } from './lessons-store';
import { loadTechniqueDrills } from './technique-drills';

export const dailyPrompt = createDailyPrompt({
  store: browserStore,
  today: () => localCalendarDate(new Date()),
  course: courseLessonIds,
  loadDrills: loadTechniqueDrills,
});

function subscribe(listener: () => void) {
  void dailyPrompt.load();
  return dailyPrompt.subscribe(listener);
}

export function useDailyPrompt(): DailyPromptState {
  return useSyncExternalStore(subscribe, dailyPrompt.getState);
}
