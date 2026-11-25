import { Check, ClipboardCopy, Download, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Lesson } from '../core/lesson';
import { MODES, type Mode } from '../core/lesson';
import { personalLessonManifest } from '../core/personal-lesson';
import { exportPng } from '../core/png';
import type { StorageProblem } from '../persistence/store';
import { downloadFile } from './download';
import { hasPassed, type Progress } from '../core/progress';
import { useCourse, type LessonEntry } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { personalLessonEntry, usePersonalLessons } from './personal-lessons-store';
import { useCourseProgress } from './progress-store';
import { lessonHref, newPersonalLessonHref } from './router';
import { unlockMessage } from './unlock-message';
import { WarningBanner } from './WarningBanner';

function ModeLink({
  lesson,
  mode,
  progress,
  locked,
}: {
  lesson: Lesson;
  mode: Mode;
  progress: Progress;
  locked: boolean;
}) {
  const name = MODE_NAMES[mode];
  if (locked) {
    return (
      <span className="btn mode-locked">
        <Lock size={16} aria-hidden="true" />
        {name}
        <span className="visually-hidden"> locked</span>
      </span>
    );
  }
  const passed = hasPassed(progress, lesson.id, mode);
  return (
    <a className={`btn${passed ? '' : ' primary'}`} href={lessonHref(lesson.id, mode)}>
      {passed && <Check size={16} aria-hidden="true" />}
      {name}
      <span className="visually-hidden">
        {' '}
        {lesson.title}
        {passed && ', passed'}
      </span>
    </a>
  );
}

export function Lessons() {
  const course = useCourse();
  const progress = useCourseProgress();
  const loading = course.status === 'loading' || progress.status === 'loading';
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="card lessons" aria-busy={loading}>
        <h1>Lessons</h1>
        {progress.status === 'ready' && progress.problem && (
          <WarningBanner>
            {progress.problem === 'full'
              ? 'browser storage is full, so the Lessons you pass may not stay unlocked.'
              : "site data is blocked, so the Lessons you pass won't stay unlocked after you leave."}
          </WarningBanner>
        )}
        {course.status === 'failed' && <p role="alert">{course.message}</p>}
        {course.status === 'ready' && progress.status === 'ready' && (
          <CourseList lessons={course.lessons} progress={progress.progress} />
        )}
        {progress.status === 'ready' && <PersonalLessons progress={progress.progress} />}
      </main>
    </div>
  );
}

function CourseList({
  lessons,
  progress,
}: {
  lessons: readonly LessonEntry[];
  progress: Progress;
}) {
  return (
    <ol className="lesson-list">
      {lessons.map(({ lesson, referenceUrl }) => {
        const lockedBy = (mode: Mode) => unlockMessage(lessons, progress, lesson.id, mode);
        const lessonLocked = lockedBy('trace');
        return (
          <li key={lesson.id} className={lessonLocked ? 'locked' : undefined}>
            <img className="lesson-thumbnail" src={referenceUrl} alt="" />
            <div>
              <h2>{lesson.title}</h2>
              <p className="hint">{lessonLocked ?? lessonSummary(lesson)}</p>
            </div>
            <ul className="mode-list" aria-label={`${lesson.title} Modes`}>
              {MODES.map((mode) => (
                <li key={mode}>
                  <ModeLink
                    lesson={lesson}
                    mode={mode}
                    progress={progress}
                    locked={lockedBy(mode) !== null}
                  />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function lessonSummary(lesson: Lesson) {
  return `${lesson.size}x${lesson.size}, ${lesson.palette.length} colors, ${lesson.steps.length} Steps`;
}

function downloadReference(lesson: Lesson) {
  downloadFile(
    new Blob([exportPng(lesson.reference, 1) as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
    'reference.png',
  );
}

const PERSONAL_STORAGE_MESSAGES: Record<StorageProblem, string> = {
  full: 'browser storage is full, so your Personal Lessons could not be read.',
  unavailable: "site data is blocked, so Personal Lessons can't be kept.",
};

function PersonalLessons({ progress }: { progress: Progress }) {
  const personal = usePersonalLessons();
  const [copied, setCopied] = useState<{ lessonId: string; text: string } | null>(null);

  async function copyManifest(lesson: Lesson) {
    const manifest = `${JSON.stringify(personalLessonManifest(lesson), null, 2)}\n`;
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied({ lessonId: lesson.id, text: 'Manifest copied.' });
    } catch {
      setCopied({ lessonId: lesson.id, text: 'The manifest could not be copied.' });
    }
  }

  return (
    <section aria-labelledby="personal-lessons-heading" className="personal-lessons">
      <div className="section-heading">
        <h2 id="personal-lessons-heading">Personal Lessons</h2>
        <a className="btn" href={newPersonalLessonHref}>
          <Plus size={16} aria-hidden="true" /> Make a Personal Lesson
        </a>
      </div>
      {personal.status === 'ready' && personal.problem && (
        <WarningBanner>{PERSONAL_STORAGE_MESSAGES[personal.problem]}</WarningBanner>
      )}
      {personal.status === 'ready' && personal.lessons.length === 0 && (
        <p className="hint">Upload a sprite of your own to turn it into a Lesson.</p>
      )}
      {personal.status === 'ready' && personal.lessons.length > 0 && (
        <ul className="lesson-list">
          {personal.lessons.map((lesson) => (
            <li key={lesson.id}>
              <img
                className="lesson-thumbnail"
                src={personalLessonEntry(lesson).referenceUrl}
                alt=""
              />
              <div>
                <h3>{lesson.title}</h3>
                <p className="hint">{lessonSummary(lesson)}</p>
                <div className="personal-lesson-actions">
                  <button type="button" className="btn" onClick={() => void copyManifest(lesson)}>
                    <ClipboardCopy size={16} aria-hidden="true" /> Copy manifest
                    <span className="visually-hidden"> of {lesson.title}</span>
                  </button>
                  <button type="button" className="btn" onClick={() => downloadReference(lesson)}>
                    <Download size={16} aria-hidden="true" /> Download reference.png
                    <span className="visually-hidden"> of {lesson.title}</span>
                  </button>
                  <span role="status" className="hint">
                    {copied?.lessonId === lesson.id && copied.text}
                  </span>
                </div>
              </div>
              <ul className="mode-list" aria-label={`${lesson.title} Modes`}>
                {MODES.map((mode) => (
                  <li key={mode}>
                    <ModeLink lesson={lesson} mode={mode} progress={progress} locked={false} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
