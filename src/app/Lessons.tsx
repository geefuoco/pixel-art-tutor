import { Check, Lock } from 'lucide-react';
import { MODES, type Mode } from '../core/lesson';
import { hasPassed, type Progress } from '../core/progress';
import { useCourse, type CourseLesson } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { useCourseProgress } from './progress-store';
import { lessonHref } from './router';
import { unlockMessage } from './unlock-message';
import { WarningBanner } from './WarningBanner';

function ModeLink({
  lesson,
  mode,
  progress,
  locked,
}: {
  lesson: CourseLesson['lesson'];
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
      </main>
    </div>
  );
}

function CourseList({
  lessons,
  progress,
}: {
  lessons: readonly CourseLesson[];
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
              <p className="hint">
                {lessonLocked ??
                  `${lesson.size}x${lesson.size}, ${lesson.palette.length} colors, ${lesson.steps.length} Steps`}
              </p>
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
