import type { CalendarDate } from '../core/calendar-date';

const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

export function formatCalendarDate(date: CalendarDate): string {
  return longDate.format(new Date(`${date}T00:00`));
}
