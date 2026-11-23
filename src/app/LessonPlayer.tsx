import { ChevronLeft, ChevronRight, CircleCheck, Eye, TriangleAlert } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { Drawing } from '../core/drawing';
import { checkStep, type StepCheck } from '../core/evaluate';
import type { Mode, StepKind } from '../core/lesson';
import { LESSON_PASS_SCORE } from '../core/thresholds';
import type { LessonPlay, LessonPlayState } from '../persistence/lesson-play';
import type { StorageProblem } from '../persistence/store';
import type { Control } from './controls';
import { DrawingEditor } from './DrawingEditor';
import { Explanation } from './Explanation';
import { lessonPlayFor, useCourse, useLessonPlay, type CourseLesson } from './lessons-store';
import { Nav } from './Nav';
import { plural } from './plural';
import { routeHref } from './router';

const STEP_NAMES: Record<StepKind, string> = {
  silhouette: 'Silhouette',
  outline: 'Outline',
  base: 'Base colors',
  shadow: 'Shadow',
  highlight: 'Highlight',
};

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable:
    'this Lesson will not be saved because site data is blocked. Try non-private mode, or another browser.',
  full: "browser storage is full, so your latest pixels and Attempts aren't saved.",
};

function percent(score: number) {
  return `${Math.floor(score * 100)}%`;
}

function Loading() {
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="lesson-layout" aria-busy="true" />
    </div>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="card message-card">
        <h1>This Lesson can't be played</h1>
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
  if (course.status === 'loading') return <Loading />;
  if (course.status === 'failed') return <Problem message={course.message} />;
  const entry = course.lessons.find((l) => l.lesson.id === lessonId);
  if (!entry) return <Problem message={`There is no Lesson called ${lessonId}.`} />;
  return <TraceLesson entry={entry} mode={mode} />;
}

function TraceLesson({ entry, mode }: { entry: CourseLesson; mode: Mode }) {
  const handle = lessonPlayFor(entry.lesson, mode);
  const state = useLessonPlay(handle);
  if (state.status === 'loading') return <Loading />;
  return <TraceSession entry={entry} play={handle.play} state={state} />;
}

function checkSummary(check: StepCheck, stepName: string) {
  if (check.missing.length === 0 && check.extra.length === 0) {
    return `Every ${stepName.toLowerCase()} pixel is right.`;
  }
  return `${plural(check.missing.length, 'pixel')} missing, ${check.extra.length} extra. Missing pixels are marked with an amber square, extra pixels with a red cross.`;
}

function TraceSession({
  entry,
  play,
  state,
}: {
  entry: CourseLesson;
  play: LessonPlay;
  state: Extract<LessonPlayState, { status: 'ready' }>;
}) {
  const { lesson } = entry;
  const { editor, problem, result } = state;
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [stepIndex, setStepIndex] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [checked, setChecked] = useState<{
    stepIndex: number;
    drawing: Drawing;
    check: StepCheck;
  } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const step = lesson.steps[stepIndex]!;
  const stepName = STEP_NAMES[step.kind];
  const check =
    checked && checked.stepIndex === stepIndex && checked.drawing === drawing
      ? checked.check
      : null;
  const isLastStep = stepIndex === lesson.steps.length - 1;

  function goToStep(index: number) {
    setStepIndex(Math.min(lesson.steps.length - 1, Math.max(0, index)));
  }

  function runCheck() {
    setChecked({ stepIndex, drawing, check: checkStep(lesson, stepIndex, drawing) });
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
    {
      label: 'Guide',
      Icon: Eye,
      chords: [{ key: 't' }],
      run: () => setShowGuide((g) => !g),
      pressed: showGuide,
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
          overlay={{
            guide: showGuide ? step.target : null,
            missing: check?.missing ?? [],
            extra: check?.extra ?? [],
          }}
        >
          {problem && (
            <div className="warning-banner" role="alert">
              <TriangleAlert aria-hidden size={20} />
              <p>
                <strong>Warning:</strong> {STORAGE_MESSAGES[problem]}
              </p>
            </div>
          )}
        </DrawingEditor>
        <aside className="card lesson-panel" aria-labelledby="lesson-title">
          <p className="hint">Trace</p>
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
          <p className="check-result" role="status">
            {check && checkSummary(check, stepName)}
          </p>
          <div className="lesson-actions">
            <button type="button" className="btn" onClick={runCheck}>
              Check Step
            </button>
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
                  ` You need ${percent(LESSON_PASS_SCORE)} to pass. Check each Step to find the pixels to fix.`}
              </p>
              <div className="lesson-actions">
                {!result.passed && (
                  <button type="button" className="btn primary" onClick={play.dismissResult}>
                    Keep drawing
                  </button>
                )}
                <button type="button" className="btn" onClick={() => void startOver()}>
                  Start over
                </button>
                <a className={`btn${result.passed ? ' primary' : ''}`} href={routeHref.lessons}>
                  Back to Lessons
                </a>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
