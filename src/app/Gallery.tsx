import type { ReactNode } from 'react';
import type { Drawing } from '../core/drawing';
import { passesLesson } from '../core/evaluate';
import type { GalleryEntry, GalleryState } from '../persistence/gallery';
import type { Attempt, SavedDrawing, StorageProblem } from '../persistence/store';
import { dateTime } from './date-time';
import { gallery, useGallery } from './gallery-store';
import { useCourse } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { percent } from './percent';
import { plural } from './plural';
import { lessonAttemptsHref, routeHref } from './router';
import { studio } from './studio-store';
import { thumbnail } from './thumbnail';
import { WarningBanner } from './WarningBanner';

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable: 'site data is blocked, so nothing you make can be kept in the Gallery.',
  full: 'browser storage is full, so the Gallery could not be read.',
};

type TitleOf = (lessonId: string) => string;

function useLessonTitles(): TitleOf {
  const course = useCourse();
  return (lessonId) =>
    (course.status === 'ready'
      ? course.lessons.find((l) => l.lesson.id === lessonId)?.lesson.title
      : undefined) ?? lessonId;
}

async function openInStudio(id: string) {
  await studio.load();
  studio.open(id);
  window.location.hash = routeHref.studio;
}

function Thumbnail({ drawing }: { drawing: Drawing }) {
  return (
    <img
      className="gallery-image"
      src={thumbnail(drawing)}
      alt=""
      style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }}
    />
  );
}

function attemptOutcome(attempt: Attempt, { showPass }: { showPass: boolean }) {
  return [
    MODE_NAMES[attempt.mode],
    percent(attempt.score),
    ...(showPass ? [passesLesson(attempt.score) ? 'passed' : 'not passed'] : []),
    ...(attempt.mode === 'hint' ? [`Show me used ${plural(attempt.hintFlashes, 'time')}`] : []),
  ].join(', ');
}

function DrawingCard({
  label,
  drawing,
  heading,
  date,
  children,
}: {
  label: string;
  drawing: Drawing;
  heading: string;
  date: string;
  children: ReactNode;
}) {
  return (
    <article className="gallery-card" aria-label={label}>
      <Thumbnail drawing={drawing} />
      <h2>{heading}</h2>
      <p className="hint">{date}</p>
      {children}
    </article>
  );
}

function StudioCard({ studioDrawing }: { studioDrawing: SavedDrawing }) {
  const { id, drawing, updatedAt } = studioDrawing;
  const date = dateTime.format(updatedAt);
  return (
    <DrawingCard
      label={`Studio drawing, ${date}`}
      drawing={drawing}
      heading="Studio drawing"
      date={`${drawing.width}x${drawing.height}, ${date}`}
    >
      <button type="button" className="btn" onClick={() => void openInStudio(id)}>
        Open in Studio
      </button>
    </DrawingCard>
  );
}

function GalleryAttemptCard({ attempt, titleOf }: { attempt: Attempt; titleOf: TitleOf }) {
  const lessonTitle = titleOf(attempt.lessonId);
  const date = dateTime.format(attempt.finishedAt);
  return (
    <DrawingCard
      label={`${lessonTitle} in ${MODE_NAMES[attempt.mode]}, ${date}`}
      drawing={attempt.drawing}
      heading={lessonTitle}
      date={date}
    >
      <p>{attemptOutcome(attempt, { showPass: false })}</p>
      <a className="btn" href={lessonAttemptsHref(attempt.lessonId)}>
        All Attempts<span className="visually-hidden"> at {lessonTitle}</span>
      </a>
    </DrawingCard>
  );
}

function GalleryCard({ entry, titleOf }: { entry: GalleryEntry; titleOf: TitleOf }) {
  return entry.kind === 'studio' ? (
    <StudioCard studioDrawing={entry.studioDrawing} />
  ) : (
    <GalleryAttemptCard attempt={entry.attempt} titleOf={titleOf} />
  );
}

function GalleryPage({
  state,
  children,
}: {
  state: GalleryState;
  children: (ready: Extract<GalleryState, { status: 'ready' }>) => ReactNode;
}) {
  return (
    <div className="page">
      <Nav current="gallery" />
      <main className="card gallery" aria-busy={state.status === 'loading'}>
        {state.status === 'ready' && (
          <>
            {state.problem && <WarningBanner>{STORAGE_MESSAGES[state.problem]}</WarningBanner>}
            {children(state)}
          </>
        )}
      </main>
    </div>
  );
}

export function Gallery() {
  const state = useGallery();
  const titleOf = useLessonTitles();
  return (
    <GalleryPage state={state}>
      {({ entries }) => (
        <>
          <h1>Gallery</h1>
          {entries.length === 0 ? (
            <p className="hint">
              Nothing here yet. Lessons you pass and your Studio drawings show up here.
            </p>
          ) : (
            <ul className="gallery-list">
              {entries.map((entry) => (
                <li
                  key={
                    entry.kind === 'studio'
                      ? `studio/${entry.studioDrawing.id}`
                      : `attempt/${entry.attempt.id}`
                  }
                >
                  <GalleryCard entry={entry} titleOf={titleOf} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </GalleryPage>
  );
}

function NumberedAttemptCard({ attempt, number }: { attempt: Attempt; number: number }) {
  return (
    <DrawingCard
      label={`Attempt ${number}`}
      drawing={attempt.drawing}
      heading={`Attempt ${number}`}
      date={dateTime.format(attempt.finishedAt)}
    >
      <p>{attemptOutcome(attempt, { showPass: true })}</p>
      {attempt.inGallery ? (
        <p className="hint">In the Gallery</p>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => void gallery.saveAttemptToGallery(attempt.id)}
        >
          Save to Gallery
        </button>
      )}
    </DrawingCard>
  );
}

export function LessonAttempts({ lessonId }: { lessonId: string }) {
  const state = useGallery();
  const lessonTitle = useLessonTitles()(lessonId);
  return (
    <GalleryPage state={state}>
      {({ attemptsByLesson }) => {
        const attempts = attemptsByLesson.get(lessonId) ?? [];
        return (
          <>
            <a className="hint" href={routeHref.gallery}>
              Back to the Gallery
            </a>
            <h1>{lessonTitle} Attempts</h1>
            {attempts.length === 0 ? (
              <p className="hint">No Attempts at {lessonTitle} yet.</p>
            ) : (
              <>
                <p className="hint">{plural(attempts.length, 'Attempt')}, oldest first.</p>
                <ol className="gallery-list">
                  {attempts.map((attempt, i) => (
                    <li key={attempt.id}>
                      <NumberedAttemptCard attempt={attempt} number={i + 1} />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        );
      }}
    </GalleryPage>
  );
}
