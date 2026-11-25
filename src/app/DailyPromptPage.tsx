import { useState, useSyncExternalStore } from 'react';
import type { Editor } from '../core/editor';
import { themePromptText, type ThemePrompt } from '../core/theme-prompt';
import { themePromptFeedback, type CheckOutcome } from '../core/theme-prompt-feedback';
import type { StorageProblem } from '../persistence/store';
import { formatCalendarDate } from './calendar-date-format';
import { dailyPrompt, useDailyPrompt } from './daily-prompt-store';
import { DrawingEditor } from './DrawingEditor';
import { MistakeList } from './MistakeList';
import { Nav } from './Nav';
import { routeHref } from './router';
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
  return (
    <ThemePromptSession
      prompt={state.prompt}
      editor={state.editor}
      inGallery={state.inGallery}
      problem={state.problem}
    />
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
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [checkedPrompt, setCheckedPrompt] = useState<ThemePrompt | null>(null);
  const [saving, setSaving] = useState(false);
  const feedback = checkedPrompt === prompt ? themePromptFeedback(prompt, drawing) : null;

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
        >
          {problem && <WarningBanner>{STORAGE_MESSAGES[problem]}</WarningBanner>}
        </DrawingEditor>
        <aside className="card lesson-panel" aria-labelledby="prompt-title">
          <p className="hint">
            Daily Prompt for {formatCalendarDate(prompt.date)}
            {prompt.draw > 0 && `, prompt ${prompt.draw + 1}`}
          </p>
          <h1 id="prompt-title">{themePromptText(prompt)}</h1>
          <p className="hint">
            A Theme Prompt is not scored. Check your drawing to see its Mistakes and which parts of
            the prompt it meets. Your drawing is kept as you go.
          </p>
          <div className="lesson-actions">
            <button type="button" className="btn" onClick={() => setCheckedPrompt(prompt)}>
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
                <h2 id="checks-title">The prompt</h2>
                <ul className="prompt-checks">
                  {feedback.checks.map(({ label, outcome }) => (
                    <li key={label}>
                      <span className={`prompt-check prompt-check-${outcome}`}>
                        {OUTCOME_NAMES[outcome]}
                      </span>{' '}
                      {label}
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
