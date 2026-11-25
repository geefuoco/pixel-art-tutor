import { checkCalendarDate, localCalendarDate, type CalendarDate } from './calendar-date';
import { passesMode } from './evaluate';
import { MODES, type Mode } from './lesson';
import { seededRandom } from './seeded-random';
import { themePrompt, type ThemePrompt } from './theme-prompt';

export const DAILY_PROMPT_KINDS = ['theme', 'technique', 'review'] as const;
export type DailyPromptKind = (typeof DAILY_PROMPT_KINDS)[number];

export const DAILY_PROMPT_KIND_WEIGHTS: Readonly<Record<DailyPromptKind, number>> = {
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

export type DailyPrompt = ThemeDraw | ReviewDrill;

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

function reviewCandidates(date: CalendarDate, practice: Practice): ReviewCandidate[] {
  const before = practice.attempts.filter(
    (attempt) => localCalendarDate(new Date(attempt.finishedAt)) < date,
  );
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

function reviewDrawsUpTo(date: CalendarDate, draw: number): number[] {
  return Array.from({ length: draw + 1 }, (_, earlier) => earlier).filter(
    (earlier) => drawnKind(date, earlier) === 'review',
  );
}

export function dailyPrompt(date: CalendarDate, draw: number, practice: Practice): DailyPrompt {
  if (!Number.isInteger(draw) || draw < 0) {
    throw new RangeError(`A draw is a whole number from 0, not ${draw}`);
  }
  const day = checkCalendarDate(date);
  const drawn = drawnKind(day, draw);
  if (drawn === 'review') {
    const reviewsSoFar = reviewDrawsUpTo(day, draw).length - 1;
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
  return { kind: 'theme', drawn, prompt: themePrompt(day, draw) };
}
