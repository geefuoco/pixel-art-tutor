import { stillAnimation, type Animation } from '../core/animation';
import type { CalendarDate } from '../core/calendar-date';
import {
  dailyPrompt,
  type Practice,
  type PractisedAttempt,
  type ReviewDrill,
} from '../core/daily-prompt';
import { createEditor, type Editor } from '../core/editor';
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
      readonly kind: 'review';
      readonly drill: ReviewDrill;
      readonly problem: StorageProblem | null;
    };

type Ready = Extract<DailyPromptState, { status: 'ready' }>;
type ThemeReady = Extract<Ready, { kind: 'theme' }>;

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

export function createDailyPrompt(options: {
  store: Store;
  today: () => CalendarDate;
  course: readonly string[];
}): DailyPrompt {
  const { store, today, course } = options;
  let state: DailyPromptState = { status: 'loading' };
  let loadedFor: CalendarDate | undefined;
  let loading: Promise<void> | undefined;
  let stopAutosave = () => {};
  let lastStamp = -Infinity;
  let practice: Practice = { course, attempts: [] };
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<void>>();

  function publish() {
    for (const listener of listeners) listener();
  }

  function ready(): Ready {
    if (state.status !== 'ready') throw new Error('The Daily Prompt has not loaded');
    return state;
  }

  function readyTheme(): ThemeReady {
    const current = ready();
    if (current.kind !== 'theme') throw new Error('The Daily Prompt is not a Theme Prompt');
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

  function write(prompt: ThemePrompt, animation: Animation, inGallery: boolean) {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    const done = store
      .putPromptDrawing({
        date: prompt.date,
        draw: prompt.draw,
        text: themePromptText(prompt),
        animation,
        inGallery,
        updatedAt: lastStamp,
      })
      .then(
        () => setProblem(null),
        (error: unknown) => setProblem(problemOf(error)),
      );
    pending.add(done);
    void done.finally(() => pending.delete(done));
  }

  function startEditing(prompt: ThemePrompt, animation: Animation): Editor {
    stopAutosave();
    const editor = createEditor(animation);
    let kept = animation;
    stopAutosave = editor.subscribe(() => {
      const edited = editor.getState().animation;
      if (edited === kept) return;
      kept = edited;
      write(prompt, edited, readyTheme().inGallery);
    });
    return editor;
  }

  function blank(prompt: ThemePrompt): Animation {
    return stillAnimation(blankThemePromptDrawing(prompt));
  }

  function drawState(
    date: CalendarDate,
    draw: number,
    saved: { animation: Animation; inGallery: boolean } | undefined,
    problem: StorageProblem | null,
  ): Ready {
    const next = saved ? null : dailyPrompt(date, draw, practice);
    if (next?.kind === 'review') {
      stopAutosave();
      return { status: 'ready', kind: 'review', drill: next, problem };
    }
    const prompt = next?.prompt ?? themePrompt(date, draw);
    const editor = startEditing(prompt, saved?.animation ?? blank(prompt));
    const inGallery = saved?.inGallery ?? false;
    return { status: 'ready', kind: 'theme', prompt, editor, inGallery, problem };
  }

  function currentDraw(current: Ready): { date: CalendarDate; draw: number } {
    return current.kind === 'theme' ? current.prompt : current.drill;
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
      if (next.kind === 'theme') write(next.prompt, next.editor.getState().animation, false);
    },
    async saveToGallery() {
      const current = readyTheme();
      setState({ ...current, inGallery: true });
      write(current.prompt, current.editor.getState().animation, true);
      await flush();
    },
    flush,
  };
}
