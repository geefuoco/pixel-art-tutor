import { stillAnimation, type Animation } from '../core/animation';
import type { CalendarDate } from '../core/calendar-date';
import {
  dailyPrompt,
  type DailyPrompt as DrawnPrompt,
  type Practice,
  type PractisedAttempt,
  type ReviewDrill,
  type TechniqueDrillPrompt,
} from '../core/daily-prompt';
import { createEditor, type Editor } from '../core/editor';
import { techniqueDrillText, type TechniqueDrill } from '../core/technique-drill';
import {
  blankThemePromptDrawing,
  themePrompt,
  themePromptText,
  type ThemePrompt,
} from '../core/theme-prompt';
import { StorageError, type PromptDrawing, type Store, type StorageProblem } from './store';

export type DailyPromptState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly kind: 'theme';
      readonly prompt: ThemePrompt;
      readonly editor: Editor;
      readonly inGallery: boolean;
      readonly problem: StorageProblem | null;
    }
  | {
      readonly status: 'ready';
      readonly kind: 'technique';
      readonly prompt: TechniqueDrillPrompt;
      readonly editor: Editor;
      readonly inGallery: boolean;
      readonly problem: StorageProblem | null;
    }
  | {
      readonly status: 'ready';
      readonly kind: 'review';
      readonly drill: ReviewDrill;
      readonly problem: StorageProblem | null;
    };

type Ready = Extract<DailyPromptState, { status: 'ready' }>;
type DrawingReady = Extract<Ready, { kind: 'theme' | 'technique' }>;

type PromptRecord = Pick<PromptDrawing, 'date' | 'draw' | 'text' | 'drillId'>;

export interface DailyPrompt {
  getState(): DailyPromptState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  reload(): Promise<void>;
  another(): void;
  saveToGallery(): Promise<void>;
  flush(): Promise<void>;
}

function problemOf(error: unknown): StorageProblem {
  return error instanceof StorageError ? error.problem : 'unavailable';
}

function latestDraw(saved: readonly PromptDrawing[]): PromptDrawing | undefined {
  return saved.reduce<PromptDrawing | undefined>(
    (latest, entry) => (!latest || entry.draw > latest.draw ? entry : latest),
    undefined,
  );
}

function recordOf(prompt: ThemePrompt | TechniqueDrillPrompt): PromptRecord {
  if ('drill' in prompt) {
    const { date, draw, drill } = prompt;
    return { date, draw, text: techniqueDrillText(drill), drillId: drill.id };
  }
  return { date: prompt.date, draw: prompt.draw, text: themePromptText(prompt) };
}

export function createDailyPrompt(options: {
  store: Store;
  today: () => CalendarDate;
  course: readonly string[];
  loadDrills: () => Promise<readonly TechniqueDrill[]>;
}): DailyPrompt {
  const { store, today, course, loadDrills } = options;
  let state: DailyPromptState = { status: 'loading' };
  let loadedFor: CalendarDate | undefined;
  let loading: Promise<void> | undefined;
  let stopAutosave = () => {};
  let lastStamp = -Infinity;
  let practice: Practice = { course, attempts: [] };
  let drills: readonly TechniqueDrill[] = [];
  let loadingDrills: Promise<readonly TechniqueDrill[]> | undefined;
  let currentRecord: PromptRecord | undefined;
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<void>>();

  function publish() {
    for (const listener of listeners) listener();
  }

  function ready(): Ready {
    if (state.status !== 'ready') throw new Error('The Daily Prompt has not loaded');
    return state;
  }

  function readyDrawing(): DrawingReady {
    const current = ready();
    if (current.kind === 'review') throw new Error('A Review Drill has no drawing here');
    return current;
  }

  function setState(next: Ready): Ready {
    state = next;
    publish();
    return next;
  }

  function setProblem(problem: StorageProblem | null) {
    if (state.status === 'ready' && state.problem !== problem) setState({ ...state, problem });
  }

  function write(record: PromptRecord, animation: Animation, inGallery: boolean) {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    const done = store
      .putPromptDrawing({ ...record, animation, inGallery, updatedAt: lastStamp })
      .then(
        () => setProblem(null),
        (error: unknown) => setProblem(problemOf(error)),
      );
    pending.add(done);
    void done.finally(() => pending.delete(done));
  }

  function startEditing(animation: Animation, record: PromptRecord): Editor {
    currentRecord = record;
    stopAutosave();
    const editor = createEditor(animation);
    let kept = animation;
    stopAutosave = editor.subscribe(() => {
      const edited = editor.getState().animation;
      if (edited === kept) return;
      kept = edited;
      write(record, edited, readyDrawing().inGallery);
    });
    return editor;
  }

  function blank(prompt: ThemePrompt): Animation {
    return stillAnimation(blankThemePromptDrawing(prompt));
  }

  function resumedPrompt(date: CalendarDate, draw: number, saved: PromptDrawing): DrawnPrompt {
    const drill = drills.find((d) => d.id === saved.drillId);
    if (drill) return { kind: 'technique', drawn: 'technique', date, draw, drill };
    return { kind: 'theme', drawn: 'theme', prompt: themePrompt(date, draw) };
  }

  function drawState(
    date: CalendarDate,
    draw: number,
    saved: PromptDrawing | undefined,
    problem: StorageProblem | null,
  ): Ready {
    const next = saved
      ? resumedPrompt(date, draw, saved)
      : dailyPrompt(date, draw, practice, drills);
    const inGallery = saved?.inGallery ?? false;
    const kept = saved && {
      date,
      draw,
      text: saved.text,
      ...(saved.drillId === undefined ? {} : { drillId: saved.drillId }),
    };
    if (next.kind === 'review') {
      stopAutosave();
      return { status: 'ready', kind: 'review', drill: next, problem };
    }
    if (next.kind === 'technique') {
      const editor = startEditing(
        saved?.animation ?? stillAnimation(next.drill.start),
        kept ?? recordOf(next),
      );
      return { status: 'ready', kind: 'technique', prompt: next, editor, inGallery, problem };
    }
    const { prompt } = next;
    const editor = startEditing(saved?.animation ?? blank(prompt), kept ?? recordOf(prompt));
    return { status: 'ready', kind: 'theme', prompt, editor, inGallery, problem };
  }

  function currentDraw(current: Ready): { date: CalendarDate; draw: number } {
    return current.kind === 'review' ? current.drill : current.prompt;
  }

  async function flush() {
    while (pending.size > 0) await Promise.all(pending);
  }

  function load() {
    const date = today();
    if (loading && loadedFor === date) return loading;
    loadedFor = date;
    loading = (async () => {
      let saved: PromptDrawing[] = [];
      let attempts: PractisedAttempt[] = [];
      let problem: StorageProblem | null = null;
      try {
        [saved, attempts] = await Promise.all([store.listPromptDrawings(), store.listAttempts()]);
      } catch (error) {
        problem = problemOf(error);
      }
      loadingDrills ??= loadDrills().catch(() => {
        loadingDrills = undefined;
        return [];
      });
      drills = await loadingDrills;
      practice = { course, attempts };
      const resumed = latestDraw(saved.filter((entry) => entry.date === date));
      setState(drawState(date, resumed?.draw ?? 0, resumed, problem));
    })();
    return loading;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    async reload() {
      await flush();
      loading = undefined;
      await load();
    },
    another() {
      const current = ready();
      const { date, draw } = currentDraw(current);
      const next = setState(drawState(date, draw + 1, undefined, current.problem));
      if (next.kind !== 'review') write(currentRecord!, next.editor.getState().animation, false);
    },
    async saveToGallery() {
      const current = readyDrawing();
      setState({ ...current, inGallery: true });
      write(currentRecord!, current.editor.getState().animation, true);
      await flush();
    },
    flush,
  };
}
