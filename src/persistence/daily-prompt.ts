import { stillAnimation, type Animation } from '../core/animation';
import type { CalendarDate } from '../core/calendar-date';
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
      readonly prompt: ThemePrompt;
      readonly editor: Editor;
      readonly inGallery: boolean;
      readonly problem: StorageProblem | null;
    };

type Ready = Extract<DailyPromptState, { status: 'ready' }>;

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
  now?: () => number;
}): DailyPrompt {
  const { store, today, now = Date.now } = options;
  let state: DailyPromptState = { status: 'loading' };
  let loadedFor: CalendarDate | undefined;
  let loading: Promise<void> | undefined;
  let stopAutosave = () => {};
  let lastStamp = -Infinity;
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<void>>();

  function publish() {
    for (const listener of listeners) listener();
  }

  function ready(): Ready {
    if (state.status !== 'ready') throw new Error('The Daily Prompt has not loaded');
    return state;
  }

  function update(next: Partial<Ready>) {
    state = { ...ready(), ...next };
    publish();
  }

  function setProblem(problem: StorageProblem | null) {
    if (state.status === 'ready' && state.problem !== problem) update({ problem });
  }

  function write(prompt: ThemePrompt, animation: Animation, inGallery: boolean) {
    lastStamp = Math.max(now(), lastStamp + 1);
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
      write(prompt, edited, ready().inGallery);
    });
    return editor;
  }

  function blank(prompt: ThemePrompt): Animation {
    return stillAnimation(blankThemePromptDrawing(prompt));
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
      let problem: StorageProblem | null = null;
      try {
        saved = (await store.listPromptDrawings()).filter((entry) => entry.date === date);
      } catch (error) {
        problem = problemOf(error);
      }
      const resumed = latestDraw(saved);
      const prompt = themePrompt(date, resumed?.draw ?? 0);
      const editor = startEditing(prompt, resumed?.animation ?? blank(prompt));
      state = { status: 'ready', prompt, editor, inGallery: resumed?.inGallery ?? false, problem };
      publish();
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
      const { prompt } = ready();
      const next = themePrompt(prompt.date, prompt.draw + 1);
      const animation = blank(next);
      update({ prompt: next, editor: startEditing(next, animation), inGallery: false });
      write(next, animation, false);
    },
    async saveToGallery() {
      const { prompt, editor } = ready();
      update({ inGallery: true });
      write(prompt, editor.getState().animation, true);
      await flush();
    },
    flush,
  };
}
