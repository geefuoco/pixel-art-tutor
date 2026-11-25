import { CircleCheck } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { MAX_DRAWING_SIZE, type Drawing } from '../core/drawing';
import { passScore } from '../core/evaluate';
import type { FreehandSubScores } from '../core/freehand';
import { findMistakes, type Mistake } from '../core/mistakes';
import type { LessonPlay, LessonPlayState } from '../persistence/lesson-play';
import type { Control } from './controls';
import { DrawingEditor } from './DrawingEditor';
import { LESSON_STORAGE_MESSAGES } from './lesson-storage-messages';
import type { LessonEntry } from './lessons-store';
import { MistakeList } from './MistakeList';
import { Nav } from './Nav';
import { percent } from './percent';
import { lessonAttemptsHref, routeHref } from './router';
import { SUB_SCORE_KEYS, SUB_SCORE_NAMES } from './sub-score-names';
import { thumbnail } from './thumbnail';
import { WarningBanner } from './WarningBanner';

const LARGER_CANVAS_SIZES = [16, 24, 32, 48, MAX_DRAWING_SIZE];

function canvasSizes(lessonSize: number): number[] {
  return [lessonSize, ...LARGER_CANVAS_SIZES.filter((s) => s > lessonSize)];
}

function SubScores({ subScores }: { subScores: FreehandSubScores }) {
  return (
    <dl className="sub-scores" aria-label="Sub-scores">
      {SUB_SCORE_KEYS.map((key) => (
        <div key={key}>
          <dt>{SUB_SCORE_NAMES[key]}</dt>
          <dd>{percent(subScores[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FreehandSession({
  entry,
  play,
  state,
}: {
  entry: LessonEntry;
  play: LessonPlay;
  state: Extract<LessonPlayState, { status: 'ready' }>;
}) {
  const { lesson } = entry;
  const { editor, problem, result } = state;
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [checked, setChecked] = useState<{
    drawing: Drawing;
    mistakes: readonly Mistake[];
  } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const freshMistakes = checked?.drawing === drawing ? checked.mistakes : null;
  const shownMistakes = result?.mistakes ?? freshMistakes;

  function runCheck() {
    setChecked({
      drawing,
      mistakes: findMistakes(drawing, { colorBudget: lesson.palette.length }),
    });
  }

  async function finish() {
    setFinishing(true);
    try {
      await play.finish();
    } finally {
      setFinishing(false);
    }
  }

  const actions: Control[] = [
    { label: 'Check drawing', Icon: CircleCheck, chords: [{ key: 'c' }], run: runCheck },
  ];

  return (
    <div className="page lesson">
      <Nav current="lessons" />
      <div className="lesson-layout">
        <DrawingEditor
          editor={editor}
          canvasLabel={`Lesson canvas, ${drawing.width} by ${drawing.height} pixels`}
          trailingActions={actions}
          marks={{
            guide: null,
            missing: [],
            extra: [],
            mistakes: shownMistakes?.flatMap((m) => m.pixels) ?? [],
          }}
        >
          {problem && <WarningBanner>{LESSON_STORAGE_MESSAGES[problem]}</WarningBanner>}
        </DrawingEditor>
        <aside className="card lesson-panel" aria-labelledby="lesson-title">
          <p className="hint">Freehand</p>
          <h1 id="lesson-title">{lesson.title}</h1>
          <figure className="reference">
            <img
              className="reference-sprite"
              src={thumbnail(lesson.reference)}
              alt={`Reference Sprite: ${lesson.title}`}
            />
            <figcaption className="hint">
              Draw this from scratch, anywhere on the canvas. It does not need to be the same size
              to the pixel.
            </figcaption>
          </figure>
          <label className="canvas-size">
            Canvas size
            <select
              value={drawing.width}
              disabled={result !== null}
              onChange={(e) => play.enlargeCanvas(Number(e.currentTarget.value))}
            >
              {canvasSizes(lesson.size).map((size) => (
                <option key={size} value={size} disabled={size < drawing.width}>
                  {size}x{size}
                </option>
              ))}
            </select>
          </label>
          {freshMistakes && !result && <MistakeList mistakes={freshMistakes} />}
          <div className="lesson-actions">
            <button type="button" className="btn" onClick={runCheck}>
              Check drawing
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={finishing}
              onClick={() => void finish()}
            >
              Finish Lesson
            </button>
          </div>
          {result && (
            <section className="lesson-result" aria-label="Result">
              <h2>{result.passed ? 'Lesson passed' : 'Not passed yet'}</h2>
              <p>
                Your overall score is {percent(result.score)}.
                {!result.passed && ` You need ${percent(passScore('freehand'))} to pass.`}
              </p>
              {result.subScores && <SubScores subScores={result.subScores} />}
              {result.inGallery && (
                <p>
                  Saved to the <a href={routeHref.gallery}>Gallery</a>.
                </p>
              )}
              {result.mistakes && <MistakeList mistakes={result.mistakes} />}
              <div className="lesson-actions">
                {!result.passed && (
                  <button type="button" className="btn primary" onClick={play.dismissResult}>
                    Keep drawing
                  </button>
                )}
                <button type="button" className="btn" onClick={() => void play.startOver()}>
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
