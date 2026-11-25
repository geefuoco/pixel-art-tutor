import { describe, expect, it } from 'vitest';
import { addDays } from './calendar-date';
import { dailyPrompt, type PractisedAttempt, type Practice } from './daily-prompt';
import { createDrawing } from './drawing';
import type { Mode } from './lesson';
import type { TechniqueDrill } from './technique-drill';
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

function onDay(day: number): number {
  return new Date(2026, 9, day, 12).getTime();
}

function passed(lessonId: string, mode: Mode, day: number): PractisedAttempt {
  return { lessonId, mode, score: 1, finishedAt: onDay(day) };
}

function failed(lessonId: string, mode: Mode, day: number): PractisedAttempt {
  return { lessonId, mode, score: 0.2, finishedAt: onDay(day) };
}

const COURSE = ['dot', 'apple', 'sword', 'potion'];

describe('Review Drills', () => {
  const { date, draw } = firstDrawOf('review');

  it('falls back to the Theme Prompt for the draw when no Lesson has been passed', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [failed('dot', 'trace', 1)],
    });
    expect(prompt).toEqual({ kind: 'theme', drawn: 'review', prompt: themePrompt(date, draw) });
  });

  it('replays the passed Lesson practised least recently, in the next harder Mode', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [
        passed('dot', 'trace', 1),
        passed('apple', 'trace', 2),
        passed('apple', 'hint', 3),
        failed('dot', 'hint', 4),
        failed('sword', 'trace', 1),
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
        passed('sword', 'trace', 1),
        passed('sword', 'hint', 2),
        passed('sword', 'freehand', 3),
      ],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'sword', mode: 'freehand' });
  });

  it('starts from Hint for a Lesson whose Trace was passed', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [passed('potion', 'trace', 5), passed('dot', 'trace', 6)],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'potion', mode: 'hint' });
  });

  it('leaves out Lessons that are no longer in the Course', () => {
    const prompt = dailyPrompt(date, draw, {
      course: COURSE,
      attempts: [passed('retired', 'trace', 1), passed('dot', 'trace', 2)],
    });
    expect(prompt).toMatchObject({ kind: 'review', lessonId: 'dot' });
  });

  it('keeps the same drill all day, whatever is practised on that day', () => {
    const before = [passed('dot', 'trace', 1), passed('apple', 'trace', 2)];
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

describe('further Review Drills on the same day', () => {
  const { date, first, second } = twoDrawsOf('review');

  it('replay the next passed Lesson practised least recently', () => {
    const practice = {
      course: COURSE,
      attempts: [passed('sword', 'trace', 1), passed('dot', 'trace', 2)],
    };
    expect(dailyPrompt(date, first, practice)).toMatchObject({ kind: 'review', lessonId: 'sword' });
    expect(dailyPrompt(date, second, practice)).toMatchObject({ kind: 'review', lessonId: 'dot' });
  });

  it('fall back to a Theme Prompt once every passed Lesson has had its drill', () => {
    const practice = { course: COURSE, attempts: [passed('sword', 'trace', 1)] };
    expect(dailyPrompt(date, first, practice)).toMatchObject({ kind: 'review', lessonId: 'sword' });
    expect(dailyPrompt(date, second, practice)).toEqual({
      kind: 'theme',
      drawn: 'review',
      prompt: themePrompt(date, second),
    });
  });
});

function drillFor(id: string, lessonId: string): TechniqueDrill {
  return {
    id,
    title: id,
    technique: 'shading',
    lessonId,
    instruction: 'Shade it.',
    start: createDrawing({ width: 8, height: 8, palette: ['#000000'] }),
    roles: ['base'],
    checks: ['shadow-away-from-light'],
    light: 'top-left',
    seamless: [],
  };
}

const DRILLS = [drillFor('shade-dot', 'dot'), drillFor('shade-sword', 'sword')];

function twoDrawsOf(kind: string) {
  for (const date of dates('2026-11-25', 365)) {
    const draws = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
      (draw) => dailyPrompt(date, draw, NO_PRACTICE).drawn === kind,
    );
    if (draws.length >= 2) return { date, first: draws[0]!, second: draws[1]! };
  }
  throw new Error(`No date with two ${kind} draws in a year`);
}

describe('Technique Drills', () => {
  const { date, draw } = firstDrawOf('technique');

  it('fall back to the Theme Prompt for the draw when no drill has its Lesson passed', () => {
    const practice = { course: COURSE, attempts: [failed('dot', 'trace', 1)] };
    expect(dailyPrompt(date, draw, practice, DRILLS)).toEqual({
      kind: 'theme',
      drawn: 'technique',
      prompt: themePrompt(date, draw),
    });
  });

  it('give a drill whose technique was taught by a Lesson passed before that date', () => {
    const practice = { course: COURSE, attempts: [passed('sword', 'trace', 3)] };
    expect(dailyPrompt(date, draw, practice, DRILLS)).toEqual({
      kind: 'technique',
      drawn: 'technique',
      date,
      draw,
      drill: DRILLS[1],
    });
  });

  it('count a pass in any Mode, but only for Lessons in the Course', () => {
    const drills = [drillFor('shade-dot', 'dot'), drillFor('shade-retired', 'retired')];
    const practice = {
      course: COURSE,
      attempts: [
        passed('retired', 'trace', 1),
        failed('dot', 'trace', 1),
        passed('dot', 'hint', 2),
      ],
    };
    expect(dailyPrompt(date, draw, practice, drills)).toMatchObject({
      kind: 'technique',
      drill: { id: 'shade-dot' },
    });
  });

  it('keep the same drill all day, whatever is passed on that day', () => {
    const [year, month, day] = date.split('-').map(Number);
    const thatDay = new Date(year!, month! - 1, day!, 9).getTime();
    const practice = {
      course: COURSE,
      attempts: [{ lessonId: 'dot', mode: 'trace' as const, score: 1, finishedAt: thatDay }],
    };
    expect(dailyPrompt(date, draw, practice, DRILLS)).toMatchObject({ kind: 'theme' });
  });

  it('give every drill whose Lesson was passed on some day', () => {
    const practice = {
      course: COURSE,
      attempts: [passed('dot', 'trace', 1), passed('sword', 'trace', 1)],
    };
    const given = new Set(
      dates('2026-11-25', 120).flatMap((day) =>
        [0, 1, 2].flatMap((n) => {
          const prompt = dailyPrompt(day, n, practice, DRILLS);
          return prompt.kind === 'technique' ? [prompt.drill.id] : [];
        }),
      ),
    );
    expect(given).toEqual(new Set(['shade-dot', 'shade-sword']));
  });
});

describe('further Technique Drills on the same day', () => {
  const { date, first, second } = twoDrawsOf('technique');
  const both = {
    course: COURSE,
    attempts: [passed('dot', 'trace', 1), passed('sword', 'trace', 1)],
  };

  it('give a drill not already given that day', () => {
    const one = dailyPrompt(date, first, both, DRILLS);
    const other = dailyPrompt(date, second, both, DRILLS);
    expect(one.kind === 'technique' && other.kind === 'technique').toBe(true);
    expect(new Set([one, other].map((p) => p.kind === 'technique' && p.drill.id))).toEqual(
      new Set(['shade-dot', 'shade-sword']),
    );
  });

  it('fall back to a Theme Prompt once every drill has been given', () => {
    const practice = { course: COURSE, attempts: [passed('dot', 'trace', 1)] };
    expect(dailyPrompt(date, first, practice, DRILLS)).toMatchObject({
      kind: 'technique',
      drill: { id: 'shade-dot' },
    });
    expect(dailyPrompt(date, second, practice, DRILLS)).toEqual({
      kind: 'theme',
      drawn: 'technique',
      prompt: themePrompt(date, second),
    });
  });
});

describe('Daily Prompt kind mix', () => {
  it('gives every visitor the same kinds for a date', () => {
    const firstDraws = dates('2026-11-25', 14).map(
      (date) => dailyPrompt(date, 0, NO_PRACTICE).drawn,
    );
    expect(
      firstDraws.map((kind, day) => (kind === 'review' ? day : null)).filter((d) => d !== null),
    ).toEqual([4, 10, 13]);
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
    expect(Math.abs(share('theme') - 0.6)).toBeLessThan(0.02);
    expect(Math.abs(share('technique') - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(share('review') - 0.15)).toBeLessThan(0.02);
  });
});
