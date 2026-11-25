import { checkCalendarDate, localCalendarDate, type CalendarDate } from './calendar-date';
import { passesMode } from './evaluate';
import { MODES, type Mode } from './lesson';
import { seededRandom } from './seeded-random';
import type { TechniqueDrill } from './technique-drill';
import { themePrompt, type ThemePrompt } from './theme-prompt';

const DAILY_PROMPT_KINDS = ['theme', 'technique', 'review'] as const;
export type DailyPromptKind = (typeof DAILY_PROMPT_KINDS)[number];

const DAILY_PROMPT_KIND_WEIGHTS: Readonly<Record<DailyPromptKind, number>> = {
  theme: 60,
  technique: 25,
  review: 15,
};

export interface PractisedAttempt {
  readonly lessonId: string;
  readonly mode: Mode;
  readonly score: number;
  readonly finishedAt: number;
}

export interface Practice {
  readonly course: readonly string[];
  readonly attempts: readonly PractisedAttempt[];
}

export interface ThemeDraw {
  readonly kind: 'theme';
  readonly drawn: DailyPromptKind;
  readonly prompt: ThemePrompt;
}

export interface ReviewDrill {
  readonly kind: 'review';
  readonly drawn: 'review';
  readonly date: CalendarDate;
  readonly draw: number;
  readonly lessonId: string;
  readonly mode: Mode;
}

export interface TechniqueDrillPrompt {
  readonly kind: 'technique';
  readonly drawn: 'technique';
  readonly date: CalendarDate;
  readonly draw: number;
  readonly drill: TechniqueDrill;
}

export type DailyPrompt = ThemeDraw | ReviewDrill | TechniqueDrillPrompt;

interface ReviewCandidate {
  readonly lessonId: string;
  readonly hardestPassed: number;
  readonly lastPractised: number;
}

function drawnKind(date: CalendarDate, draw: number): DailyPromptKind {
  const total = DAILY_PROMPT_KINDS.reduce((sum, kind) => sum + DAILY_PROMPT_KIND_WEIGHTS[kind], 0);
  let roll = seededRandom(`daily-prompt-kind/${date}/${draw}`)() * total;
  for (const kind of DAILY_PROMPT_KINDS) {
    roll -= DAILY_PROMPT_KIND_WEIGHTS[kind];
    if (roll < 0) return kind;
  }
  return 'theme';
}

function attemptsBefore(date: CalendarDate, practice: Practice): PractisedAttempt[] {
  return practice.attempts.filter(
    (attempt) => localCalendarDate(new Date(attempt.finishedAt)) < date,
  );
}

function reviewCandidates(date: CalendarDate, practice: Practice): ReviewCandidate[] {
  const before = attemptsBefore(date, practice);
  return practice.course
    .map((lessonId) => {
      const practised = before.filter((attempt) => attempt.lessonId === lessonId);
      const passed = practised.filter((attempt) => passesMode(attempt.mode, attempt.score));
      return {
        lessonId,
        hardestPassed: Math.max(-1, ...passed.map((attempt) => MODES.indexOf(attempt.mode))),
        lastPractised: Math.max(...practised.map((attempt) => attempt.finishedAt)),
      };
    })
    .filter((candidate) => candidate.hardestPassed >= 0)
    .sort((a, b) => a.lastPractised - b.lastPractised);
}

function nextHarderMode(hardestPassed: number): Mode {
  return MODES[Math.min(hardestPassed + 1, MODES.length - 1)]!;
}

function drawsUpTo(date: CalendarDate, draw: number, kind: DailyPromptKind): number[] {
  return Array.from({ length: draw + 1 }, (_, earlier) => earlier).filter(
    (earlier) => drawnKind(date, earlier) === kind,
  );
}

function drillsToGive(
  date: CalendarDate,
  practice: Practice,
  drills: readonly TechniqueDrill[],
): TechniqueDrill[] {
  const passed = new Set(
    attemptsBefore(date, practice)
      .filter((attempt) => practice.course.includes(attempt.lessonId))
      .filter((attempt) => passesMode(attempt.mode, attempt.score))
      .map((attempt) => attempt.lessonId),
  );
  return drills.filter((drill) => passed.has(drill.lessonId));
}

function techniqueDrill(
  date: CalendarDate,
  draw: number,
  practice: Practice,
  drills: readonly TechniqueDrill[],
): TechniqueDrill | undefined {
  let remaining = drillsToGive(date, practice, drills);
  let given: TechniqueDrill | undefined;
  for (const earlier of drawsUpTo(date, draw, 'technique')) {
    if (remaining.length === 0) return undefined;
    const roll = seededRandom(`technique-drill/${date}/${earlier}`)();
    given = remaining[Math.floor(roll * remaining.length)]!;
    remaining = remaining.filter((drill) => drill !== given);
  }
  return given;
}

export function dailyPrompt(
  date: CalendarDate,
  draw: number,
  practice: Practice,
  drills: readonly TechniqueDrill[] = [],
): DailyPrompt {
  if (!Number.isInteger(draw) || draw < 0) {
    throw new RangeError(`A draw is a whole number from 0, not ${draw}`);
  }
  const day = checkCalendarDate(date);
  const drawn = drawnKind(day, draw);
  if (drawn === 'review') {
    const reviewsSoFar = drawsUpTo(day, draw, 'review').length - 1;
    const candidate = reviewCandidates(day, practice)[reviewsSoFar];
    if (candidate) {
      return {
        kind: 'review',
        drawn,
        date: day,
        draw,
        lessonId: candidate.lessonId,
        mode: nextHarderMode(candidate.hardestPassed),
      };
    }
  }
  if (drawn === 'technique') {
    const drill = techniqueDrill(day, draw, practice, drills);
    if (drill) return { kind: 'technique', drawn, date: day, draw, drill };
  }
  return { kind: 'theme', drawn, prompt: themePrompt(day, draw) };
}
