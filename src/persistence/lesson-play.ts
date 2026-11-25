import { frameDrawing, type Animation } from '../core/animation';
import { enlargeCanvas, TRANSPARENT } from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { passesMode, scoreLessonAttempt } from '../core/evaluate';
import { scoreFreehand, type FreehandSubScores } from '../core/freehand';
import type { Lesson, Mode } from '../core/lesson';
import type { Mistake } from '../core/mistakes';
import type { CourseProgress } from './course-progress';
import { StorageError, type Store, type StorageProblem } from './store';

export interface AttemptResult {
  readonly score: number;
  readonly passed: boolean;
  readonly hintFlashes: number;
  readonly inGallery: boolean;
  readonly subScores?: FreehandSubScores;
  readonly mistakes?: readonly (readonly Mistake[])[];
}

export type LessonPlayState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly editor: Editor;
      readonly hintFlashes: number;
      readonly problem: StorageProblem | null;
      readonly result: AttemptResult | null;
    };

export interface LessonPlay {
  getState(): LessonPlayState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  finish(): Promise<AttemptResult>;
  flashGuide(): void;
  enlargeCanvas(size: number): void;
  saveToGallery(): Promise<void>;
  dismissResult(): void;
  startOver(): Promise<void>;
  flush(): Promise<void>;
}

function scored(lesson: Lesson, mode: Mode, attempt: Animation) {
  if (mode !== 'freehand') return { score: scoreLessonAttempt(lesson, attempt) };
  const { overall, mistakes, ...subScores } = scoreFreehand(lesson, attempt);
  return { score: overall, subScores, mistakes };
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
  let finishedAttemptId: string | undefined;
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<boolean>>();

  function update(next: Partial<Extract<LessonPlayState, { status: 'ready' }>>) {
    state = { ...ready(), ...next };
    for (const listener of listeners) listener();
  }

  function track(saving: Promise<void>): Promise<boolean> {
    const done = saving.then(
      () => {
        if (state.status === 'ready' && state.problem !== null) update({ problem: null });
        return true;
      },
      (error: unknown) => {
        if (state.status === 'ready') update({ problem: problemOf(error) });
        return false;
      },
    );
    pending.add(done);
    void done.finally(() => pending.delete(done));
    return done;
  }

  function ready() {
    if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
    return state;
  }

  function autosave() {
    const { editor, hintFlashes } = ready();
    void track(
      store.putInProgressAttempt({
        lessonId: lesson.id,
        mode,
        animation: editor.getState().animation,
        hintFlashes,
        updatedAt: now(),
      }),
    );
  }

  function startEditing(animation = blank()): Editor {
    stopAutosave();
    const editor = createEditor(animation);
    stopAutosave = editor.subscribe(autosave);
    return editor;
  }

  function blank(): Animation {
    const { frames } = lesson.animation;
    return { ...lesson.animation, frames: frames.map((f) => f.map(() => TRANSPARENT)) };
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
        state = {
          status: 'ready',
          editor: startEditing(saved?.animation),
          hintFlashes: saved?.hintFlashes ?? 0,
          problem,
          result: null,
        };
        for (const listener of listeners) listener();
      })();
      return loading;
    },
    async finish() {
      const { editor, hintFlashes } = ready();
      const { animation } = editor.getState();
      const { score, subScores, mistakes } = scored(lesson, mode, animation);
      const passed = passesMode(mode, score);
      const inGallery = passed || mode === 'freehand';
      const id = crypto.randomUUID();
      await flush();
      const saved = await track(
        store.saveAttempt(
          {
            id,
            lessonId: lesson.id,
            mode,
            animation,
            score,
            ...(subScores && { subScores }),
            hintFlashes,
            inGallery,
            finishedAt: now(),
          },
          { passed },
        ),
      );
      finishedAttemptId = saved ? id : undefined;
      const result: AttemptResult = {
        score,
        passed,
        hintFlashes,
        inGallery: saved && inGallery,
        ...(subScores && { subScores, mistakes }),
      };
      if (result.passed) progress.notePass(lesson.id, mode);
      update({ result });
      return result;
    },
    flashGuide() {
      update({ hintFlashes: ready().hintFlashes + 1 });
      autosave();
    },
    enlargeCanvas(size) {
      const { animation } = ready().editor.getState();
      const frames = animation.frames.map(
        (_, frame) => enlargeCanvas(frameDrawing(animation, frame), size).pixels,
      );
      const editor = startEditing({ ...animation, width: size, height: size, frames });
      update({ editor, result: null });
      autosave();
    },
    async saveToGallery() {
      const { result } = ready();
      if (!result || !finishedAttemptId) return;
      if (await track(store.saveAttemptToGallery(finishedAttemptId))) {
        update({ result: { ...result, inGallery: true } });
      }
    },
    dismissResult() {
      update({ result: null });
    },
    async startOver() {
      await flush();
      await track(store.deleteInProgressAttempt(lesson.id, mode));
      update({ editor: startEditing(), hintFlashes: 0, result: null });
    },
    flush,
  };
}
