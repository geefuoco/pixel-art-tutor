import { ChevronLeft, ChevronRight, CircleCheck, Eye, Lightbulb } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { Drawing } from '../core/drawing';
import { checkStep, passScore, type StepCheck } from '../core/evaluate';
import type { Mode, StepKind } from '../core/lesson';
import { findMistakes, type Mistake } from '../core/mistakes';
import type { LessonPlay, LessonPlayState } from '../persistence/lesson-play';
import type { Control } from './controls';
import { DrawingEditor } from './DrawingEditor';
import { Explanation } from './Explanation';
import { FreehandSession } from './FreehandSession';
import { LESSON_STORAGE_MESSAGES } from './lesson-storage-messages';
import { lessonPlayFor, useLessonPlay } from './lesson-plays';
import { useCourse, type CourseLesson } from './lessons-store';
import { MistakeList } from './MistakeList';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { useCourseProgress } from './progress-store';
import { unlockMessage } from './unlock-message';
import { WarningBanner } from './WarningBanner';
import { percent } from './percent';
import { plural } from './plural';
import { lessonAttemptsHref, routeHref } from './router';

const STEP_NAMES: Record<StepKind, string> = {
  silhouette: 'Silhouette',
  outline: 'Outline',
  base: 'Base colors',
  shadow: 'Shadow',
  highlight: 'Highlight',
};

const GUIDE_FLASH_MS = 1500;

function Loading() {
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="lesson-layout" aria-busy="true" />
    </div>
  );
}

function Problem({
  message,
  title = "This Lesson can't be played",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="card message-card">
        <h1>{title}</h1>
        <p role="alert">{message}</p>
        <a className="btn primary" href={routeHref.lessons}>
          Back to Lessons
        </a>
      </main>
    </div>
  );
}

export function LessonPlayer({ lessonId, mode }: { lessonId: string; mode: Mode }) {
  const course = useCourse();
  const progress = useCourseProgress();
  if (course.status === 'failed') return <Problem message={course.message} />;
  if (course.status === 'loading' || progress.status === 'loading') return <Loading />;
  const entry = course.lessons.find((l) => l.lesson.id === lessonId);
  if (!entry) return <Problem message={`There is no Lesson called ${lessonId}.`} />;
  const locked = unlockMessage(course.lessons, progress.progress, lessonId, mode);
  if (locked) return <Problem title={`${MODE_NAMES[mode]} is locked`} message={locked} />;
  return <PlayedLesson entry={entry} mode={mode} />;
}

type StepMode = Exclude<Mode, 'freehand'>;

function PlayedLesson({ entry, mode }: { entry: CourseLesson; mode: Mode }) {
  const handle = lessonPlayFor(entry.lesson, mode);
  const state = useLessonPlay(handle);
  if (state.status === 'loading') return <Loading />;
  if (mode === 'freehand')
    return <FreehandSession entry={entry} play={handle.play} state={state} />;
  return <LessonSession entry={entry} mode={mode} play={handle.play} state={state} />;
}

function flashSummary(hintFlashes: number) {
  return hintFlashes === 0
    ? 'You did not use Show me.'
    : `You used Show me ${plural(hintFlashes, 'time')}.`;
}

function checkSummary(check: StepCheck, stepName: string) {
  if (check.missing.length === 0 && check.extra.length === 0) {
    return `Every ${stepName.toLowerCase()} pixel is right.`;
  }
  return `${plural(check.missing.length, 'pixel')} missing, ${check.extra.length} extra. Missing pixels are marked with an amber square, extra pixels with a red cross.`;
}

function LessonSession({
  entry,
  mode,
  play,
  state,
}: {
  entry: CourseLesson;
  mode: StepMode;
  play: LessonPlay;
  state: Extract<LessonPlayState, { status: 'ready' }>;
}) {
  const { lesson } = entry;
  const { editor, problem, result } = state;
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [stepIndex, setStepIndex] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [flashing, setFlashing] = useState(false);
  const [checked, setChecked] = useState<{
    stepIndex: number;
    drawing: Drawing;
    check: StepCheck;
    mistakes: readonly Mistake[];
  } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const step = lesson.steps[stepIndex]!;
  const stepName = STEP_NAMES[step.kind];
  const freshCheck =
    checked && checked.stepIndex === stepIndex && checked.drawing === drawing ? checked : null;
  const check = freshCheck?.check ?? null;
  const isLastStep = stepIndex === lesson.steps.length - 1;

  function goToStep(index: number) {
    setStepIndex(Math.min(lesson.steps.length - 1, Math.max(0, index)));
  }

  function runCheck() {
    setChecked({
      stepIndex,
      drawing,
      check: checkStep(lesson, stepIndex, drawing),
      mistakes: findMistakes(drawing),
    });
  }

  function showMe() {
    if (flashing) return;
    play.flashGuide();
    setFlashing(true);
    window.setTimeout(() => setFlashing(false), GUIDE_FLASH_MS);
  }

  async function finish() {
    setFinishing(true);
    try {
      await play.finish();
    } finally {
      setFinishing(false);
    }
  }

  async function startOver() {
    await play.startOver();
    setStepIndex(0);
  }

  const lessonActions: Control[] = [
    {
      label: 'Previous Step',
      Icon: ChevronLeft,
      chords: [{ key: '[' }],
      run: () => goToStep(stepIndex - 1),
      disabled: stepIndex === 0,
    },
    {
      label: 'Next Step',
      Icon: ChevronRight,
      chords: [{ key: ']' }],
      run: () => goToStep(stepIndex + 1),
      disabled: isLastStep,
    },
    mode === 'trace'
      ? {
          label: 'Guide',
          Icon: Eye,
          chords: [{ key: 't' }],
          run: () => setShowGuide((g) => !g),
          pressed: showGuide,
        }
      : {
          label: 'Show me',
          Icon: Lightbulb,
          chords: [{ key: 'h' }],
          run: showMe,
        },
    {
      label: 'Check Step',
      Icon: CircleCheck,
      chords: [{ key: 'c' }],
      run: runCheck,
    },
  ];

  return (
    <div className="page lesson">
      <Nav current="lessons" />
      <div className="lesson-layout">
        <DrawingEditor
          editor={editor}
          canvasLabel={`Lesson canvas, ${lesson.size} by ${lesson.size} pixels`}
          trailingActions={lessonActions}
          marks={{
            guide: (mode === 'trace' ? showGuide : flashing) ? step.target : null,
            missing: check?.missing ?? [],
            extra: check?.extra ?? [],
            mistakes: freshCheck?.mistakes.flatMap((m) => m.pixels) ?? [],
          }}
        >
          {problem && <WarningBanner>{LESSON_STORAGE_MESSAGES[problem]}</WarningBanner>}
        </DrawingEditor>
        <aside className="card lesson-panel" aria-labelledby="lesson-title">
          <p className="hint">{MODE_NAMES[mode]}</p>
          <h1 id="lesson-title">{lesson.title}</h1>
          <ol className="step-list" aria-label="Steps">
            {lesson.steps.map((s, i) => (
              <li key={s.kind}>
                <button
                  type="button"
                  className="step-button"
                  aria-current={i === stepIndex ? 'step' : undefined}
                  onClick={() => goToStep(i)}
                >
                  {i + 1}. {STEP_NAMES[s.kind]}
                </button>
              </li>
            ))}
          </ol>
          <section aria-labelledby="step-title" className="step">
            <h2 id="step-title">
              Step {stepIndex + 1}: {stepName}
            </h2>
            <Explanation markdown={step.explanation} resolve={entry.exampleUrl} />
          </section>
          {mode === 'hint' && (
            <p className="hint">
              Show me (H) flashes the Guide for a moment. It does not change your score.
            </p>
          )}
          <p className="check-result" role="status">
            {check && checkSummary(check, stepName)}
          </p>
          {freshCheck && <MistakeList mistakes={freshCheck.mistakes} />}
          <div className="lesson-actions">
            <button type="button" className="btn" onClick={runCheck}>
              Check Step
            </button>
            {mode === 'hint' && (
              <button type="button" className="btn" onClick={showMe}>
                Show me
              </button>
            )}
            {isLastStep ? (
              <button
                type="button"
                className="btn primary"
                disabled={finishing}
                onClick={() => void finish()}
              >
                Finish Lesson
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => goToStep(stepIndex + 1)}>
                Next Step
              </button>
            )}
          </div>
          {result && (
            <section className="lesson-result" aria-label="Result">
              <h2>{result.passed ? 'Lesson passed' : 'Not passed yet'}</h2>
              <p>
                Your drawing matches {percent(result.score)} of the Reference Sprite.
                {!result.passed &&
                  ` You need ${percent(passScore(mode))} to pass. Check each Step to find the pixels to fix.`}
              </p>
              {mode === 'hint' && <p>{flashSummary(result.hintFlashes)}</p>}
              {result.inGallery && (
                <p>
                  Saved to the <a href={routeHref.gallery}>Gallery</a>.
                </p>
              )}
              <div className="lesson-actions">
                {!result.passed && (
                  <button type="button" className="btn primary" onClick={play.dismissResult}>
                    Keep drawing
                  </button>
                )}
                {!result.inGallery && (
                  <button type="button" className="btn" onClick={() => void play.saveToGallery()}>
                    Save to Gallery
                  </button>
                )}
                <button type="button" className="btn" onClick={() => void startOver()}>
                  Start over
                </button>
                <a className={`btn${result.passed ? ' primary' : ''}`} href={routeHref.lessons}>
                  Back to Lessons
                </a>
                <a className="btn" href={lessonAttemptsHref(lesson.id)}>
                  All Attempts
                </a>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
