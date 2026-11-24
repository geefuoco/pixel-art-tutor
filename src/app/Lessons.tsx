import { Check, Lock } from 'lucide-react';
import { MODES, type Mode } from '../core/lesson';
import { hasPassed, lessonUnlocked, modeUnlocked, type Progress } from '../core/progress';
import { useCourse, type CourseLesson } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';
import { useCourseProgress } from './progress-store';
import { lessonHref } from './router';

function ModeLink({
  lesson,
  mode,
  progress,
  lessonOpen,
}: {
  lesson: CourseLesson['lesson'];
  mode: Mode;
  progress: Progress;
  lessonOpen: boolean;
}) {
  const name = MODE_NAMES[mode];
  if (!lessonOpen || !modeUnlocked(progress, lesson.id, mode)) {
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
  const ids = lessons.map((l) => l.lesson.id);
  return (
    <ol className="lesson-list">
      {lessons.map(({ lesson, referenceUrl }, i) => {
        const open = lessonUnlocked(ids, progress, lesson.id);
        const previous = lessons[i - 1]?.lesson;
        return (
          <li key={lesson.id} className={open ? undefined : 'locked'}>
            <img className="lesson-thumbnail" src={referenceUrl} alt="" />
            <div>
              <h2>{lesson.title}</h2>
              <p className="hint">
                {open || !previous
                  ? `${lesson.size}x${lesson.size}, ${lesson.palette.length} colors, ${lesson.steps.length} Steps`
                  : `Locked. Pass ${previous.title} in Trace to unlock it.`}
              </p>
            </div>
            <ul className="mode-list" aria-label={`${lesson.title} Modes`}>
              {MODES.map((mode) => (
                <li key={mode}>
                  <ModeLink lesson={lesson} mode={mode} progress={progress} lessonOpen={open} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
