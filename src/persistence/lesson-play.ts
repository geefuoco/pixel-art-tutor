import { createDrawing } from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { passesLesson, scoreLessonDrawing } from '../core/evaluate';
import type { Lesson, Mode } from '../core/lesson';
import type { CourseProgress } from './course-progress';
import { StorageError, type Store, type StorageProblem } from './store';

export interface AttemptResult {
  readonly score: number;
  readonly passed: boolean;
}

export type LessonPlayState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly editor: Editor;
      readonly problem: StorageProblem | null;
      readonly result: AttemptResult | null;
    };

export interface LessonPlay {
  getState(): LessonPlayState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  finish(): Promise<AttemptResult>;
  dismissResult(): void;
  startOver(): Promise<void>;
  flush(): Promise<void>;
}

function problemOf(error: unknown): StorageProblem {
  return error instanceof StorageError ? error.problem : 'unavailable';
}

export function createLessonPlay(options: {
  store: Store;
  lesson: Lesson;
  mode: Mode;
  progress: Pick<CourseProgress, 'notePass'>;
  now?: () => number;
}): LessonPlay {
  const { store, lesson, mode, progress, now = Date.now } = options;
  let state: LessonPlayState = { status: 'loading' };
  let loading: Promise<void> | undefined;
  let stopAutosave = () => {};
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<void>>();

  function update(next: Partial<Extract<LessonPlayState, { status: 'ready' }>>) {
    if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  function track(saving: Promise<void>) {
    const done = saving.then(
      () => {
        if (state.status === 'ready' && state.problem !== null) update({ problem: null });
      },
      (error: unknown) => {
        if (state.status === 'ready') update({ problem: problemOf(error) });
      },
    );
    pending.add(done);
    void done.finally(() => pending.delete(done));
    return done;
  }

  function startEditing(drawing = blank()): Editor {
    stopAutosave();
    const editor = createEditor(drawing);
    stopAutosave = editor.subscribe(() => {
      void track(
        store.putInProgressAttempt({
          lessonId: lesson.id,
          mode,
          drawing: editor.getState().drawing,
          updatedAt: now(),
        }),
      );
    });
    return editor;
  }

  function blank() {
    return createDrawing({ width: lesson.size, height: lesson.size, palette: lesson.palette });
  }

  async function flush() {
    while (pending.size > 0) await Promise.all(pending);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      loading ??= (async () => {
        let problem: StorageProblem | null = null;
        let saved;
        try {
          saved = await store.getInProgressAttempt(lesson.id, mode);
        } catch (error) {
          problem = problemOf(error);
        }
        state = { status: 'ready', editor: startEditing(saved?.drawing), problem, result: null };
        for (const listener of listeners) listener();
      })();
      return loading;
    },
    async finish() {
      if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
      const drawing = state.editor.getState().drawing;
      const score = scoreLessonDrawing(lesson, drawing);
      const result = { score, passed: passesLesson(score) };
      await flush();
      await track(
        store.saveAttempt(
          {
            id: crypto.randomUUID(),
            lessonId: lesson.id,
            mode,
            drawing,
            score,
            finishedAt: now(),
          },
          { passed: result.passed },
        ),
      );
      if (result.passed) progress.notePass(lesson.id, mode);
      update({ result });
      return result;
    },
    dismissResult() {
      update({ result: null });
    },
    async startOver() {
      await flush();
      await track(store.deleteInProgressAttempt(lesson.id, mode));
      update({ editor: startEditing(), result: null });
    },
    flush,
  };
}
