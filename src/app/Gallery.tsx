import { passesLesson } from '../core/evaluate';
import type { Attempt, StorageProblem } from '../persistence/store';
import type { GalleryEntry } from '../persistence/gallery';
import { gallery, useGallery } from './gallery-store';
import { useCourse } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { percent } from './percent';
import { plural } from './plural';
import { lessonAttemptsHref, routeHref } from './router';
import { studio } from './studio-store';
import { dateTime, thumbnail } from './thumbnail';
import { WarningBanner } from './WarningBanner';

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable: 'site data is blocked, so nothing you make can be kept in the Gallery.',
  full: 'browser storage is full, so the Gallery could not be read.',
};

function useLessonTitle() {
  const course = useCourse();
  return (lessonId: string) =>
    (course.status === 'ready'
      ? course.lessons.find((l) => l.lesson.id === lessonId)?.lesson.title
      : undefined) ?? lessonId;
}

function flashes(hintFlashes: number) {
  return `Show me used ${plural(hintFlashes, 'time')}`;
}

async function openInStudio(id: string) {
  await studio.load();
  studio.open(id);
  window.location.hash = routeHref.studio;
}

function Thumbnail({ entry }: { entry: Pick<GalleryEntry, 'drawing'> }) {
  const { drawing } = entry;
  return (
    <img
      className="gallery-image"
      src={thumbnail(drawing)}
      alt=""
      style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }}
    />
  );
}

function GalleryCard({ entry, title }: { entry: GalleryEntry; title: (id: string) => string }) {
  if (entry.kind === 'studio') {
    return (
      <article
        className="gallery-card"
        aria-label={`Studio drawing, ${dateTime.format(entry.date)}`}
      >
        <Thumbnail entry={entry} />
        <h2>Studio drawing</h2>
        <p className="hint">
          {entry.drawing.width}x{entry.drawing.height}, {dateTime.format(entry.date)}
        </p>
        <button type="button" className="btn" onClick={() => void openInStudio(entry.id)}>
          Open in Studio
        </button>
      </article>
    );
  }
  const lessonTitle = title(entry.lessonId);
  return (
    <article
      className="gallery-card"
      aria-label={`${lessonTitle} in ${MODE_NAMES[entry.mode]}, ${dateTime.format(entry.date)}`}
    >
      <Thumbnail entry={entry} />
      <h2>{lessonTitle}</h2>
      <p className="hint">{dateTime.format(entry.date)}</p>
      <p>
        {MODE_NAMES[entry.mode]}, {percent(entry.score)}
        {entry.mode === 'hint' && `, ${flashes(entry.hintFlashes)}`}
      </p>
      <a className="btn" href={lessonAttemptsHref(entry.lessonId)}>
        All Attempts<span className="visually-hidden"> at {lessonTitle}</span>
      </a>
    </article>
  );
}

export function Gallery() {
  const state = useGallery();
  const title = useLessonTitle();
  return (
    <div className="page">
      <Nav current="gallery" />
      <main className="card gallery" aria-busy={state.status === 'loading'}>
        <h1>Gallery</h1>
        {state.status === 'ready' && (
          <>
            {state.problem && <WarningBanner>{STORAGE_MESSAGES[state.problem]}</WarningBanner>}
            {state.entries.length === 0 ? (
              <p className="hint">
                Nothing here yet. Lessons you pass and your Studio drawings show up here.
              </p>
            ) : (
              <ul className="gallery-list">
                {state.entries.map((entry) => (
                  <li key={`${entry.kind}/${entry.id}`}>
                    <GalleryCard entry={entry} title={title} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AttemptCard({ attempt, number }: { attempt: Attempt; number: number }) {
  const passed = passesLesson(attempt.score);
  return (
    <article className="gallery-card" aria-label={`Attempt ${number}`}>
      <Thumbnail entry={attempt} />
      <h2>Attempt {number}</h2>
      <p className="hint">{dateTime.format(attempt.finishedAt)}</p>
      <p>
        {MODE_NAMES[attempt.mode]}, {percent(attempt.score)}, {passed ? 'passed' : 'not passed'}
        {attempt.mode === 'hint' && `, ${flashes(attempt.hintFlashes)}`}
      </p>
      {attempt.inGallery ? (
        <p className="hint">In the Gallery</p>
      ) : (
        <button type="button" className="btn" onClick={() => void gallery.saveAttempt(attempt.id)}>
          Save to Gallery
        </button>
      )}
    </article>
  );
}

export function LessonAttempts({ lessonId }: { lessonId: string }) {
  const state = useGallery();
  const lessonTitle = useLessonTitle()(lessonId);
  const attempts = state.status === 'ready' ? (state.attemptsByLesson.get(lessonId) ?? []) : [];
  return (
    <div className="page">
      <Nav current="gallery" />
      <main className="card gallery" aria-busy={state.status === 'loading'}>
        <a className="hint" href={routeHref.gallery}>
          Back to the Gallery
        </a>
        <h1>{lessonTitle} Attempts</h1>
        {state.status === 'ready' && (
          <>
            {state.problem && <WarningBanner>{STORAGE_MESSAGES[state.problem]}</WarningBanner>}
            {attempts.length === 0 ? (
              <p className="hint">No Attempts at {lessonTitle} yet.</p>
            ) : (
              <>
                <p className="hint">{plural(attempts.length, 'Attempt')}, oldest first.</p>
                <ol className="gallery-list">
                  {attempts.map((attempt, i) => (
                    <li key={attempt.id}>
                      <AttemptCard attempt={attempt} number={i + 1} />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
