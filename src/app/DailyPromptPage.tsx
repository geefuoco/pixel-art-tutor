import { useState, useSyncExternalStore } from 'react';
import type { ReviewDrill, TechniqueDrillPrompt } from '../core/daily-prompt';
import type { Drawing } from '../core/drawing';
import type { Editor } from '../core/editor';
import type { Mistake } from '../core/mistakes';
import { techniqueDrillFeedback } from '../core/technique-drill-feedback';
import { themePromptText, type ThemePrompt } from '../core/theme-prompt';
import {
  themePromptFeedback,
  type CheckOutcome,
  type PromptCheck,
} from '../core/theme-prompt-feedback';
import { techniqueDrillText } from '../persistence/daily-prompt';
import type { StorageProblem } from '../persistence/store';
import { formatCalendarDate } from './calendar-date-format';
import { dailyPrompt, useDailyPrompt } from './daily-prompt-store';
import { DrawingEditor } from './DrawingEditor';
import { useCourse } from './lessons-store';
import { MistakeList } from './MistakeList';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { lessonHref, routeHref } from './router';
import { TilingPreview } from './TilingPreview';
import { WarningBanner } from './WarningBanner';

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable: 'site data is blocked, so this drawing will be lost when you leave the page.',
  full: 'browser storage is full, so your latest changes could not be kept.',
};

const OUTCOME_NAMES: Record<CheckOutcome, string> = {
  met: 'Met',
  unmet: 'Not met',
  'not-checked': 'Not checked',
};

export function DailyPromptPage() {
  const state = useDailyPrompt();
  if (state.status === 'loading') {
    return (
      <div className="page lesson">
        <Nav current="daily" />
        <main className="lesson-layout" aria-busy="true" />
      </div>
    );
  }
  if (state.kind === 'review') {
    return <ReviewDrillCard drill={state.drill} problem={state.problem} />;
  }
  if (state.kind === 'technique') {
    return (
      <TechniqueDrillSession
        drill={state.drill}
        editor={state.editor}
        inGallery={state.inGallery}
        problem={state.problem}
      />
    );
  }
  return (
    <ThemePromptSession
      prompt={state.prompt}
      editor={state.editor}
      inGallery={state.inGallery}
      problem={state.problem}
    />
  );
}

function promptLabel({ date, draw }: { date: string; draw: number }): string {
  return `Daily Prompt for ${formatCalendarDate(date)}${draw > 0 ? `, prompt ${draw + 1}` : ''}`;
}

function ReviewDrillCard({
  drill,
  problem,
}: {
  drill: ReviewDrill;
  problem: StorageProblem | null;
}) {
  const course = useCourse();
  const lesson =
    course.status === 'ready'
      ? course.lessons.find((entry) => entry.lesson.id === drill.lessonId)
      : undefined;
  const title = lesson?.lesson.title ?? 'a Lesson you passed';
  const mode = MODE_NAMES[drill.mode];
  return (
    <div className="page">
      <Nav current="daily" />
      <main className="card message-card" aria-labelledby="prompt-title">
        {problem && <WarningBanner>{STORAGE_MESSAGES[problem]}</WarningBanner>}
        <p className="hint">{promptLabel(drill)}</p>
        <h1 id="prompt-title">
          Review Drill: {title} in {mode}
        </h1>
        {lesson && <img className="reference-sprite" src={lesson.referenceUrl} alt="" />}
        <p>
          Of the Lessons you have passed, this is the one you practised least recently. Play it
          again in {mode}.
        </p>
        <div className="message-actions">
          <a className="btn primary" href={lessonHref(drill.lessonId, drill.mode)}>
            Start the Review Drill
          </a>
          <button type="button" className="btn" onClick={dailyPrompt.another}>
            Give me another
          </button>
        </div>
      </main>
    </div>
  );
}

function ThemePromptSession({
  prompt,
  editor,
  inGallery,
  problem,
}: {
  prompt: ThemePrompt;
  editor: Editor;
  inGallery: boolean;
  problem: StorageProblem | null;
}) {
  return (
    <PromptDrawingSession
      label={promptLabel(prompt)}
      title={themePromptText(prompt)}
      intro="A Theme Prompt is not scored. Check your drawing to see its Mistakes and which parts of the prompt it meets. Your drawing is kept as you go."
      checksTitle="The prompt"
      feedbackFor={(drawing) => themePromptFeedback(prompt, drawing)}
      tiling={false}
      editor={editor}
      inGallery={inGallery}
      problem={problem}
    />
  );
}

function TechniqueDrillSession({
  drill,
  editor,
  inGallery,
  problem,
}: {
  drill: TechniqueDrillPrompt;
  editor: Editor;
  inGallery: boolean;
  problem: StorageProblem | null;
}) {
  return (
    <PromptDrawingSession
      label={promptLabel(drill)}
      title={techniqueDrillText(drill.drill)}
      intro={drill.drill.instruction}
      checksTitle="The drill"
      feedbackFor={(drawing) => techniqueDrillFeedback(drill.drill, drawing)}
      tiling={drill.drill.seamless.length > 0}
      editor={editor}
      inGallery={inGallery}
      problem={problem}
    />
  );
}

function PromptDrawingSession({
  label,
  title,
  intro,
  checksTitle,
  feedbackFor,
  tiling,
  editor,
  inGallery,
  problem,
}: {
  label: string;
  title: string;
  intro: string;
  checksTitle: string;
  feedbackFor: (drawing: Drawing) => {
    checks: readonly PromptCheck[];
    mistakes: readonly Mistake[];
  };
  tiling: boolean;
  editor: Editor;
  inGallery: boolean;
  problem: StorageProblem | null;
}) {
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [checkedEditor, setCheckedEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const feedback = checkedEditor === editor ? feedbackFor(drawing) : null;

  async function saveToGallery() {
    setSaving(true);
    try {
      await dailyPrompt.saveToGallery();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page lesson">
      <Nav current="daily" />
      <div className="lesson-layout">
        <DrawingEditor
          editor={editor}
          canvasLabel={`Daily Prompt canvas, ${drawing.width} by ${drawing.height} pixels`}
          marks={
            feedback
              ? {
                  guide: null,
                  missing: [],
                  extra: [],
                  mistakes: feedback.mistakes.flatMap((m) => m.pixels),
                }
              : undefined
          }
          below={tiling ? <TilingPreview drawing={drawing} /> : undefined}
        >
          {problem && <WarningBanner>{STORAGE_MESSAGES[problem]}</WarningBanner>}
        </DrawingEditor>
        <aside className="card lesson-panel" aria-labelledby="prompt-title">
          <p className="hint">{label}</p>
          <h1 id="prompt-title">{title}</h1>
          <p className="hint">{intro}</p>
          <div className="lesson-actions">
            <button type="button" className="btn" onClick={() => setCheckedEditor(editor)}>
              Check drawing
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saving || inGallery}
              onClick={() => void saveToGallery()}
            >
              {inGallery ? 'Saved to the Gallery' : 'Save to Gallery'}
            </button>
            <button type="button" className="btn" onClick={dailyPrompt.another}>
              Give me another
            </button>
          </div>
          {inGallery && (
            <p className="hint">
              In the <a href={routeHref.gallery}>Gallery</a>. Changes you make keep it up to date.
            </p>
          )}
          {feedback && (
            <>
              <section aria-labelledby="checks-title">
                <h2 id="checks-title">{checksTitle}</h2>
                <ul className="prompt-checks">
                  {feedback.checks.map(({ label: checkLabel, outcome }) => (
                    <li key={checkLabel}>
                      <span className={`prompt-check prompt-check-${outcome}`}>
                        {OUTCOME_NAMES[outcome]}
                      </span>{' '}
                      {checkLabel}
                    </li>
                  ))}
                </ul>
              </section>
              <MistakeList mistakes={feedback.mistakes} />
              <p className="hint">The check updates as you draw.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
