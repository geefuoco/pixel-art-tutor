import { lessonHref } from './router';
import { Nav } from './Nav';
import { useCourse } from './lessons-store';

export function Lessons() {
  const course = useCourse();
  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="card lessons" aria-busy={course.status === 'loading'}>
        <h1>Lessons</h1>
        {course.status === 'failed' && <p role="alert">{course.message}</p>}
        {course.status === 'ready' && (
          <ol className="lesson-list">
            {course.lessons.map(({ lesson, referenceUrl }) => (
              <li key={lesson.id}>
                <img className="lesson-thumbnail" src={referenceUrl} alt="" />
                <div>
                  <h2>{lesson.title}</h2>
                  <p className="hint">
                    {lesson.size}x{lesson.size}, {lesson.palette.length} colors,{' '}
                    {lesson.steps.length} Steps
                  </p>
                </div>
                <a className="btn primary" href={lessonHref(lesson.id, 'trace')}>
                  Trace {lesson.title}
                </a>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
