export type CalendarDate = string;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcMidnight(date: CalendarDate): Date {
  const parts = CALENDAR_DATE.exec(date);
  const day = parts && new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (!day || formatUtc(day) !== date) {
    throw new RangeError(`${date} is not a calendar date like 2026-11-25`);
  }
  return day;
}

function formatUtc(day: Date): CalendarDate {
  return day.toISOString().slice(0, 10);
}

export function checkCalendarDate(date: CalendarDate): CalendarDate {
  return formatUtc(utcMidnight(date));
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const day = utcMidnight(date);
  day.setUTCDate(day.getUTCDate() + days);
  return formatUtc(day);
}

export function localCalendarDate(moment: Date): CalendarDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}
