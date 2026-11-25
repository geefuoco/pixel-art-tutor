import { describe, expect, it } from 'vitest';
import { addDays } from './calendar-date';
import { dailyPrompt, type PractisedAttempt, type Practice } from './daily-prompt';
import type { Mode } from './lesson';
import { themePrompt } from './theme-prompt';

const NO_PRACTICE: Practice = { course: [], attempts: [] };

function dates(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

function firstDrawOf(kind: string, from = '2026-11-25') {
  for (const date of dates(from, 365)) {
    for (const draw of [0, 1, 2, 3, 4, 5]) {
      if (dailyPrompt(date, draw, NO_PRACTICE).drawn === kind) return { date, draw };
    }
  }
  throw new Error(`No ${kind} draw in a year`);
}

function attempt(lessonId: string, mode: Mode, passed: boolean, day: number): PractisedAttempt {
  return {
    lessonId,
    mode,
    score: passed ? 1 : 0.2,
    finishedAt: new Date(2026, 9, day, 12).getTime(),
  };
}

const COURSE = ['dot', 'apple', 'sword', 'potion'];

describe('Review Drills', () => {
  const { date, draw } = firstDrawOf('review');

  it('falls back to the Theme Prompt for the draw when no Lesson has been passed', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [attempt('dot', 'trace', false, 1)],
    });
    expect(prompt).toEqual({ kind: 'theme', drawn: 'review', prompt: themePrompt(date, draw) });
  });

  it('replays the passed Lesson practised least recently, in the next harder Mode', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [
        attempt('dot', 'trace', true, 1),
        attempt('apple', 'trace', true, 2),
        attempt('apple', 'hint', true, 3),
        attempt('dot', 'hint', false, 4),
        attempt('sword', 'trace', false, 1),
      ],
    });
    expect(prompt).toEqual({
      kind: 'review',
      drawn: 'review',
      date,
      draw,
      lessonId: 'apple',
      mode: 'freehand',
    });
  });

  it('stays in Freehand once Freehand has been passed', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [
        attempt('sword', 'trace', true, 1),
        attempt('sword', 'hint', true, 2),
        attempt('sword', 'freehand', true, 3),
      ],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'sword', mode: 'freehand' });
  });

  it('starts from Hint for a Lesson whose Trace was passed', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [attempt('potion', 'trace', true, 5), attempt('dot', 'trace', true, 6)],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'potion', mode: 'hint' });
  });

  it('leaves out Lessons that are no longer in the Course', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [attempt('retired', 'trace', true, 1), attempt('dot', 'trace', true, 2)],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'dot' });
  });

  it('keeps the same drill all day, whatever is practised on that day', () => {
    const before = [attempt('dot', 'trace', true, 1), attempt('apple', 'trace', true, 2)];
    const [year, month, day] = date.split('-').map(Number);
    const thatDay = new Date(year!, month! - 1, day!, 9).getTime();
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [
        ...before,
        { lessonId: 'dot', mode: 'hint', score: 1, finishedAt: thatDay },
        { lessonId: 'potion', mode: 'trace', score: 1, finishedAt: thatDay },
      ],
    });
    expect(prompt).toEqual(dailyPrompt(date, draw, { course: COURSE, attempts: before }));
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'dot', mode: 'hint' });
  });
});

function twoReviewDraws() {
  for (const date of dates('2026-11-25', 365)) {
    const draws = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
      (draw) => dailyPrompt(date, draw, NO_PRACTICE).drawn === 'review',
    );
    if (draws.length >= 2) return { date, first: draws[0]!, second: draws[1]! };
  }
  throw new Error('No date with two Review draws in a year');
}

describe('further Review Drills on the same day', () => {
  const { date, first, second } = twoReviewDraws();

  it('replay the next passed Lesson practised least recently', () => {
    const practice = {
      course: COURSE,
      attempts: [attempt('sword', 'trace', true, 1), attempt('dot', 'trace', true, 2)],
    };
    expect(dailyPrompt(date, first, practice)).toMatchObject({ kind: 'review', lessonId: 'sword' });
    expect(dailyPrompt(date, second, practice)).toMatchObject({ kind: 'review', lessonId: 'dot' });
  });

  it('fall back to a Theme Prompt once every passed Lesson has had its drill', () => {
    const practice = { course: COURSE, attempts: [attempt('sword', 'trace', true, 1)] };
    expect(dailyPrompt(date, first, practice)).toMatchObject({ kind: 'review', lessonId: 'sword' });
    expect(dailyPrompt(date, second, practice)).toEqual({
      kind: 'theme',
      drawn: 'review',
      prompt: themePrompt(date, second),
    });
  });
});

describe('Technique Drills', () => {
  it('fall back to the Theme Prompt for the draw until there are drills to give', () => {
    const { date, draw } = firstDrawOf('technique');
    expect(dailyPrompt(date, draw, NO_PRACTICE)).toEqual({
      kind: 'theme',
      drawn: 'technique',
      prompt: themePrompt(date, draw),
    });
  });
});

describe('Daily Prompt kind mix', () => {
  it('gives every visitor the same kind for a date and draw', () => {
    expect(dailyPrompt('2026-11-25', 4, NO_PRACTICE)).toEqual(
      dailyPrompt('2026-11-25', 4, NO_PRACTICE),
    );
  });

  it('can give any kind on a further draw', () => {
    const further = dates('2026-01-01', 60).flatMap((date) =>
      [1, 2, 3].map((draw) => dailyPrompt(date, draw, NO_PRACTICE).drawn),
    );
    expect(new Set(further)).toEqual(new Set(['theme', 'technique', 'review']));
  });

  it('refuses a draw that is not a whole number from 0', () => {
    expect(() => dailyPrompt('2026-11-25', -1, NO_PRACTICE)).toThrow(RangeError);
    expect(() => dailyPrompt('2026-11-25', 1.5, NO_PRACTICE)).toThrow(RangeError);
  });

  it('draws Theme 60, Technique 25 and Review 15 out of 100', () => {
    const drawn = dates('2026-01-01', 2000).flatMap((date) =>
      [0, 1, 2].map((draw) => dailyPrompt(date, draw, NO_PRACTICE).drawn),
    );
    const share = (kind: string) => drawn.filter((k) => k === kind).length / drawn.length;
    expect(share('theme')).toBeCloseTo(0.6, 1);
    expect(share('technique')).toBeCloseTo(0.25, 1);
    expect(share('review')).toBeCloseTo(0.15, 1);
  });
});
